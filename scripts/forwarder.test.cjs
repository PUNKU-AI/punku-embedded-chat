/* eslint-env node */
// The swarovski-widget branch serves a forwarder, not a build. The Swarovski
// page loads it from jsDelivr (@swarovski-widget). It must load the v1
// release channel from cdn.punku.ai, and jsDelivr @v1 if that load fails.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const dist = path.join(__dirname, '..', 'dist', 'build', 'static', 'js');
const source = fs.readFileSync(path.join(dist, 'bundle.min.js'), 'utf8');
const PRIMARY = 'https://cdn.punku.ai/chat/v1/bundle.min.js';
const FALLBACK = 'https://cdn.jsdelivr.net/gh/PUNKU-AI/punku-embedded-chat@v1/dist/build/static/js/bundle.min.js';

// Runs the forwarder in a minimal page and returns the scripts that it adds.
function runForwarder({ defined = false, head = true } = {}) {
  const added = [];
  const parent = (name) => ({ name, appendChild: (node) => { added.push({ ...node, parent: name, node }); return node; } });
  const document = {
    head: head ? parent('head') : null,
    documentElement: parent('html'),
    createElement: (tag) => ({ tagName: tag.toUpperCase() }),
  };
  const window = { customElements: { get: (name) => (defined && name === 'punku-chat' ? class {} : undefined) } };
  vm.runInNewContext(source, { window, document });
  return added;
}

test('loads the v1 release channel from cdn.punku.ai, async', () => {
  const added = runForwarder();
  assert.equal(added.length, 1);
  assert.equal(added[0].tagName, 'SCRIPT');
  assert.equal(added[0].node.src, PRIMARY);
  assert.equal(added[0].node.async, true);
  assert.equal(added[0].parent, 'head');
});

test('loads jsDelivr @v1 when cdn.punku.ai fails, and stops after that', () => {
  const added = runForwarder();
  added[0].node.onerror();
  assert.equal(added.length, 2);
  assert.equal(added[1].node.src, FALLBACK);
  added[1].node.onerror();
  assert.equal(added.length, 2);
});

test('adds nothing when the widget is already defined', () => {
  assert.equal(runForwarder({ defined: true }).length, 0);
});

test('works without document.head', () => {
  assert.equal(runForwarder({ head: false })[0].parent, 'html');
});

test('is a small forwarder that loads only the two v1 URLs', () => {
  assert.ok(Buffer.byteLength(source) < 2048, 'The forwarder must stay small');
  assert.deepEqual(source.match(/https?:\/\/[^"'\s]+/g), [PRIMARY, FALLBACK]);
  // The forwarder must never load the branch itself.
  assert.doesNotMatch(source, /@swarovski-widget/);
  assert.equal(fs.existsSync(path.join(dist, 'bundle.min.js.LICENSE.txt')), false,
    'The forwarder has no third-party code, so it has no license file');
});
