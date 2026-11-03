import i18nRule from './scripts/i18n-rule.mjs';
import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  { ignores: ["out/**", "release/**"] },
  { files:["src/renderer/**/*.tsx"], ignores:["**/*.test.*"], plugins:{local:{rules:{"no-literal-string":i18nRule}}}, rules:{"local/no-literal-string":"error"} },
  { files: ['src/**/*.{ts,tsx}', 'resources/**/*.ts'], ignores: ['**/*.test.*'], rules: {
    'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error',
    'no-restricted-syntax': ['error',
      { selector: "Property[key.name='shell'][value.value=true]", message: 'Use argv arrays with shell:false.' },
      { selector: "AssignmentExpression[left.property.name='innerHTML']", message: 'Use the reviewed Markdown sanitizer.' },
      { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Use the reviewed Markdown sanitizer.' }]
  } },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ["src/renderer/components/**/*.tsx"], rules: { "no-empty": ["error", { allowEmptyCatch: true }] } },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", window: "readonly" },
    },
  },
);
