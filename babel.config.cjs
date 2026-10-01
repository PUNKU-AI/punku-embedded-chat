module.exports = (api) => {
  const test = api.env('test');
  return {
    presets: [
      ['@babel/preset-env', test ? { targets: { node: 'current' } } : { modules: false }],
      ['@babel/preset-react', { runtime: 'automatic' }],
      '@babel/preset-typescript',
    ],
  };
};
