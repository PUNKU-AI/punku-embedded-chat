/* eslint-env node */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Fixed routes prevent arbitrary file reads. The fixture uses no customer keys.
const routes = {
  '/': ['fixture.html', 'text/html'],
  '/fixture.html': ['fixture.html', 'text/html'],
  '/nitro-fixture.js': ['nitro-fixture.js', 'text/javascript'],
  '/bundle.js': ['../output/playwright/bundle.min.js', 'text/javascript'],
};
http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1:4179').pathname;
  if (pathname === '/health') {
    response.end('ok');
    return;
  }
  if (pathname === '/destination.html') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Link destination</title><h1>Information link opened</h1>');
    return;
  }
  const route = routes[pathname];
  if (!route) {
    response.writeHead(404).end();
    return;
  }
  fs.readFile(path.resolve(__dirname, route[0]), (error, data) => {
    if (error) {
      response.writeHead(500).end('Fixture bundle missing. Run npm run build:browser-tests.');
      return;
    }
    response.setHeader('Content-Type', route[1]);
    response.setHeader('Cache-Control', 'no-store');
    response.end(data);
  });
}).listen(4179, '127.0.0.1');
