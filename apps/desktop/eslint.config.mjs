import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  { ignores: ["out/**", "release/**"] },
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
