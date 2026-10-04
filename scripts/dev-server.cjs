/* eslint-env node */
// Keep development output outside the committed release directory.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function isInside(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function createStaticHandler(roots) {
  const resolvedRoots = roots.map((root) => fs.realpathSync(root));
  const files = new Map();
  function collect(root, directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(root, filename);
      if (entry.isFile()) {
        const url = '/' + path.relative(root, filename).split(path.sep).join('/');
        if (!files.has(url)) files.set(url, { root, filename });
      }
    }
  }
  for (const root of resolvedRoots) collect(root, root);
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method not allowed.');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent((request.url || '/').split('?')[0]);
    } catch {
      response.writeHead(400);
      response.end('Invalid request path.');
      return;
    }
    if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) {
      response.writeHead(400);
      response.end('Invalid request path.');
      return;
    }

    const route = files.get(pathname === '/' ? '/index.html' : pathname);
    if (route) {
      let file;
      let stat;
      try {
        file = await fs.promises.realpath(route.filename);
        if (!isInside(route.root, file)) {
          response.writeHead(404);
          response.end('File not found.');
          return;
        }
        stat = await fs.promises.stat(file);
      } catch (error) {
        if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) {
          response.writeHead(404);
          response.end('File not found.');
          return;
        }
        throw error;
      }
      if (!stat.isFile()) {
        response.writeHead(404);
        response.end('File not found.');
        return;
      }

      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size,
      });
      if (request.method === 'HEAD') {
        response.end();
      } else {
        const stream = fs.createReadStream(file);
        stream.on('error', () => response.destroy());
        stream.pipe(response);
      }
      return;
    }
    response.writeHead(404);
    response.end('File not found.');
  };
}

async function startDevServer() {
  process.env.NODE_ENV = 'development';
  process.env.BABEL_ENV = 'development';
  const webpack = require('webpack');
  const config = require('../webpack.config')({}, { mode: 'development' });
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'punku-widget-dev-'));
  config.output.path = outputRoot;
  config.parallelism = 1;
  delete config.devServer;
  const compiler = webpack(config);
  let handler = createStaticHandler([outputRoot, path.resolve(__dirname, '../public')]);
  let ready = false;
  let stopped = false;
  const server = http.createServer((request, response) => {
    if (!ready) {
      response.writeHead(503, { 'Retry-After': '1' });
      response.end('The development build is not ready.');
      return;
    }
    handler(request, response).catch((error) => {
      console.error(error.message);
      if (!response.headersSent) response.writeHead(500);
      response.end('The development server could not read this file.');
    });
  });
  const watcher = compiler.watch({ aggregateTimeout: 200 }, (error, stats) => {
    ready = Boolean(!error && stats && !stats.hasErrors());
    if (ready) handler = createStaticHandler([outputRoot, path.resolve(__dirname, '../public')]);
    console.log(error || stats?.toString({ all: false, errors: true, warnings: true, timings: true }) || 'Build produced no result.');
  });

  async function stop() {
    if (stopped) return;
    stopped = true;
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await Promise.all([
      new Promise((resolve) => server.close(resolve)),
      new Promise((resolve) => watcher.close(resolve)),
    ]);
    await new Promise((resolve) => compiler.close(resolve));
    await fs.promises.rm(outputRoot, { recursive: true, force: true });
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  server.on('error', async (error) => {
    console.error(error.message);
    process.exitCode = 1;
    await stop();
  });
  server.listen(3000, '127.0.0.1', () => {
    console.log('Widget development server: http://127.0.0.1:3000');
  });
  return { server, watcher, compiler, outputRoot, stop };
}

if (require.main === module) {
  startDevServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { createStaticHandler, startDevServer };
