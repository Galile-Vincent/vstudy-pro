/** Select the host desktop target and invoke electron-builder through Node rather than a command shell. */
import { URL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, platform: { type: 'string' } } });
const platform = values.platform ?? process.platform;
const targets = { darwin: ['--mac', 'dmg', 'dir'], win32: ['--win', 'nsis', 'dir'] }[platform];
if (!targets) throw new Error('Desktop packaging currently supports macOS and Windows.');
const require = createRequire(new URL('../package.json', import.meta.url));
const command = { executable: process.execPath, args: [require.resolve('electron-builder/cli.js'), ...targets] };
if (values['dry-run']) console.log(JSON.stringify({ platform, command }));
else execFileSync(command.executable, command.args, { stdio: 'inherit', shell: false });
