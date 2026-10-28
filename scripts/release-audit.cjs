/* eslint-env node */
// The dependency audit of CI and the release (npm run audit:dependencies):
// `npm audit` at level low, as before, with a short list of accepted
// advisories. Each accepted advisory names its package, the reason and the
// last day it is accepted; from the next day it fails the audit again. Any
// other advisory, and an audit that gives no report, fails.
const { spawnSync } = require('node:child_process');

const ACCEPTED = [
  {
    id: 'GHSA-gcqx-w48m-w2h4',
    package: 'deepmerge',
    until: '2026-12-31',
    reason: 'No patched deepmerge exists (4.2.0 to 4.3.1, the newest, are affected). Only jest-config and '
      + '@svgr/plugin-svgo use it, to merge our own config at test and build time. None of it ships in the widget bundle.',
  },
];

// npm audit --audit-level=low fails on low and above; info does not fail.
const FAILING = new Set(['low', 'moderate', 'high', 'critical']);
const advisoryId = (url) => String(url || '').split('/').pop();
const today = () => new Date().toISOString().slice(0, 10);

/**
 * The advisories in an `npm audit --json` report (version 2) that fail the
 * audit. A package that is only listed because it depends on a vulnerable
 * package (a name in `via`) adds none of its own.
 */
function failingAdvisories(report, day = today(), accepted = ACCEPTED) {
  if (!report || report.auditReportVersion !== 2 || typeof report.vulnerabilities !== 'object' || report.error) {
    throw new Error('npm audit gave no report.');
  }
  const failing = [];
  for (const [name, entry] of Object.entries(report.vulnerabilities)) {
    for (const via of entry.via || []) {
      if (typeof via === 'string' || !FAILING.has(via.severity)) continue;
      const id = advisoryId(via.url);
      const rule = accepted.find((item) => item.id === id && item.package === via.name);
      if (!rule || day > rule.until) failing.push({ package: name, id, severity: via.severity, title: via.title, expired: Boolean(rule) });
    }
  }
  return failing;
}

/** The accepted advisories that this report holds, for the log. */
function acceptedAdvisories(report, day = today(), accepted = ACCEPTED) {
  const ids = new Set(Object.values(report.vulnerabilities).flatMap((entry) => (entry.via || [])
    .filter((via) => typeof via !== 'string').map((via) => `${via.name} ${advisoryId(via.url)}`)));
  return accepted.filter((rule) => day <= rule.until && ids.has(`${rule.package} ${rule.id}`));
}

function main() {
  const audit = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  let report = null;
  try { report = JSON.parse(audit.stdout); } catch { /* reported below */ }
  const failing = failingAdvisories(report);
  for (const rule of acceptedAdvisories(report)) {
    console.log(`Accepted until ${rule.until}: ${rule.package} ${rule.id}. ${rule.reason}`);
  }
  if (failing.length) {
    for (const item of failing) {
      console.error(`${item.severity}: ${item.package} ${item.id} ${item.title || ''}${item.expired ? ' (its acceptance has ended)' : ''}`);
    }
    console.error(`${failing.length} advisory(ies) fail the audit. Run \`npm audit\` for details.`);
    process.exitCode = 1;
    return;
  }
  console.log('The dependency audit found no other advisory.');
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { ACCEPTED, acceptedAdvisories, failingAdvisories };
