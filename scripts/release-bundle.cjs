/* eslint-env node */
// Bind browser/Gemini evidence and publication to the same bundle and commit.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const BUNDLE_PATH = 'dist/build/static/js/bundle.min.js';
const FILES = [BUNDLE_PATH, `${BUNDLE_PATH}.LICENSE.txt`];
const MANIFEST_PATH = 'output/playwright/bundle-manifest.json';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function commitSha(repoRoot) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function fileIdentity(repoRoot, relativePath) {
  const filename = path.join(repoRoot, relativePath);
  if (fs.realpathSync(filename) !== filename || !fs.statSync(filename).isFile()) throw new Error('Release files must be regular files at their canonical paths.');
  const bytes = fs.readFileSync(filename);
  return { sha256: hash(bytes), sizeBytes: bytes.length };
}

function recordBundleIdentity(repoRoot = REPO_ROOT) {
  const manifest = { version: 1, commitSha: commitSha(repoRoot), files: Object.fromEntries(FILES.map((filename) => [filename, fileIdentity(repoRoot, filename)])) };
  const filename = path.join(repoRoot, MANIFEST_PATH);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(manifest, null, 2));
  return manifest;
}

function verifyBundleIdentity(repoRoot = REPO_ROOT) {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, MANIFEST_PATH), 'utf8'));
  if (manifest.version !== 1 || manifest.commitSha !== commitSha(repoRoot) || !manifest.files || Object.keys(manifest.files).sort().join() !== FILES.slice().sort().join()) {
    throw new Error('The bundle manifest does not match this release commit.');
  }
  for (const filename of FILES) {
    const actual = fileIdentity(repoRoot, filename);
    const expected = manifest.files[filename];
    if (actual.sha256 !== expected.sha256 || actual.sizeBytes !== expected.sizeBytes) throw new Error('The release bundle or license changed after the build.');
  }
  return manifest;
}

function verifyCommittedBundle(repoRoot = REPO_ROOT) {
  const manifest = verifyBundleIdentity(repoRoot);
  for (const filename of FILES) {
    const committed = execFileSync('git', ['show', `HEAD:${filename}`], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
    if (hash(committed) !== manifest.files[filename].sha256) throw new Error('The committed release bundle is stale. Rebuild and commit dist before tagging.');
  }
  return manifest;
}

module.exports = { BUNDLE_PATH, FILES, MANIFEST_PATH, recordBundleIdentity, verifyBundleIdentity, verifyCommittedBundle };

if (require.main === module) {
  try {
    const command = process.argv[2];
    if (command === 'verify') verifyBundleIdentity();
    else if (command === 'verify-committed') verifyCommittedBundle();
    else if (command === 'outputs') {
      const manifest = verifyBundleIdentity();
      process.stdout.write(`commit_sha=${manifest.commitSha}\nbundle_sha=${manifest.files[BUNDLE_PATH].sha256}\n`);
    } else throw new Error('Use verify, verify-committed, or outputs.');
    if (command !== 'outputs') process.stdout.write('Release bundle identity verified.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
