import i18nRule from './scripts/i18n-rule.mjs';
import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  { ignores: ["out/**", "release/**"] },
  { files:["src/renderer/**/*.tsx"], ignores:["**/*.test.*"], plugins:{local:{rules:{"no-literal-string":i18nRule}}}, rules:{"local/no-literal-string":"error"} },
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
