/* eslint-env node */
// Build the release once, with a fixed memory and worker limit.
const { spawnSync } = require('node:child_process');
process.env.NODE_ENV = 'production';
process.env.BABEL_ENV = 'production';

if (!process.argv[2]) {
  const result = spawnSync(process.execPath, ['--max-old-space-size=2048', __filename, 'compile'], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} else if (process.argv[2] === 'compile') {
  const webpack = require('webpack');
  const config = require('../webpack.config')({}, { mode: 'production' });
  const compiler = webpack(config);
  compiler.run((error, stats) => {
    compiler.close((closeError) => {
      if (error || closeError || !stats || stats.hasErrors()) {
        console.error(error || closeError || stats?.toString({ all: false, errors: true }) || 'Build produced no result.');
        process.exitCode = 1;
        return;
      }
      require('./release-bundle.cjs').recordBundleIdentity();
      console.log(stats.toString({ all: false, assets: true, warnings: true }));
    });
  });
} else {
  console.error('Unknown build stage.');
  process.exitCode = 1;
}
