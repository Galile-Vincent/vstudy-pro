import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ ignores: ['worker-configuration.d.ts', '.wrangler/**'] }, js.configs.recommended, ...ts.configs.recommended, { languageOptions: { globals: { console: 'readonly' } } });
