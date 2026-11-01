const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ESLint } = require('eslint');

const lint = new ESLint();
async function messages(code, filePath = 'src/lint-compatibility.test.ts') {
  const [result] = await lint.lintText(code, { filePath });
  assert.equal(result.fatalErrorCount, 0);
  return result.messages;
}

test('preserves the restriction against importing or requiring the Jest runner', async () => {
  const imports = await messages("import 'jest';");
  assert.ok(imports.some((message) => message.ruleId === 'no-restricted-imports' && message.severity === 2));
  const requires = await messages("require('jest');");
  assert.ok(requires.some((message) => message.ruleId === 'no-restricted-modules' && message.severity === 2));
  const globals = await messages("import { expect } from '@jest/globals'; expect(true).toBe(true);");
  assert.deepEqual(globals, []);
});

test('keeps the Testing Library asynchronous query check', async () => {
  const result = await messages("import { screen } from '@testing-library/react'; test('sample', () => { screen.findByText('Ready'); });");
  assert.ok(result.some((message) => message.ruleId === 'testing-library/await-async-queries' && message.severity === 2));
});

test('runs the React, accessibility, import and hooks rules with the forced minimatch 11', async () => {
  // These plugins still ask for minimatch 3 (see eslint.config.cjs).
  const code = [
    "import { useState } from 'react';",
    'export function Card() {',
    '  if (Math.random()) useState(0);',
    '  return <Card_image><img src="card.png" /></Card_image>;',
    '}',
    "import './late';",
  ].join('\n');
  const rules = new Set((await messages(code, 'src/lint-compatibility.tsx')).map((message) => message.ruleId));
  for (const rule of ['react/jsx-pascal-case', 'react/jsx-no-undef', 'jsx-a11y/alt-text', 'import/first', 'react-hooks/rules-of-hooks']) {
    assert.ok(rules.has(rule), `${rule} did not report`);
  }
});
