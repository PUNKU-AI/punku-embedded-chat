/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ESLint } = require('eslint');

const lint = new ESLint();
async function messages(code) {
  const [result] = await lint.lintText(code, { filePath: 'src/lint-compatibility.test.ts' });
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

test('keeps Testing Library asynchronous query checks with the updated utility dependency', async () => {
  const result = await messages("import { screen } from '@testing-library/react'; test('sample', () => { screen.findByText('Ready'); });");
  assert.ok(result.some((message) => message.ruleId === 'testing-library/await-async-query' && message.severity === 2));
});
