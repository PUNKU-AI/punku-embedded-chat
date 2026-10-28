/* eslint-env node */
// dist/build/static/js/bundle.min.js is a forwarder, not the widget. Old embeds
// load it from jsDelivr (no version, @v1, @latest). It must load the v1 release
// from cdn.punku.ai, and the full widget of the same release from jsDelivr if
// that load fails. Its fallback must never be a forwarder, or the two loop.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { BUNDLE_PATH, FORWARDER_PATH, assertFullBundle } = require('./release-bundle.cjs');

const repoRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, FORWARDER_PATH), 'utf8');
const PRIMARY = 'https://cdn.punku.ai/chat/v1/bundle.min.js';
const FALLBACK = `https://cdn.jsdelivr.net/gh/PUNKU-AI/punku-embedded-chat@v1/${BUNDLE_PATH}`;

// Runs the forwarder in a minimal page and returns the scripts that it adds.
function runForwarder({ defined = false, head = true, customElements = true } = {}) {
  const added = [];
  const parent = (name) => ({ name, appendChild: (node) => { added.push({ ...node, parent: name, node }); return node; } });
  const document = {
    head: head ? parent('head') : null,
    documentElement: parent('html'),
    createElement: (tag) => ({ tagName: tag.toUpperCase() }),
  };
  const registry = { get: (name) => (defined && name === 'punku-chat' ? class {} : undefined) };
  const window = customElements ? { customElements: registry } : {};
  vm.runInNewContext(source, { window, document });
  return added;
}

test('loads the v1 release from cdn.punku.ai, async, once', () => {
  const added = runForwarder();
  assert.equal(added.length, 1);
  assert.equal(added[0].tagName, 'SCRIPT');
  assert.equal(added[0].node.src, PRIMARY);
  assert.equal(added[0].node.async, true);
  assert.equal(added[0].parent, 'head');
});

test('loads the full widget from jsDelivr @v1 when cdn.punku.ai fails, and stops after that', () => {
  const added = runForwarder();
  added[0].node.onerror();
  assert.equal(added.length, 2);
  assert.equal(added[1].node.src, FALLBACK);
  assert.equal(added[1].node.async, true);
  added[1].node.onerror();
  assert.equal(added.length, 2);
});

test('adds nothing when the widget is already defined', () => {
  assert.equal(runForwarder({ defined: true }).length, 0);
});

test('works without document.head and without custom elements', () => {
  assert.equal(runForwarder({ head: false })[0].parent, 'html');
  assert.equal(runForwarder({ customElements: false })[0].node.src, PRIMARY);
});

test('the fallback is the full widget, never a forwarder', () => {
  assert.notEqual(BUNDLE_PATH, FORWARDER_PATH);
  assert.ok(FALLBACK.endsWith(`/${BUNDLE_PATH}`));
  // The S3 copies are the widget under the name bundle.min.js; the jsDelivr
  // bundle.min.js is this forwarder. So no jsDelivr bundle.min.js may appear.
  assert.doesNotMatch(source, /jsdelivr[^"']*\/bundle\.min\.js/);
  // The build writes the widget to BUNDLE_PATH and never overwrites the forwarder.
  const config = require('../webpack.config')({}, { mode: 'production' });
  assert.equal(path.relative(repoRoot, path.join(config.output.path, config.output.filename)), BUNDLE_PATH);
  assert.throws(() => assertFullBundle(Buffer.from(source)), /forwarder, not the widget/);
});

test('is a small forwarder that loads only the two v1 URLs', () => {
  assert.ok(Buffer.byteLength(source) < 2048, 'The forwarder must stay small');
  assert.deepEqual(source.match(/https?:\/\/[^"'\s]+/g), [PRIMARY, FALLBACK]);
  assert.match(source.slice(0, 200), /punku-chat forwarder/, 'The release checks find the forwarder by this name');
  assert.equal(fs.existsSync(path.join(repoRoot, `${FORWARDER_PATH}.LICENSE.txt`)), false,
    'The forwarder has no third-party code, so it has no license file');
});
