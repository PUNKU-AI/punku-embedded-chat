/* eslint-disable no-template-curly-in-string -- GitHub expressions are literal workflow values. */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const yaml = require('js-yaml');

const repoRoot = path.resolve(__dirname, '..');
const readText = (filename) => fs.readFileSync(path.join(repoRoot, filename), 'utf8');
const readYaml = (filename) => yaml.load(readText(filename));
const ci = readYaml('.github/workflows/ci.yml');
const release = readYaml('.github/workflows/publish-cdn.yml');
const checks = readYaml('.github/workflows/widget-checks.yml');
const sharedChecks = './.github/workflows/widget-checks.yml';
const { build, browser, report } = checks.jobs;
const tagJob = release.jobs.tag;
const validate = release.jobs.validate;
const publish = release.jobs.publish;
const partner = release.jobs.partner;
const restore = release.jobs.restore;
const workflows = [ci, release, checks];
const workflowDir = path.join(repoRoot, '.github', 'workflows');
const RELEASE_ENVIRONMENT = 'cdn-release';
const playwrightConfig = readText('playwright.config.ts');
const playwrightProjects = [...playwrightConfig.matchAll(/\{ name: '([^']+)'/g)].map((match) => match[1]);
const rebuild = /npm\s+run\s+build(?::(?:release|react|bundle|browser-tests))?(?:\s|$)|build-widget-bundle\.cjs|react-scripts\s+build|\bwebpack\b/;
const { BUNDLE_PATH, FILES, FORWARDER_PATH, MIN_BUNDLE_BYTES, recordBundleIdentity } = require('./release-bundle.cjs');
const releaseFiles = [
  'dist/build/static/js/widget.min.js',
  'dist/build/static/js/widget.min.js.LICENSE.txt',
  'output/playwright/bundle-manifest.json',
];

function uniqueStep(steps, predicate, description) {
  const matches = steps.filter(predicate);
  assert.equal(matches.length, 1, `Expected one ${description} step`);
  return matches[0];
}

function condition(value) {
  return String(value).replace(/^\s*\$\{\{\s*|\s*\}\}\s*$/g, '').trim();
}

function assertOrdered(steps, selected) {
  const indexes = selected.map((step) => steps.indexOf(step));
  assert.ok(indexes.every((index) => index >= 0), 'Every required gate must exist');
  assert.ok(indexes.every((index, position) => position === 0 || index > indexes[position - 1]),
    'Required gates must keep their execution order');
}

function paths(value) {
  return value.trim().split(/\s+/);
}

const tagStep = uniqueStep(tagJob.steps, (step) => step.id === 'ref', 'release tag validation');
const purgeStep = uniqueStep(publish.steps, (step) => step.id === 'jsdelivr-purge', 'jsDelivr purge');

function runTagStep(env) {
  const outputFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'widget-release-tag-')), 'output');
  fs.writeFileSync(outputFile, '');
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', tagStep.run], {
    env: { PATH: process.env.PATH, GITHUB_OUTPUT: outputFile, DRY_RUN: '', RESTORE_TAG: '', RUN_REF: '', RUN_SHA: '', ...env },
    encoding: 'utf8',
  });
  const outputs = Object.fromEntries(fs.readFileSync(outputFile, 'utf8').trim().split('\n').filter(Boolean)
    .map((line) => line.split(/=(.*)/s).slice(0, 2)));
  fs.rmSync(path.dirname(outputFile), { recursive: true, force: true });
  return { status: result.status, outputs };
}

test('publication requires successful validation with real Gemini and committed bundle checks', () => {
  assert.deepEqual([publish.needs].flat(), ['tag', 'validate', 'partner']);
  assert.equal(condition(publish.if), "!cancelled() && needs.validate.result == 'success' && needs.tag.outputs.publish == 'true'"
    + " && (needs.partner.result == 'success' || needs.partner.result == 'skipped')");
  assert.equal(validate.uses, sharedChecks);
  assert.equal(validate.needs, 'tag');
  assert.equal(condition(validate.if), "needs.tag.outputs.restore == ''", 'Only a restore, which publishes no new bundle, skips the checks');
  assert.equal(validate.with.real_gemini, true);
  assert.equal(validate.with.check_committed_bundle, true);
  assert.equal(validate.secrets.GEMINI_API_KEY, '${{ secrets.GEMINI_API_KEY }}');
  for (const workflow of [release, checks]) {
    for (const job of Object.values(workflow.jobs)) {
      assert.equal(job['continue-on-error'], undefined);
      for (const step of job.steps || []) {
        if (step !== purgeStep) assert.equal(step['continue-on-error'], undefined);
      }
    }
  }
});

function runPurgeStep(curlScript) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-release-purge-'));
  const log = path.join(dir, 'urls');
  fs.writeFileSync(path.join(dir, 'curl'), `#!/bin/bash\nfor a; do URL="$a"; done\necho "$URL" >> "${log}"\n${curlScript}\n`,
    { mode: 0o755 });
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', purgeStep.run], {
    cwd: dir,
    env: { PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: 'PUNKU-AI/punku-embedded-chat', MAJOR: 'v1' },
    encoding: 'utf8',
  });
  const urls = fs.readFileSync(log, 'utf8').trim().split('\n');
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: result.status, stdout: result.stdout, urls };
}

test('the jsDelivr purge runs last, after the CloudFront invalidation, and never fails a release', () => {
  const invalidation = uniqueStep(publish.steps, (step) => /aws\s+cloudfront\s+create-invalidation/.test(step.run || ''),
    'CloudFront invalidation');
  assert.equal(publish.steps.at(-1), purgeStep, 'The purge must be the last publish step');
  assertOrdered(publish.steps, [invalidation, purgeStep]);
  assert.equal(purgeStep['continue-on-error'], true);
  assert.equal(purgeStep.if, undefined);
  assert.equal(purgeStep.env.MAJOR, '${{ steps.v.outputs.major }}');
  assert.doesNotMatch(purgeStep.run, /\$\{\{|\baws\s/);
  const prefix = 'https://purge.jsdelivr.net/gh/PUNKU-AI/punku-embedded-chat';
  // Each alias serves the forwarder (bundle.min.js) and the widget it falls back to (widget.min.js).
  const expected = ['@v1', '', '@latest'].flatMap((ref) => [FORWARDER_PATH, BUNDLE_PATH].map((file) => `${prefix}${ref}/${file}`));
  const purged = runPurgeStep(`echo '{"status":"finished"}' > purge-response.json; printf 200`);
  assert.equal(purged.status, 0);
  assert.deepEqual(purged.urls, expected);
  assert.equal(purged.stdout.match(/"status":"finished"/g).length, 6, 'Each response must reach the log');
  assert.doesNotMatch(purged.stdout, /::warning::/);
  const refused = runPurgeStep('printf 403');
  assert.equal(refused.status, 0);
  assert.deepEqual(refused.urls, expected, 'A refused purge must not stop the other aliases');
  assert.match(refused.stdout, /::warning::jsDelivr purge of '@v1' bundle\.min\.js answered HTTP 403/);
  assert.match(refused.stdout, /::warning::jsDelivr purge of '@v1' widget\.min\.js answered HTTP 403/);
  const offline = runPurgeStep('printf 000; exit 28');
  assert.equal(offline.status, 0);
  assert.deepEqual(offline.urls, expected);
  assert.match(offline.stdout, /::warning::jsDelivr purge of 'no version' widget\.min\.js answered HTTP 000/);
});

test('CI and releases call the same widget checks', () => {
  const widget = ci.jobs.widget;
  assert.equal(widget.uses, sharedChecks);
  assert.equal(widget.secrets.GEMINI_API_KEY, '${{ secrets.GEMINI_API_KEY }}');
  assert.equal(condition(widget.with.real_gemini),
    "github.actor != 'dependabot[bot]' && (github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository)");
  assert.equal(widget.with.check_committed_bundle, undefined, 'PRs need not commit a rebuilt bundle');
  const call = checks.on.workflow_call;
  assert.deepEqual(Object.keys(call.inputs).sort(), ['bundle_artifact_name', 'check_committed_bundle', 'real_gemini']);
  assert.equal(call.inputs.real_gemini.type, 'boolean');
  assert.equal(call.inputs.check_committed_bundle.default, false);
  assert.equal(call.secrets.GEMINI_API_KEY.required, false);
  assert.equal(call.outputs.commit_sha.value, '${{ jobs.report.outputs.commit_sha }}');
  assert.equal(report.outputs.commit_sha, '${{ steps.identity.outputs.commit_sha }}');
});

test('publisher downloads the tested artifact at the validated commit without rebuilding the bundle', () => {
  const checkout = uniqueStep(publish.steps, (step) => step.uses?.startsWith('actions/checkout@'), 'publisher checkout');
  const download = uniqueStep(publish.steps, (step) => step.uses?.startsWith('actions/download-artifact@'), 'tested bundle download');
  const version = uniqueStep(publish.steps, (step) => step.id === 'v', 'version path');
  assert.equal(checkout.with.ref, '${{ needs.validate.outputs.commit_sha }}');
  assert.equal(download.with.name, validate.with.bundle_artifact_name);
  assert.equal(download.with.path, '.');
  assert.equal(version.env.RELEASE_TAG, '${{ needs.tag.outputs.tag }}');
  assertOrdered(publish.steps, [checkout, download]);
  for (const step of publish.steps) {
    assert.doesNotMatch(step.run || '', rebuild, 'Publisher must retain the tested bundle bytes');
  }
});

test('publisher verifies downloaded bytes before credentials and every upload', () => {
  const download = uniqueStep(publish.steps, (step) => step.uses?.startsWith('actions/download-artifact@'), 'tested bundle download');
  const guard = uniqueStep(publish.steps, (step) => step.run?.trim() === 'node scripts/release-bundle.cjs verify-committed', 'publication checksum guard');
  const credentials = uniqueStep(publish.steps, (step) => step.uses?.startsWith('aws-actions/configure-aws-credentials@'), 'AWS credentials');
  const uploads = publish.steps.filter((step) => /aws\s+s3\s+(?:cp|sync)|upload-lucide-icons\.sh/.test(step.run || ''));
  assert.ok(uploads.length > 0, 'Publication must include an upload');
  assert.equal(guard.if, undefined, 'The checksum guard must not be conditional');
  assertOrdered(publish.steps, [download, guard, credentials, uploads[0]]);
  for (const upload of uploads) assertOrdered(publish.steps, [guard, credentials, upload]);
  for (const step of publish.steps.filter((candidate) => /aws\s+s3\s+cp/.test(candidate.run || ''))) {
    assert.match(step.run, /aws\s+s3\s+cp\s+dist\/build\/static\/js\/widget\.min\.js\s/);
  }
});

// The S3 copies must be the tested widget. The committed bundle.min.js is the
// jsDelivr forwarder: uploaded to cdn.punku.ai, it would load itself.
const uploadSteps = publish.steps.filter((step) => /aws\s+s3\s+cp\s+dist\//.test(step.run || ''));
const forwarder = fs.readFileSync(path.join(repoRoot, FORWARDER_PATH));
const widget = Buffer.from(`/*! Synthetic widget */customElements.define("punku-chat",class{});/* ${'x'.repeat(MIN_BUNDLE_BYTES)} */`);

function git(dir, args) {
  return spawnSync('git', ['-c', 'user.name=Widget Release Tests', '-c', 'user.email=widget-release-tests@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${path.join(dir, '.git', 'no-hooks')}`, ...args], { cwd: dir, encoding: 'utf8' });
}

// A release checkout with a recorded widget, and a fake aws that stores uploads in a folder.
// AWS_UPLOAD=short stores only the first 4096 bytes, to model a broken upload.
function publishFixture(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'widget-release-upload-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = { [BUNDLE_PATH]: widget, [FILES[1]]: Buffer.from('Synthetic license.\n'), [FORWARDER_PATH]: forwarder,
    'scripts/release-bundle.cjs': fs.readFileSync(path.join(__dirname, 'release-bundle.cjs')) };
  for (const [name, bytes] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), bytes);
  }
  git(dir, ['init', '--quiet']);
  git(dir, ['add', '--', ...Object.keys(files)]);
  git(dir, ['commit', '--quiet', '-m', 'Synthetic release']);
  recordBundleIdentity(dir);
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.writeFileSync(path.join(dir, 'bin', 'aws'), `#!/bin/bash
# aws s3 cp <from> <to> [options]
echo "$3 -> $4" >> "$AWS_LOG"
case "$4" in
  s3://*) mkdir -p "$(dirname "$S3/\${4#s3://}")"
    if [ "$AWS_UPLOAD" = short ]; then head -c 4096 "$3" > "$S3/\${4#s3://}"; else cp "$3" "$S3/\${4#s3://}"; fi ;;
  *) cp "$S3/\${3#s3://}" "$4" ;;
esac
`, { mode: 0o755 });
  return dir;
}

function runUploadStep(dir, step, env = {}) {
  const script = step.run.replaceAll('${{ steps.v.outputs.tag }}', 'v1.0.99').replaceAll('${{ steps.v.outputs.major }}', 'v1');
  const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-c', script], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`, AWS_LOG: path.join(dir, 'aws.log'), S3: path.join(dir, 's3'),
      BUCKET: 'primary', BUCKET_BACKUP: 'backup', ...env },
  });
  const log = fs.existsSync(path.join(dir, 'aws.log')) ? fs.readFileSync(path.join(dir, 'aws.log'), 'utf8').trim().split('\n') : [];
  fs.rmSync(path.join(dir, 'aws.log'), { force: true });
  return { status: result.status, stderr: result.stderr, log };
}

test('the publisher uploads the widget, never the forwarder, and reads every object back', (t) => {
  assert.equal(uploadSteps.length, 2, 'One pinned and one floating upload');
  const keys = ['chat/v1.0.99/bundle.min.js', 'chat/v1/bundle.min.js'];
  for (const step of publish.steps) {
    assert.doesNotMatch(step.run || '', new RegExp(`aws\\s+s3\\s+cp\\s+${FORWARDER_PATH.replaceAll('.', '\\.')}`), 'The forwarder must never reach S3');
  }
  const dir = publishFixture(t);
  uploadSteps.forEach((step, index) => {
    const run = runUploadStep(dir, step);
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(run.log, ['primary', 'backup'].flatMap((bucket) => [
      `${BUNDLE_PATH} -> s3://${bucket}/${keys[index]}`, `s3://${bucket}/${keys[index]} -> uploaded-bundle.js`]));
    for (const bucket of ['primary', 'backup']) assert.deepEqual(fs.readFileSync(path.join(dir, 's3', bucket, keys[index])), widget);
    assert.equal(fs.existsSync(path.join(dir, 'uploaded-bundle.js')), false);
  });
  assert.equal(runUploadStep(dir, uploadSteps[0], { BUCKET_BACKUP: '' }).log.length, 2, 'The failover bucket is optional');
});

test('a forwarder or a short file on S3 fails the release before the next upload', (t) => {
  const dir = publishFixture(t);
  for (const step of uploadSteps) {
    // The source path changed to the forwarder.
    const swapped = { ...step, run: step.run.replace(`cp ${BUNDLE_PATH}`, `cp ${FORWARDER_PATH}`) };
    const forwarded = runUploadStep(dir, swapped);
    assert.notEqual(forwarded.status, 0);
    assert.match(forwarded.stderr, /forwarder, not the widget/);
    assert.equal(forwarded.log.length, 2, 'The failover bucket must not get the file');
    // An upload that stores a short file.
    const short = runUploadStep(dir, step, { AWS_UPLOAD: 'short' });
    assert.notEqual(short.status, 0);
    assert.match(short.stderr, /4096 bytes/);
    assert.equal(short.log.length, 2);
  }
});

test('the build job audits, checks types, builds once, and saves the built bundle', () => {
  const steps = build.steps;
  const checkout = uniqueStep(steps, (step) => step.uses?.startsWith('actions/checkout@'), 'build checkout');
  const audit = uniqueStep(steps, (step) => step.run?.trim() === 'npm run audit:dependencies', 'dependency audit');
  const types = uniqueStep(steps, (step) => step.run?.includes('npx tsc --noEmit'), 'application type check');
  const bundle = uniqueStep(steps, (step) => step.run?.trim() === 'npm run build:release', 'release build');
  const committed = uniqueStep(steps, (step) => step.run?.trim() === 'node scripts/release-bundle.cjs verify-committed', 'committed bundle check');
  const contracts = uniqueStep(steps, (step) => step.run?.includes('npm run test:release-contract'), 'contract check');
  const identity = uniqueStep(steps, (step) => step.id === 'identity', 'bundle identity');
  const artifact = uniqueStep(steps, (step) => step.uses?.startsWith('actions/upload-artifact@'), 'built bundle artifact');
  assertOrdered(steps, [checkout, audit, types, bundle, committed, contracts, identity, artifact]);
  assert.match(types.run, /npx eslint src --ext \.ts,\.tsx/);
  assert.match(contracts.run, /npm run test:visual-contract/);
  assert.equal(condition(committed.if), 'inputs.check_committed_bundle');
  assert.equal(identity.run.trim(), 'node scripts/release-bundle.cjs outputs >> "$GITHUB_OUTPUT"');
  for (const step of [checkout, audit, types, bundle, contracts, identity, artifact]) assert.equal(step.if, undefined);
  const packageJson = JSON.parse(readText('package.json'));
  // npm audit at level low, with a short list of accepted advisories (release-audit.cjs).
  // Each one names its package, a reason and the last day it is accepted.
  assert.equal(packageJson.scripts['audit:dependencies'], 'node scripts/release-audit.cjs');
  for (const rule of require('./release-audit.cjs').ACCEPTED) {
    assert.match(rule.id, /^GHSA(-[0-9a-z]{4}){3}$/);
    assert.ok(rule.package && rule.reason.length > 40);
    assert.match(rule.until, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(artifact.with['if-no-files-found'], 'error');
  assert.deepEqual(paths(artifact.with.path), releaseFiles);
  assert.deepEqual(build.outputs, {
    commit_sha: '${{ steps.identity.outputs.commit_sha }}',
    bundle_sha: '${{ steps.identity.outputs.bundle_sha }}',
  });
  for (const job of [browser, report]) {
    for (const step of job.steps) assert.doesNotMatch(step.run || '', rebuild, 'Only the build job may build the bundle');
  }
  assert.deepEqual(browser.container, build.container, 'Build and browser jobs must use the same pinned image');
  assert.match(build.container.image, /^mcr\.microsoft\.com\/playwright:v[\d.]+-noble@sha256:[0-9a-f]{64}$/);
});

test('every browser profile tests the downloaded bundle in its own job', () => {
  const steps = browser.steps;
  const builtArtifact = uniqueStep(build.steps, (step) => step.uses?.startsWith('actions/upload-artifact@'), 'built bundle artifact');
  const checkout = uniqueStep(steps, (step) => step.uses?.startsWith('actions/checkout@'), 'browser checkout');
  const download = uniqueStep(steps, (step) => step.uses?.startsWith('actions/download-artifact@'), 'built bundle download');
  const bytes = uniqueStep(steps, (step) => step.run?.includes('sha256sum'), 'built bundle check');
  const run = uniqueStep(steps, (step) => step.run?.includes('npm run test:browser'), 'browser check');
  const blob = uniqueStep(steps, (step) => step.uses?.startsWith('actions/upload-artifact@'), 'profile report');
  assertOrdered(steps, [checkout, download, bytes, run, blob]);
  assert.equal(browser.needs, 'build');
  assert.equal(playwrightProjects.length, 8);
  assert.deepEqual(browser.strategy.matrix.project, playwrightProjects, 'Each Playwright project needs its own job');
  assert.equal(browser.strategy['fail-fast'], false);
  assert.equal(download.with.name, builtArtifact.with.name);
  assert.equal(download.with.path, '.');
  assert.match(bytes.run, /^node scripts\/release-bundle\.cjs verify$/m);
  assert.match(bytes.run, /"\$BUNDLE_SHA {2}dist\/build\/static\/js\/widget\.min\.js" \| sha256sum --check --strict/);
  assert.equal(bytes.env.BUNDLE_SHA, '${{ needs.build.outputs.bundle_sha }}');
  assert.equal(run.run.trim(),
    'xvfb-run --auto-servernum npm run test:browser -- --project=${{ matrix.project }} --max-failures=2 --reporter=line,blob');
  assert.equal(run.env.PLAYWRIGHT_BLOB_OUTPUT_NAME, 'report-${{ matrix.project }}.zip');
  assert.equal(blob.with.path, `${run.env.PLAYWRIGHT_BLOB_OUTPUT_DIR}/${run.env.PLAYWRIGHT_BLOB_OUTPUT_NAME}`);
  assert.equal(blob.with.name, 'widget-blob-report-${{ matrix.project }}');
  assert.equal(blob.with['if-no-files-found'], 'error');
  assert.equal(condition(blob.if), '!cancelled()');
  for (const step of [checkout, download, bytes, run]) assert.equal(step.if, undefined);
  for (const job of Object.values(checks.jobs)) assert.ok(job['timeout-minutes'] <= 20, 'Each check job needs a short timeout');
});

test('the report job merges every profile, then runs Gemini, verifies identity, and saves the tested bundle', () => {
  const steps = report.steps;
  const blobs = uniqueStep(steps, (step) => step.with?.pattern, 'profile report download');
  const merge = uniqueStep(steps, (step) => step.run?.includes('merge-reports'), 'report merge');
  const gate = uniqueStep(steps, (step) => step.env?.BROWSER_RESULT, 'browser result gate');
  const gemini = uniqueStep(steps, (step) => step.run?.trim() === 'npm run test:visual-live', 'real Gemini check');
  const identity = uniqueStep(steps, (step) => step.id === 'identity', 'bundle identity check');
  const artifact = uniqueStep(steps, (step) => step.uses?.startsWith('actions/upload-artifact@')
    && step.with.name === '${{ inputs.bundle_artifact_name }}', 'tested bundle artifact');
  const evidence = uniqueStep(steps, (step) => step.with?.name === 'widget-browser-evidence', 'browser evidence');
  assertOrdered(steps, [blobs, merge, gate, gemini, identity, artifact]);
  assert.deepEqual(report.needs, ['build', 'browser']);
  assert.equal(condition(report.if), "!cancelled() && needs.build.result == 'success'");
  assert.equal(blobs.with.pattern, 'widget-blob-report-*');
  assert.equal(blobs.with['merge-multiple'], true);
  assert.equal(merge.run.trim(), `npx playwright merge-reports --config playwright.config.ts ${blobs.with.path}`);
  assert.match(playwrightConfig, /\['json', \{ outputFile: 'output\/playwright\/test-results\.json' \}\]/);
  assert.equal(gate.env.BROWSER_RESULT, '${{ needs.browser.result }}');
  assert.match(gate.run, /"\$BROWSER_RESULT" != "success"/);
  assert.match(gate.run, /exit 1/);
  assert.equal(condition(gemini.if), 'inputs.real_gemini');
  assert.equal(identity.run.trim(), 'node scripts/release-bundle.cjs outputs >> "$GITHUB_OUTPUT"');
  for (const step of [blobs, merge, gate, identity, artifact]) assert.equal(step.if, undefined);
  assert.equal(artifact.with['if-no-files-found'], 'error');
  assert.deepEqual(paths(artifact.with.path), releaseFiles);
  assert.equal(condition(evidence.if), 'always()');
  assert.ok(paths(evidence.with.path).includes(`${blobs.with.path}/resources`), 'Evidence must keep the merged screenshots');
});

test('every check job tests the commit of its own run, never a ref from an input', () => {
  // A ref from a manual run's input would execute that revision in the default branch cache scope.
  for (const job of [build, browser, report]) {
    const checkout = uniqueStep(job.steps, (step) => step.uses?.startsWith('actions/checkout@'), 'check checkout');
    assert.equal(checkout.with, undefined, 'Checks must use the default checkout of the run commit');
  }
  for (const job of [browser, report]) {
    assert.ok(job.steps.some((step) => /node scripts\/release-bundle\.cjs (?:verify|outputs)\b/.test(step.run || '')),
      'Downloaded bundles must match the checked-out commit');
  }
  assert.equal(validate.with.ref, undefined);
  assert.deepEqual(Object.values(release.jobs).filter((job) => job.steps)
    .flatMap((job) => job.steps.filter((step) => step.uses?.startsWith('actions/checkout@') && step.with?.ref))
    .map((step) => step.with.ref), ['${{ needs.validate.outputs.commit_sha }}', '${{ needs.validate.outputs.commit_sha }}']);
});

test('only the live Gemini step receives the key and only the CDN jobs have OIDC permission', () => {
  const gemini = uniqueStep(report.steps, (step) => step.run?.trim() === 'npm run test:visual-live', 'real Gemini check');
  assert.equal(gemini.env.GEMINI_API_KEY, '${{ secrets.GEMINI_API_KEY }}');
  assert.equal(gemini.env.GEMINI_MODEL, 'gemini-3.1-flash-lite');
  assert.equal(readText('.github/workflows/widget-checks.yml').match(/secrets\.GEMINI_API_KEY/g).length, 1);
  for (const workflow of workflows) {
    assert.notEqual(workflow.permissions?.['id-token'], 'write');
    assert.equal(workflow.env?.GEMINI_API_KEY, undefined);
    for (const job of Object.values(workflow.jobs)) {
      assert.notEqual(job.secrets, 'inherit', 'Pass only the Gemini secret');
      assert.equal(job.env?.GEMINI_API_KEY, undefined);
      for (const step of job.steps || []) {
        if (step !== gemini) assert.equal(step.env?.GEMINI_API_KEY, undefined, 'Other steps must not receive the credential');
      }
      if (job !== publish && job !== restore) assert.notEqual(job.permissions?.['id-token'], 'write');
    }
  }
  assert.equal(publish.permissions['id-token'], 'write');
  assert.equal(restore.permissions['id-token'], 'write');
});

// The deploy role trusts only runs from a version tag in the cdn-release environment (SELF_HOSTING.md).
// A job that asks for the cloud token outside that environment would wait for no approval.
test('only jobs in the cdn-release environment can ask for a cloud token', () => {
  const withToken = [];
  for (const filename of fs.readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name)).sort()) {
    const workflow = yaml.load(fs.readFileSync(path.join(workflowDir, filename), 'utf8'));
    assert.notEqual(workflow.permissions, 'write-all', filename);
    assert.notEqual(workflow.permissions?.['id-token'], 'write', `${filename}: ask for the token in the job, not the workflow`);
    for (const [name, job] of Object.entries(workflow.jobs)) {
      assert.notEqual(job.permissions, 'write-all', `${filename}:${name}`);
      if (job.permissions?.['id-token'] !== 'write') continue;
      withToken.push(`${filename}:${name}`);
      assert.equal(job.environment, RELEASE_ENVIRONMENT, `${filename}:${name} must wait for the release approval`);
      assert.deepEqual(job.permissions, { 'id-token': 'write', contents: 'read' }, `${filename}:${name}`);
    }
  }
  assert.deepEqual(withToken, ['publish-cdn.yml:publish', 'publish-cdn.yml:restore', 'publish-icons.yml:publish-icons']);
});

test('release tags enter through an environment variable and publish only from the tag ref', () => {
  assert.equal(condition(tagJob.if), "vars.CDN_DEPLOY_ROLE_ARN != ''");
  assert.equal(tagStep.env.RELEASE_REF, '${{ github.event.inputs.tag || github.ref }}');
  assert.match(tagStep.run, /TAG="\$\{RELEASE_REF#refs\/tags\/\}"/);
  assert.match(tagStep.run, /\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+/);
  assert.match(tagStep.run, /exit 1/);
  assert.doesNotMatch(tagStep.run, /\$\{\{/);
  assert.equal(tagStep.env.RUN_REF, '${{ github.ref }}');
  assert.equal(tagStep.if, undefined);
  assert.deepEqual(tagJob.outputs, {
    tag: '${{ steps.ref.outputs.tag }}',
    publish: '${{ steps.ref.outputs.publish }}',
    restore: '${{ steps.ref.outputs.restore }}',
  });
  const published = { status: 0, outputs: { tag: 'v1.0.22', publish: 'true' } };
  assert.deepEqual(runTagStep({ RELEASE_REF: 'refs/tags/v1.0.22', RUN_REF: 'refs/tags/v1.0.22' }), published);
  assert.deepEqual(runTagStep({ RELEASE_REF: 'v1.0.22', RUN_REF: 'refs/tags/v1.0.22', DRY_RUN: 'false' }), published);
  for (const RUN_REF of ['refs/heads/main', 'refs/tags/v1.0.21', '']) {
    const run = runTagStep({ RELEASE_REF: 'v1.0.22', RUN_REF, DRY_RUN: 'false' });
    assert.equal(run.status, 1, `A manual run from ${RUN_REF || 'no ref'} must not publish v1.0.22`);
    assert.equal(run.outputs.publish, undefined);
  }
  for (const RELEASE_REF of ['refs/heads/main', 'v1.0', 'v1.0.22;id', '']) {
    assert.deepEqual(runTagStep({ RELEASE_REF, RUN_REF: RELEASE_REF }), { status: 1, outputs: {} });
  }
});

test('a dry run checks the dispatched commit and never reaches the publish job', () => {
  const input = release.on.workflow_dispatch.inputs.dry_run;
  assert.equal(input.type, 'boolean');
  assert.equal(input.default, false);
  assert.equal(tagStep.env.DRY_RUN, '${{ github.event.inputs.dry_run }}');
  assert.equal(tagStep.env.RUN_SHA, '${{ github.sha }}');
  const sha = 'd6e1b9e71413b6d872ce013f4936067919a2d93e';
  for (const RUN_REF of ['refs/heads/ci/parallel-browser-tests', 'refs/tags/v1.0.22']) {
    assert.deepEqual(runTagStep({ RELEASE_REF: 'v1.0.22', DRY_RUN: 'true', RUN_REF, RUN_SHA: sha }),
      { status: 0, outputs: { tag: 'v1.0.22', publish: 'false' } });
  }
  assert.deepEqual(runTagStep({ RELEASE_REF: 'main', DRY_RUN: 'true', RUN_REF: 'refs/heads/main', RUN_SHA: sha }),
    { status: 1, outputs: {} });
  assert.match(condition(publish.if), /&& needs\.tag\.outputs\.publish == 'true'(?: &&|$)/);
});

test('a partner embed check with the tested bundle gates the publish', () => {
  assert.deepEqual([partner.needs].flat(), ['tag', 'validate']);
  assert.equal(condition(partner.if),
    "needs.validate.result == 'success' && vars.PARTNER_EMBED_CHECK == 'true' && github.event.inputs.skip_partner_check != 'true'");
  assert.equal(partner.container.image, browser.container.image, 'The partner check runs in the browser test image');
  assert.equal(partner.permissions, undefined, 'The partner check needs no extra permission');
  assert.equal(partner.secrets, undefined);
  const checkout = uniqueStep(partner.steps, (step) => step.uses?.startsWith('actions/checkout@'), 'partner checkout');
  const download = uniqueStep(partner.steps, (step) => step.uses?.startsWith('actions/download-artifact@'), 'tested bundle download');
  const check = uniqueStep(partner.steps, (step) => /node scripts\/partner-embed-check\.cjs/.test(step.run || ''), 'partner check');
  assert.equal(checkout.with.ref, '${{ needs.validate.outputs.commit_sha }}');
  assert.equal(download.with.name, validate.with.bundle_artifact_name);
  assert.match(check.run, /--bundle dist\/build\/static\/js\/widget\.min\.js/);
  assert.equal(check.env.PARTNER_EMBED_HTML, '${{ secrets.PARTNER_EMBED_HTML }}');
  // The repository is public, and its run log prints a plain variable: the embed stays a secret,
  // and only the check step receives it.
  for (const workflow of workflows) {
    for (const job of Object.values(workflow.jobs)) {
      assert.equal(job.env?.PARTNER_EMBED_HTML, undefined);
      for (const step of job.steps || []) {
        if (step !== check) assert.equal(step.env?.PARTNER_EMBED_HTML, undefined, 'Only the partner check receives the embed');
      }
    }
  }
  assert.equal(readText('.github/workflows/publish-cdn.yml').match(/PARTNER_EMBED_HTML \}\}/g).length, 1);
  assert.doesNotMatch(readText('.github/workflows/publish-cdn.yml'), /vars\.PARTNER_EMBED_HTML/);
  assertOrdered(partner.steps, [checkout, download, check]);
  assert.ok(!partner.steps.some((step) => rebuild.test(step.run || '')), 'The partner check must use the tested bundle, not a new build');
  const skip = release.on.workflow_dispatch.inputs.skip_partner_check;
  assert.equal(skip.type, 'boolean');
  assert.equal(skip.default, false);
});

test('a restore starts from a version tag and skips the release checks', () => {
  const input = release.on.workflow_dispatch.inputs.restore_tag;
  assert.equal(input.required, false);
  assert.equal(input.default, '');
  assert.equal(tagStep.env.RESTORE_TAG, '${{ github.event.inputs.restore_tag }}');
  const restored = { status: 0, outputs: { tag: 'v1.0.22', publish: 'false', restore: 'v1.0.21' } };
  for (const DRY_RUN of ['false', 'true']) {
    assert.deepEqual(runTagStep({ RELEASE_REF: 'v1.0.22', RUN_REF: 'refs/tags/v1.0.22', RESTORE_TAG: 'v1.0.21', DRY_RUN }), restored);
    // Only a run from a version tag can enter the release environment, also for a dry run.
    for (const RUN_REF of ['refs/heads/main', 'refs/tags/v1.0.21', '']) {
      assert.deepEqual(runTagStep({ RELEASE_REF: 'v1.0.22', RUN_REF, RESTORE_TAG: 'v1.0.21', DRY_RUN }), { status: 1, outputs: {} },
        `A restore from ${RUN_REF || 'no ref'} must stop`);
    }
  }
  for (const RESTORE_TAG of ['main', 'v1.0', 'v1.0.21;id', 'v1.0.21\nrestore=v1.0.1', '../v1.0.21']) {
    assert.deepEqual(runTagStep({ RELEASE_REF: 'v1.0.22', RUN_REF: 'refs/tags/v1.0.22', RESTORE_TAG }), { status: 1, outputs: {} });
  }
  assert.deepEqual([restore.needs].flat(), ['tag']);
  assert.equal(condition(restore.if), "needs.tag.outputs.restore != ''");
  // A restore runs no checks, so the partner check and the publish job cannot run either.
  assert.equal(condition(validate.if), "needs.tag.outputs.restore == ''");
  assert.match(condition(partner.if), /^needs\.validate\.result == 'success' && /);
  assert.match(condition(publish.if), /&& needs\.validate\.result == 'success' && needs\.tag\.outputs\.publish == 'true'/);
});

test('a restore uploads the published copy of an earlier release after the same approval', (t) => {
  assert.equal(restore.environment, RELEASE_ENVIRONMENT);
  assert.equal(publish.environment, RELEASE_ENVIRONMENT);
  assert.equal(restore.env.RESTORE_TAG, '${{ needs.tag.outputs.restore }}');
  const steps = restore.steps;
  const checkout = uniqueStep(steps, (step) => step.uses?.startsWith('actions/checkout@'), 'restore checkout');
  const fetchTag = uniqueStep(steps, (step) => /git fetch .*refs\/tags\/\$RESTORE_TAG/.test(step.run || ''), 'restored tag fetch');
  const read = uniqueStep(steps, (step) => step.id === 'restore', 'committed widget read');
  const credentials = uniqueStep(steps, (step) => step.uses?.startsWith('aws-actions/configure-aws-credentials@'), 'AWS credentials');
  const check = uniqueStep(steps, (step) => /s3:\/\/\$B\/chat\/\$RESTORE_TAG\/bundle\.min\.js/.test(step.run || ''), 'pinned copy check');
  const upload = uniqueStep(steps, (step) => /aws\s+s3\s+cp\s+restore-widget\.js\s/.test(step.run || ''), 'restored upload');
  const invalidation = uniqueStep(steps, (step) => /aws\s+cloudfront\s+create-invalidation/.test(step.run || ''), 'CloudFront invalidation');
  assertOrdered(steps, [checkout, fetchTag, read, credentials, check, upload, invalidation]);
  assert.equal(steps.length, 7);
  assert.equal(checkout.with, undefined, 'The restore runs the workflow of its own tag');
  assert.equal(credentials.with['role-to-assume'], '${{ vars.CDN_DEPLOY_ROLE_ARN }}');
  for (const step of [checkout, fetchTag, read, credentials, check]) assert.equal(step.if, undefined);
  for (const step of [upload, invalidation]) {
    assert.equal(condition(step.if), "github.event.inputs.dry_run != 'true'", 'A dry run only checks the published copy');
    assert.equal(step.env.MAJOR, '${{ steps.restore.outputs.major }}');
  }
  for (const step of steps) {
    assert.doesNotMatch(step.run || '', rebuild, 'A restore must not build a bundle');
    assert.doesNotMatch(step.run || '', /aws\s+s3\s+(?:cp|sync|mv)\s+s3:\/\/\S+\s+s3:\/\//, 'A restore downloads and uploads, as a publish does');
    assert.doesNotMatch(step.run || '', /\$\{\{/, 'Values enter the scripts through the environment');
  }

  // The release checkout of v1.0.21 and a fake S3.
  const dir = publishFixture(t);
  git(dir, ['tag', 'v1.0.21']);
  const outputFile = path.join(dir, 'step-output');
  fs.writeFileSync(outputFile, '');
  const env = { RESTORE_TAG: 'v1.0.21', MAJOR: 'v1', GITHUB_OUTPUT: outputFile };
  const readRun = runUploadStep(dir, read, env);
  assert.equal(readRun.status, 0, readRun.stderr);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'restore-widget.js')), widget);
  assert.equal(fs.readFileSync(outputFile, 'utf8'), 'major=v1\n');

  // A tag that was never published has no pinned copy: nothing is uploaded.
  const unpublished = runUploadStep(dir, check, env);
  assert.notEqual(unpublished.status, 0);
  assert.equal(unpublished.log.length, 1);
  const pinned = (bucket) => path.join(dir, 's3', bucket, 'chat', 'v1.0.21', 'bundle.min.js');
  for (const bucket of ['primary', 'backup']) {
    fs.mkdirSync(path.dirname(pinned(bucket)), { recursive: true });
    fs.writeFileSync(pinned(bucket), widget);
  }
  const checked = runUploadStep(dir, check, env);
  assert.equal(checked.status, 0, checked.stderr);
  assert.deepEqual(checked.log, ['primary', 'backup'].map((bucket) => `s3://${bucket}/chat/v1.0.21/bundle.min.js -> pinned-bundle.js`));

  const uploaded = runUploadStep(dir, upload, env);
  assert.equal(uploaded.status, 0, uploaded.stderr);
  assert.deepEqual(uploaded.log, ['primary', 'backup'].flatMap((bucket) => [
    `restore-widget.js -> s3://${bucket}/chat/v1/bundle.min.js`, `s3://${bucket}/chat/v1/bundle.min.js -> uploaded-bundle.js`]));
  for (const bucket of ['primary', 'backup']) {
    assert.deepEqual(fs.readFileSync(path.join(dir, 's3', bucket, 'chat', 'v1', 'bundle.min.js')), widget);
  }
  assert.equal(runUploadStep(dir, upload, { ...env, BUCKET_BACKUP: '' }).log.length, 2, 'The failover bucket is optional');

  // A short upload stops the restore before the failover bucket.
  const short = runUploadStep(dir, upload, { ...env, AWS_UPLOAD: 'short' });
  assert.notEqual(short.status, 0);
  assert.equal(short.log.length, 2);

  // A pinned copy that is not the committed widget stops the restore before any upload.
  fs.writeFileSync(pinned('backup'), forwarder);
  const changed = runUploadStep(dir, check, env);
  assert.notEqual(changed.status, 0);
  assert.equal(changed.log.length, 2);
});
