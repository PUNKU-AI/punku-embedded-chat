/* eslint-env node */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createStaticHandler } = require('./dev-server.cjs');

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'punku-dev-server-test-'));
  const output = path.join(root, 'output');
  const assets = path.join(root, 'public');
  fs.mkdirSync(output);
  fs.mkdirSync(assets);
  fs.writeFileSync(path.join(output, 'index.html'), '<html>compiled widget</html>');
  fs.writeFileSync(path.join(output, 'bundle.js'), 'window.test = true;');
  fs.writeFileSync(path.join(assets, 'logo.svg'), '<svg/>');
  fs.writeFileSync(path.join(root, 'private.txt'), 'must remain private');
  fs.symlinkSync(path.join(root, 'private.txt'), path.join(assets, 'escape.txt'));
  const handler = createStaticHandler([output, assets]);
  const server = http.createServer((request, response) => {
    handler(request, response).catch((error) => {
      response.writeHead(500);
      response.end(error.message);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('serves compiled HTML and public assets with correct content types', async (t) => {
  const url = await fixture(t);
  const html = await fetch(url);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /^text\/html/);
  assert.equal(html.headers.get('cache-control'), 'no-store');
  assert.equal(await html.text(), '<html>compiled widget</html>');
  const svg = await fetch(`${url}/logo.svg?cache=1`);
  assert.equal(svg.status, 200);
  assert.equal(svg.headers.get('content-type'), 'image/svg+xml');
  assert.equal(await svg.text(), '<svg/>');
});

test('supports HEAD and rejects writes or missing paths', async (t) => {
  const url = await fixture(t);
  const head = await fetch(`${url}/bundle.js`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('content-length'), String('window.test = true;'.length));
  const post = await fetch(url, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
  const missing = await fetch(`${url}/missing.js`);
  assert.equal(missing.status, 404);
});

test('blocks encoded traversal, malformed paths, and symlinks outside each root', async (t) => {
  const url = await fixture(t);
  for (const requestPath of ['/%2e%2e%2fprivate.txt', '/%00private.txt', '/%5cprivate.txt', '/%']) {
    const response = await fetch(`${url}${requestPath}`);
    assert.equal(response.status, 400, requestPath);
    assert.doesNotMatch(await response.text(), /must remain private/);
  }
  const symlink = await fetch(`${url}/escape.txt`);
  assert.equal(symlink.status, 404);
  assert.doesNotMatch(await symlink.text(), /must remain private/);
});
