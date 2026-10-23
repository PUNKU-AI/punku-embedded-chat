/* eslint-env node */
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
const workflows = [ci, release, checks];
const playwrightConfig = readText('playwright.config.ts');
const playwrightProjects = [...playwrightConfig.matchAll(/\{ name: '([^']+)'/g)].map((match) => match[1]);
const rebuild = /npm\s+run\s+build(?::(?:release|react|bundle|browser-tests))?(?:\s|$)|build-widget-bundle\.cjs|react-scripts\s+build|\bwebpack\b/;
const releaseFiles = [
  'dist/build/static/js/bundle.min.js',
  'dist/build/static/js/bundle.min.js.LICENSE.txt',
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
const purgeStep = uniqueStep(publish.steps, (step) => step.run?.includes('purge.jsdelivr.net'), 'jsDelivr purge');

function runTagStep(env) {
  const outputFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'widget-release-tag-')), 'output');
  fs.writeFileSync(outputFile, '');
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', tagStep.run], {
    env: { PATH: process.env.PATH, GITHUB_OUTPUT: outputFile, DRY_RUN: '', RUN_REF: '', RUN_SHA: '', ...env },
    encoding: 'utf8',
  });
  const outputs = Object.fromEntries(fs.readFileSync(outputFile, 'utf8').trim().split('\n').filter(Boolean)
    .map((line) => line.split(/=(.*)/s).slice(0, 2)));
  fs.rmSync(path.dirname(outputFile), { recursive: true, force: true });
  return { status: result.status, outputs };
}

test('publication requires successful validation with real Gemini and committed bundle checks', () => {
  assert.deepEqual([publish.needs].flat(), ['tag', 'validate']);
  assert.equal(condition(publish.if), "needs.validate.result == 'success' && needs.tag.outputs.publish == 'true'");
  assert.equal(validate.uses, sharedChecks);
  assert.equal(validate.needs, 'tag');
  assert.equal(validate.if, undefined, 'Release validation must not skip its shared checks');
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
  const file = 'dist/build/static/js/bundle.min.js';
  const expected = [`${prefix}@v1/${file}`, `${prefix}/${file}`, `${prefix}@latest/${file}`];
  const purged = runPurgeStep(`echo '{"status":"finished"}' > purge-response.json; printf 200`);
  assert.equal(purged.status, 0);
  assert.deepEqual(purged.urls, expected);
  assert.equal(purged.stdout.match(/"status":"finished"/g).length, 3, 'Each response must reach the log');
  assert.doesNotMatch(purged.stdout, /::warning::/);
  const refused = runPurgeStep('printf 403');
  assert.equal(refused.status, 0);
  assert.deepEqual(refused.urls, expected, 'A refused purge must not stop the other aliases');
  assert.match(refused.stdout, /::warning::jsDelivr purge of '@v1' answered HTTP 403/);
  const offline = runPurgeStep('printf 000; exit 28');
  assert.equal(offline.status, 0);
  assert.deepEqual(offline.urls, expected);
  assert.match(offline.stdout, /::warning::jsDelivr purge of 'no version' answered HTTP 000/);
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
    assert.match(step.run, /aws\s+s3\s+cp\s+dist\/build\/static\/js\/bundle\.min\.js\s/);
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
  assert.equal(packageJson.scripts['audit:dependencies'], 'npm audit --audit-level=low');
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
  assert.match(bytes.run, /"\$BUNDLE_SHA {2}dist\/build\/static\/js\/bundle\.min\.js" \| sha256sum --check --strict/);
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
    .map((step) => step.with.ref), ['${{ needs.validate.outputs.commit_sha }}']);
});

test('only the live Gemini step receives the key and only the publisher has OIDC permission', () => {
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
      if (job !== publish) assert.notEqual(job.permissions?.['id-token'], 'write');
    }
  }
  assert.equal(publish.permissions['id-token'], 'write');
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
  assert.match(condition(publish.if), /&& needs\.tag\.outputs\.publish == 'true'$/);
});
