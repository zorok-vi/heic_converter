import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'work/**', 'node_modules/**', 'test-results/**', 'playwright-report/**', 'licenses/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } }, rules: { 'no-control-regex': 'off' } },
  { files: ['src/**/*.{ts,tsx}'], plugins: { 'react-hooks': hooks }, rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' } },
];
