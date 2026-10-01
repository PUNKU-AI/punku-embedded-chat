/* eslint-env node */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { BUNDLE_PATH, FILES, MANIFEST_PATH, recordBundleIdentity, verifyBundleIdentity, verifyCommittedBundle } = require('./release-bundle.cjs');

const RELEASE_BYTES = {
  [BUNDLE_PATH]: Buffer.from('/*! Synthetic widget */\n(()=>{globalThis.fixture="v1";})();\n'),
  [`${BUNDLE_PATH}.LICENSE.txt`]: Buffer.from('Synthetic fixture license. Copyright © 2026.\n'),
};

function git(repoRoot, args) {
  return execFileSync('git', [
    '-c', `core.hooksPath=${path.join(repoRoot, '.git', 'empty-hooks')}`,
    '-c', 'user.name=Widget Release Tests',
    '-c', 'user.email=widget-release-tests@example.invalid',
    '-c', 'commit.gpgsign=false',
    ...args,
  ], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function fixture(t) {
  const repoRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'widget-release-bundle-')));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  git(repoRoot, ['init', '--quiet']);
  fs.mkdirSync(path.join(repoRoot, '.git', 'empty-hooks'));
  for (const filename of FILES) {
    fs.mkdirSync(path.dirname(path.join(repoRoot, filename)), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, filename), RELEASE_BYTES[filename]);
  }
  git(repoRoot, ['add', '--', ...FILES]);
  git(repoRoot, ['commit', '--quiet', '-m', 'Synthetic release fixture']);
  return repoRoot;
}

test('records and verifies the exact committed bundle and license bytes', (t) => {
  const repoRoot = fixture(t);
  const expected = {
    version: 1,
    commitSha: git(repoRoot, ['rev-parse', 'HEAD']),
    files: Object.fromEntries(FILES.map((filename) => [filename, {
      sha256: createHash('sha256').update(RELEASE_BYTES[filename]).digest('hex'),
      sizeBytes: RELEASE_BYTES[filename].length,
    }])),
  };
  assert.deepEqual(recordBundleIdentity(repoRoot), expected);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repoRoot, MANIFEST_PATH), 'utf8')), expected);
  assert.deepEqual(verifyBundleIdentity(repoRoot), expected);
  assert.deepEqual(verifyCommittedBundle(repoRoot), expected);
});

for (const filename of FILES) {
  test(`rejects a same-size change to ${path.basename(filename)} after recording`, (t) => {
    const repoRoot = fixture(t);
    const manifest = recordBundleIdentity(repoRoot);
    const changed = Buffer.from(RELEASE_BYTES[filename]);
    changed[0] ^= 1;
    fs.writeFileSync(path.join(repoRoot, filename), changed);
    assert.equal(changed.length, manifest.files[filename].sizeBytes);
    assert.throws(() => verifyBundleIdentity(repoRoot), /bundle or license changed after the build/);
    assert.throws(() => verifyCommittedBundle(repoRoot), /bundle or license changed after the build/);
  });
}

test('rejects a new checkout commit even when release files remain identical', (t) => {
  const repoRoot = fixture(t);
  const manifest = recordBundleIdentity(repoRoot);
  fs.writeFileSync(path.join(repoRoot, 'fixture-change.txt'), 'A different release commit.\n');
  git(repoRoot, ['add', '--', 'fixture-change.txt']);
  git(repoRoot, ['commit', '--quiet', '-m', 'Change the fixture commit']);
  assert.notEqual(git(repoRoot, ['rev-parse', 'HEAD']), manifest.commitSha);
  for (const filename of FILES) assert.deepEqual(fs.readFileSync(path.join(repoRoot, filename)), RELEASE_BYTES[filename]);
  assert.throws(() => verifyBundleIdentity(repoRoot), /manifest does not match this release commit/);
  assert.throws(() => verifyCommittedBundle(repoRoot), /manifest does not match this release commit/);
});

test('rejects a missing bundle or license before recording and during verification', (t) => {
  for (const filename of FILES) {
    const repoRoot = fixture(t);
    recordBundleIdentity(repoRoot);
    fs.unlinkSync(path.join(repoRoot, filename));
    assert.throws(() => recordBundleIdentity(repoRoot), { code: 'ENOENT' });
    assert.throws(() => verifyBundleIdentity(repoRoot), { code: 'ENOENT' });
    assert.throws(() => verifyCommittedBundle(repoRoot), { code: 'ENOENT' });
  }
});

test('rejects a release file symlink even when the target has identical bytes', (t) => {
  for (const filename of FILES) {
    const repoRoot = fixture(t);
    recordBundleIdentity(repoRoot);
    const alternate = path.join(repoRoot, 'alternate-release-file');
    fs.writeFileSync(alternate, RELEASE_BYTES[filename]);
    fs.unlinkSync(path.join(repoRoot, filename));
    fs.symlinkSync(alternate, path.join(repoRoot, filename));
    assert.throws(() => recordBundleIdentity(repoRoot), /regular files at their canonical paths/);
    assert.throws(() => verifyBundleIdentity(repoRoot), /regular files at their canonical paths/);
    assert.throws(() => verifyCommittedBundle(repoRoot), /regular files at their canonical paths/);
  }
});

test('rejects a directory in place of either release file', (t) => {
  for (const filename of FILES) {
    const repoRoot = fixture(t);
    recordBundleIdentity(repoRoot);
    fs.unlinkSync(path.join(repoRoot, filename));
    fs.mkdirSync(path.join(repoRoot, filename));
    assert.throws(() => recordBundleIdentity(repoRoot), /regular files at their canonical paths/);
    assert.throws(() => verifyBundleIdentity(repoRoot), /regular files at their canonical paths/);
    assert.throws(() => verifyCommittedBundle(repoRoot), /regular files at their canonical paths/);
  }
});

test('rejects freshly recorded release bytes that differ from the committed files', (t) => {
  for (const filename of FILES) {
    const repoRoot = fixture(t);
    fs.appendFileSync(path.join(repoRoot, filename), '\nA new synthetic build.\n');
    const manifest = recordBundleIdentity(repoRoot);
    assert.deepEqual(verifyBundleIdentity(repoRoot), manifest);
    assert.throws(() => verifyCommittedBundle(repoRoot), /committed release bundle is stale/);
  }
});
