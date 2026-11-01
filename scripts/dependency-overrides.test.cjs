// package.json `overrides` force glob 14.0.2 or newer (GHSA-3g3m-2fjr-6pw4) and
// minimatch 11.0.1 or newer (GHSA-g3hv-75wg-m249) into the test and lint tools.
// On 2026-11-01 no release of jest (30.5.2), babel-plugin-istanbul (8.0.0),
// ESLint 9 (9.39.5), typescript-eslint (8.72.1) or the React, accessibility and
// import lint plugins depends on these versions. None of these tools ships in
// the widget bundle. These tests call glob and minimatch the way jest and its
// coverage do; scripts/lint-compatibility.test.cjs covers the lint tools.
// Remove an override when every package that uses it depends on a patched
// version (`npm ls glob minimatch`). The release audit fails if an unpatched
// copy comes back.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
// The copy of `name` that `tool` loads.
const requireFrom = (tool, name) => require(require.resolve(name, { paths: [path.dirname(require.resolve(tool))] }));

test('jest finds files with the forced glob', () => {
  // jest-config expands `projects` globs, jest-runtime lists similar files for a
  // module it cannot find, and @jest/reporters expands coverage threshold globs.
  for (const tool of ['jest-config', 'jest-runtime', '@jest/reporters']) {
    const { glob } = requireFrom(tool, 'glob');
    const files = glob.sync(path.join(root, 'scripts', 'release-audit*.cjs'), { windowsPathsNoEscape: true });
    assert.deepEqual(files.map((file) => path.basename(file)).sort(), ['release-audit.cjs', 'release-audit.test.cjs'], tool);
  }
});

test('coverage selects source files with the forced glob and minimatch', () => {
  // babel-jest instruments a file for coverage only when test-exclude selects it.
  const TestExclude = requireFrom('babel-plugin-istanbul', 'test-exclude');
  const exclude = new TestExclude({ cwd: root, include: ['src/**'], exclude: ['**/*.test.*'], extension: ['.ts', '.tsx'] });
  assert.equal(exclude.shouldInstrument(path.join(root, 'src', 'controllers', 'index.ts')), true);
  assert.equal(exclude.shouldInstrument(path.join(root, 'src', 'controllers', 'index.test.ts')), false);
  assert.equal(exclude.shouldInstrument(path.join(root, 'scripts', 'release-audit.cjs')), false);
  assert.ok(exclude.globSync().includes('src/controllers/index.ts'));
});
