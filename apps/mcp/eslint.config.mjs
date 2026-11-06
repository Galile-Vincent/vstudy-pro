/** Lint the credential-free adapter and its protocol fixtures. */
import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['**/dist/**'] }, js.configs.recommended, ...ts.configs.recommended,
  { languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly' } },
    rules: { 'no-eval': 'error', 'no-new-func': 'error', 'no-implied-eval': 'error',
      'no-restricted-syntax': ['error', { selector: "Property[key.name='shell'][value.value=true]", message: 'Use executable and argv arrays.' }] } },
);
