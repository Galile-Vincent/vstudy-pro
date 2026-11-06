import electronSecurity from 'eslint-plugin-electron-security';
import { ESLint } from 'eslint';
const engine = new ESLint({ overrideConfig: [{ files: ['src/main/**/*.ts'], ignores: ['**/*.test.ts'], plugins: { 'electron-security': electronSecurity }, rules: Object.fromEntries(Object.keys(electronSecurity.rules).map(name => [`electron-security/${name}`, 'warn'])) }] });
const results = await engine.lintFiles(['src/main']);
for (const result of results) result.filePath = result.filePath.replaceAll('\\', '/');
console.log(await (await engine.loadFormatter('stylish')).format(results));
// The app and Moodle page openers confirm natively. SSO validates its launch URL.
if (results.some(result => result.errorCount || result.messages.some(message => message.severity === 1 && !(message.ruleId === 'electron-security/no-open-external-with-dynamic-url' && (result.filePath.endsWith('/src/main/ipc/index.ts') || result.filePath.endsWith('/src/main/moodle/sso-protocol.ts') || result.filePath.endsWith('/src/main/moodle/webview.ts')))))) process.exitCode = 1;
