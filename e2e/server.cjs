/* eslint-env node */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Fixed routes prevent arbitrary file reads. The fixture uses no customer keys.
const routes = {
  '/': ['fixture.html', 'text/html'],
  '/fixture.html': ['fixture.html', 'text/html'],
  '/hint-fixture.html': ['hint-fixture.html', 'text/html'],
  '/nitro-fixture.js': ['nitro-fixture.js', 'text/javascript'],
  '/bundle.js': ['../dist/build/static/js/bundle.min.js', 'text/javascript'],
};

const feedbackPath = '/api/v1/monitor/messages/synthetic-feedback-message';
const feedbackRequests = { 4179: [], 4180: [] };

function handleFeedback(request, response, pathname, port) {
  if (pathname !== feedbackPath && pathname !== '/feedback-observations') return false;
  response.setHeader('Cache-Control', 'no-store');
  if (port === 4180) {
    response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4179');
    response.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'content-type, x-api-key, x-widget-test, x-xsrf-token');
    // Cookie assertions must fail if the widget starts including credentials.
    response.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (pathname === '/feedback-observations') {
    if (request.method === 'DELETE') {
      feedbackRequests[port] = [];
      response.writeHead(204).end();
    } else if (request.method === 'GET') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(feedbackRequests[port]));
    } else {
      response.writeHead(405).end();
    }
    return true;
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return true;
  }
  if (request.method !== 'PUT') {
    response.writeHead(405).end();
    return true;
  }
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => {
    if (body.length <= 4096) body += chunk;
  });
  request.on('end', () => {
    if (body.length > 4096) {
      response.writeHead(413).end();
      return;
    }
    let parsedBody;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      response.writeHead(400).end();
      return;
    }
    feedbackRequests[port].push({ method: request.method, headers: request.headers, body: parsedBody });
    if (feedbackRequests[port].length > 20) feedbackRequests[port].shift();
    if (port === 4180) {
      response.writeHead(204).end();
    } else {
      response.setHeader('Content-Type', 'application/json');
      response.end('{"saved":true}');
    }
  });
  return true;
}

const fixtureServer = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1:4179').pathname;
  if (handleFeedback(request, response, pathname, 4179)) return;
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
      response.writeHead(500).end('Release bundle missing. Run npm run build:release.');
      return;
    }
    response.setHeader('Content-Type', route[1]);
    response.setHeader('Cache-Control', 'no-store');
    response.end(data);
  });
});

// Start the API first. The existing health check then covers both listeners.
http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1:4180').pathname;
  if (!handleFeedback(request, response, pathname, 4180)) response.writeHead(404).end();
}).listen(4180, '127.0.0.1', () => fixtureServer.listen(4179, '127.0.0.1'));
