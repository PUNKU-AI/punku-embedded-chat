/* eslint-env node */
const assert = require('node:assert/strict');
const test = require('node:test');
const { ACCEPTED, acceptedAdvisories, failingAdvisories } = require('./release-audit.cjs');

// The shape of `npm audit --json` (report version 2): the advisory sits on the
// vulnerable package; the packages that depend on it only name it in `via`.
const advisory = (name, id, severity = 'low') => ({
  source: 1, name, title: `${name} synthetic advisory`, url: `https://github.com/advisories/${id}`, severity, range: '*',
});
const report = (...entries) => ({
  auditReportVersion: 2,
  vulnerabilities: Object.fromEntries(entries.map(([name, via]) => [name, { name, severity: 'low', via }])),
});
const deepmerge = ['deepmerge', [advisory('deepmerge', 'GHSA-gcqx-w48m-w2h4')]];
const dependents = [['jest-config', ['deepmerge']], ['@svgr/plugin-svgo', ['deepmerge']]];

test('passes the accepted deepmerge advisory and the packages that depend on it', () => {
  const shown = report(deepmerge, ...dependents);
  assert.deepEqual(failingAdvisories(shown, '2026-10-28'), []);
  assert.deepEqual(acceptedAdvisories(shown, '2026-10-28').map((rule) => rule.id), ['GHSA-gcqx-w48m-w2h4']);
});

test('fails any other advisory, also next to the accepted one', () => {
  const failing = failingAdvisories(report(deepmerge, ['left-pad', [advisory('left-pad', 'GHSA-0000-0000-0000', 'moderate')]]), '2026-10-28');
  assert.deepEqual(failing.map((item) => `${item.package} ${item.id} ${item.severity}`), ['left-pad GHSA-0000-0000-0000 moderate']);
});

test('fails the accepted advisory after its last day', () => {
  const [rule] = ACCEPTED;
  assert.deepEqual(failingAdvisories(report(deepmerge), rule.until), []);
  const failing = failingAdvisories(report(deepmerge), '2027-01-01');
  assert.deepEqual(failing.map((item) => [item.id, item.expired]), [['GHSA-gcqx-w48m-w2h4', true]]);
});

test('passes the glob and minimatch advisories of the test tools until 2026-11-30, then fails them', () => {
  // The copies inside jest, test-exclude and typescript-estree name the same advisories.
  const tools = report(
    ['glob', [advisory('glob', 'GHSA-3g3m-2fjr-6pw4', 'moderate')]],
    ['minimatch', [advisory('minimatch', 'GHSA-g3hv-75wg-m249', 'moderate')]],
    ['test-exclude', ['glob', 'minimatch']],
  );
  assert.deepEqual(failingAdvisories(tools, '2026-11-30'), []);
  assert.deepEqual(acceptedAdvisories(tools, '2026-11-30').map((rule) => rule.package), ['glob', 'minimatch']);
  const failing = failingAdvisories(tools, '2026-12-01');
  assert.deepEqual(failing.map((item) => [item.package, item.expired]), [['glob', true], ['minimatch', true]]);
});

test('accepts an advisory only for its own package', () => {
  const failing = failingAdvisories(report(['other-merge', [advisory('other-merge', 'GHSA-gcqx-w48m-w2h4')]]), '2026-10-28');
  assert.equal(failing.length, 1);
});

test('ignores info advisories, as npm audit --audit-level=low does', () => {
  assert.deepEqual(failingAdvisories(report(['notice', [advisory('notice', 'GHSA-1111-1111-1111', 'info')]]), '2026-10-28'), []);
});

test('fails when npm audit gives no report', () => {
  assert.throws(() => failingAdvisories(null), /no report/);
  assert.throws(() => failingAdvisories({ error: { code: 'ENOAUDIT' } }), /no report/);
  assert.throws(() => failingAdvisories({ auditReportVersion: 1, advisories: {} }), /no report/);
});
