/* eslint-env node */
module.exports = {
  process() {
    return { code: `const React = require('react');
      module.exports = {
        __esModule: true,
        default: 'test.svg',
        ReactComponent: React.forwardRef((props, ref) => React.createElement('svg', { ...props, ref }))
      };` };
  },
};
