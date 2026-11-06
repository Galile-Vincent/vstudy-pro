/** Dispatch the core-owned Unix verifier build while leaving Windows named-pipe hosting to main. */
import { execFileSync } from 'node:child_process';
import { URL, fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, platform: { type: 'string' } } });
const platform = values.platform ?? process.platform;
if (!['darwin', 'linux', 'win32'].includes(platform)) throw new Error('Unsupported desktop build platform.');
const command = platform === 'win32' ? null : { executable: process.execPath,
  args: [fileURLToPath(new URL('../../../scripts/build-mcp-peer.mjs', import.meta.url))] };
if (values['dry-run']) console.log(JSON.stringify({ platform, command }));
else if (command) execFileSync(command.executable, command.args, { stdio: 'inherit', shell: false });
else console.log('Windows skips the Unix C verifier. Main owns named-pipe host and persistence wiring.');
