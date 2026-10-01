const path = require('node:path');
const TerserPlugin = require('terser-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (_env, argv = {}) => {
  const production = argv.mode === 'production';
  return {
    mode: production ? 'production' : 'development',
    entry: './src/index.tsx',
    target: 'browserslist',
    parallelism: 1,
    devtool: production ? false : 'source-map',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'build/static/js/bundle.min.js',
      publicPath: '/',
    },
    resolve: { extensions: ['.tsx', '.ts', '.js'] },
    module: {
      rules: [
        { test: /\.[jt]sx?$/, include: path.resolve(__dirname, 'src'), use: 'babel-loader' },
        {
          test: /\.svg$/,
          use: [{ loader: '@svgr/webpack', options: { exportType: 'named', namedExport: 'ReactComponent', titleProp: true, ref: true, svgo: false } }],
        },
        { test: /\.css$/, use: ['style-loader', 'css-loader'] },
        { test: /\.(png|jpe?g|gif|webp|woff2?)$/, type: 'asset/resource' },
      ],
    },
    optimization: {
      splitChunks: false,
      runtimeChunk: false,
      minimizer: [new TerserPlugin({ parallel: 1, extractComments: true })],
    },
    plugins: production ? [] : [new HtmlWebpackPlugin({ template: './public/index.html' })],
    devServer: { host: '127.0.0.1', port: 3000, open: false, static: path.resolve(__dirname, 'public') },
  };
};
