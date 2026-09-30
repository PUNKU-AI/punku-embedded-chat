/* eslint-env node */
/* eslint-disable no-template-curly-in-string -- GitHub expressions are literal workflow values. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const yaml = require('js-yaml');

const repoRoot = path.resolve(__dirname, '..');
const readYaml = (filename) => yaml.load(fs.readFileSync(path.join(repoRoot, filename), 'utf8'));
const ci = readYaml('.github/workflows/ci.yml');
const release = readYaml('.github/workflows/publish-cdn.yml');
const action = readYaml('.github/actions/check-widget-bundle/action.yml');
const sharedAction = './.github/actions/check-widget-bundle';
const actionSteps = action.runs.steps;
const validate = release.jobs.validate;
const publish = release.jobs.publish;

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

test('publication requires successful validation with real Gemini and committed bundle checks', () => {
  assert.deepEqual([publish.needs].flat(), ['validate']);
  assert.equal(condition(publish.if), "needs.validate.result == 'success'");
  const check = uniqueStep(validate.steps, (step) => step.uses === sharedAction, 'release validation');
  assert.equal(String(check.with.real_gemini), 'true');
  assert.equal(String(check.with.check_committed_bundle), 'true');
  assert.equal(check.with.gemini_api_key, '${{ secrets.GEMINI_API_KEY }}');
  assert.equal(check.if, undefined, 'Release validation must not skip its shared checks');
  assert.equal(validate.outputs.commit_sha, '${{ steps.check.outputs.commit_sha }}');
  assert.equal(check.id, 'check');
  for (const job of [validate, publish]) {
    assert.equal(job['continue-on-error'], undefined);
    for (const step of job.steps) assert.equal(step['continue-on-error'], undefined);
  }
});

test('CI and releases use the same bundle checking action', () => {
  const ciCheck = uniqueStep(ci.jobs.browser.steps, (step) => step.uses === sharedAction, 'CI validation');
  const releaseCheck = uniqueStep(validate.steps, (step) => step.uses === sharedAction, 'release validation');
  assert.equal(ciCheck.uses, releaseCheck.uses);
  assert.equal(ciCheck.with.gemini_api_key, '${{ secrets.GEMINI_API_KEY }}');
  assert.equal(condition(ciCheck.with.real_gemini),
    "github.actor != 'dependabot[bot]' && (github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository)");
  assert.equal(action.runs.using, 'composite');
});

test('publisher downloads the tested artifact at the validated commit without rebuilding the bundle', () => {
  const checkout = uniqueStep(publish.steps, (step) => step.uses?.startsWith('actions/checkout@'), 'publisher checkout');
  const download = uniqueStep(publish.steps, (step) => step.uses?.startsWith('actions/download-artifact@'), 'tested bundle download');
  const check = uniqueStep(validate.steps, (step) => step.uses === sharedAction, 'release validation');
  assert.equal(checkout.with.ref, '${{ needs.validate.outputs.commit_sha }}');
  assert.equal(download.with.name, check.with.bundle_artifact_name);
  assert.equal(download.with.path, '.');
  assertOrdered(publish.steps, [checkout, download]);
  const rebuild = /npm\s+run\s+build(?::(?:release|react|bundle|browser-tests))?(?:\s|$)|build-widget-bundle\.cjs|react-scripts\s+build|\bwebpack\b/;
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
    assert.match(step.run, /aws\s+s3\s+cp\s+dist\/build\/static\/js\/bundle\.min\.js\s/);
  }
});

test('shared checks build once, test browsers and Gemini, verify identity, then save the bundle', () => {
  const build = uniqueStep(actionSteps, (step) => step.run?.trim() === 'npm run build:release', 'release build');
  const browser = uniqueStep(actionSteps, (step) => step.run?.includes('npm run test:browser'), 'browser check');
  const gemini = uniqueStep(actionSteps, (step) => step.run?.trim() === 'npm run test:visual-live', 'real Gemini check');
  const identity = uniqueStep(actionSteps, (step) => step.id === 'identity', 'bundle identity check');
  const artifact = uniqueStep(actionSteps, (step) => step.uses?.startsWith('actions/upload-artifact@')
    && step.with.name === '${{ inputs.bundle_artifact_name }}', 'tested bundle artifact');
  assertOrdered(actionSteps, [build, browser, gemini, identity, artifact]);
  assert.equal(condition(gemini.if), "inputs.real_gemini == 'true'");
  assert.equal(identity.run.trim(), 'node scripts/release-bundle.cjs outputs >> "$GITHUB_OUTPUT"');
  for (const step of [build, browser, identity, artifact]) assert.equal(step.if, undefined);
  for (const step of actionSteps) assert.equal(step['continue-on-error'], undefined);
  assert.equal(artifact.with['if-no-files-found'], 'error');
  assert.deepEqual(artifact.with.path.trim().split(/\s+/), [
    'dist/build/static/js/bundle.min.js',
    'dist/build/static/js/bundle.min.js.LICENSE.txt',
    'output/playwright/bundle-manifest.json',
  ]);
});

test('only the live Gemini step receives the key and only the publisher has OIDC permission', () => {
  const gemini = uniqueStep(actionSteps, (step) => step.run?.trim() === 'npm run test:visual-live', 'real Gemini check');
  assert.equal(gemini.env.GEMINI_API_KEY, '${{ inputs.gemini_api_key }}');
  assert.equal(gemini.env.GEMINI_MODEL, 'gemini-3.1-flash-lite');
  for (const step of actionSteps.filter((candidate) => candidate !== gemini)) {
    assert.equal(step.env?.GEMINI_API_KEY, undefined, 'Other steps must not receive the credential');
  }
  for (const workflow of [ci, release]) {
    assert.notEqual(workflow.permissions?.['id-token'], 'write');
    assert.equal(workflow.env?.GEMINI_API_KEY, undefined);
    for (const job of Object.values(workflow.jobs)) {
      assert.equal(job.env?.GEMINI_API_KEY, undefined);
      for (const step of job.steps) assert.equal(step.env?.GEMINI_API_KEY, undefined);
      if (job !== publish) assert.notEqual(job.permissions?.['id-token'], 'write');
    }
  }
  assert.equal(publish.permissions['id-token'], 'write');
});

test('release tags enter through an environment variable and resolve to a canonical tag ref', () => {
  const tag = uniqueStep(validate.steps, (step) => step.id === 'ref', 'release tag validation');
  const checkout = uniqueStep(validate.steps, (step) => step.uses?.startsWith('actions/checkout@'), 'validation checkout');
  assert.equal(tag.env.RELEASE_REF, '${{ github.event.inputs.tag || github.ref }}');
  assert.match(tag.run, /TAG="\$\{RELEASE_REF#refs\/tags\/\}"/);
  assert.match(tag.run, /\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+/);
  assert.match(tag.run, /exit 1/);
  assert.match(tag.run, /echo "ref=refs\/tags\/\$TAG" >> "\$GITHUB_OUTPUT"/);
  assert.doesNotMatch(tag.run, /\$\{\{/);
  assert.equal(checkout.with.ref, '${{ steps.ref.outputs.ref }}');
  assert.equal(validate.outputs.tag, '${{ steps.ref.outputs.tag }}');
  assert.equal(tag.if, undefined);
  assertOrdered(validate.steps, [tag, checkout]);
});
