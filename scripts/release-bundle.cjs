/* eslint-env node */
// Bind browser/Gemini evidence and publication to the same bundle and commit.
// The build writes the widget to widget.min.js. The committed bundle.min.js is
// a small forwarder for old jsDelivr embeds (see release-forwarder.test.cjs).
// The CDN gets widget.min.js under the name bundle.min.js, never the forwarder.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const BUNDLE_PATH = 'dist/build/static/js/widget.min.js';
const FORWARDER_PATH = 'dist/build/static/js/bundle.min.js';
const FILES = [BUNDLE_PATH, `${BUNDLE_PATH}.LICENSE.txt`];
const MANIFEST_PATH = 'output/playwright/bundle-manifest.json';
// The widget is about 950 KB and the forwarder about 1 KB.
const MIN_BUNDLE_BYTES = 100 * 1024;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

// A CDN copy must be the widget: large, it defines <punku-chat>, and it is not the forwarder.
function assertFullBundle(bytes) {
  const text = bytes.toString('utf8');
  if (/punku-chat forwarder/.test(text.slice(0, 1024))) throw new Error('The file is the jsDelivr forwarder, not the widget.');
  if (bytes.length < MIN_BUNDLE_BYTES) throw new Error(`The file has ${bytes.length} bytes. The widget has at least ${MIN_BUNDLE_BYTES}.`);
  if (!text.includes('customElements.define(') || !text.includes('"punku-chat"')) throw new Error('The file does not define <punku-chat>.');
}

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
  assertFullBundle(fs.readFileSync(path.join(repoRoot, BUNDLE_PATH)));
  for (const filename of FILES) {
    const committed = execFileSync('git', ['show', `HEAD:${filename}`], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
    if (hash(committed) !== manifest.files[filename].sha256) throw new Error('The committed release bundle is stale. Rebuild and commit dist before tagging.');
  }
  return manifest;
}

// The publisher reads each uploaded object back. It must be the tested widget.
function verifyUploadedBundle(filename, repoRoot = REPO_ROOT) {
  const manifest = verifyBundleIdentity(repoRoot);
  const bytes = fs.readFileSync(filename);
  assertFullBundle(bytes);
  if (hash(bytes) !== manifest.files[BUNDLE_PATH].sha256) throw new Error('The uploaded file is not the tested widget.');
  return manifest;
}

module.exports = {
  BUNDLE_PATH, FILES, FORWARDER_PATH, MANIFEST_PATH, MIN_BUNDLE_BYTES,
  assertFullBundle, recordBundleIdentity, verifyBundleIdentity, verifyCommittedBundle, verifyUploadedBundle,
};

if (require.main === module) {
  try {
    const command = process.argv[2];
    if (command === 'verify') verifyBundleIdentity();
    else if (command === 'verify-committed') verifyCommittedBundle();
    else if (command === 'verify-uploaded') {
      if (!process.argv[3]) throw new Error('Name the downloaded copy: verify-uploaded <file>.');
      verifyUploadedBundle(process.argv[3]);
    }
    else if (command === 'outputs') {
      const manifest = verifyBundleIdentity();
      process.stdout.write(`commit_sha=${manifest.commitSha}\nbundle_sha=${manifest.files[BUNDLE_PATH].sha256}\n`);
    } else throw new Error('Use verify, verify-committed, verify-uploaded, or outputs.');
    if (command !== 'outputs') process.stdout.write('Release bundle identity verified.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
