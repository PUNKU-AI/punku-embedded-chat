/* eslint-env node */
// Keep this build serial. It uses the same source and configurations as release.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
process.env.NODE_ENV = 'production';
process.env.BABEL_ENV = 'production';
process.env.GENERATE_SOURCEMAP = 'false';

if (!process.argv[2]) {
  for (const stage of ['react', 'bundle']) {
    const result = spawnSync(process.execPath, ['--max-old-space-size=2048', __filename, stage], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
} else if (process.argv[2] === 'react') {
  const configPath = require.resolve('react-scripts/config/webpack.config');
  const createConfig = require(configPath);
  require.cache[configPath].exports = (...args) => {
    const config = createConfig(...args);
    for (const minimizer of config.optimization.minimizer) {
      if (minimizer.options && 'parallel' in minimizer.options) minimizer.options.parallel = 1;
    }
    config.parallelism = 1;
    return config;
  };
  require('react-scripts/scripts/build');
} else {
  const webpack = require('webpack');
  const TerserPlugin = require('terser-webpack-plugin');
  const config = require('../webpack.config');
  config.mode = 'production';
  config.parallelism = 1;
  config.output.path = path.resolve(__dirname, '../output/playwright');
  config.output.filename = 'bundle.min.js';
  config.optimization = { minimizer: [new TerserPlugin({ parallel: 1 })] };
  for (const plugin of config.plugins) {
    if (plugin.options && 'parallel' in plugin.options) plugin.options.parallel = 1;
  }
  webpack(config, (error, stats) => {
    if (error || stats.hasErrors()) {
      console.error(error || stats.toString({ all: false, errors: true }));
      process.exitCode = 1;
    } else console.log(stats.toString({ all: false, assets: true, warnings: true }));
  });
}
