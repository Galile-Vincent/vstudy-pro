/** Require a complete signing backend while sharing the ordinary native packaging path. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { signingMode } from './release-contract.mjs';
import { pnpmInvocation } from './platform.mjs';

const desktop = fileURLToPath(new URL('..', import.meta.url));
if (process.platform === 'darwin' && !process.env.CSC_NAME && !process.env.CSC_LINK) {
  console.error('Developer ID identity missing: set CSC_NAME (installed Developer ID Application certificate) or CSC_LINK and CSC_KEY_PASSWORD.');
  process.exit(1);
}
if (signingMode(process.platform === 'darwin' ? 'mac' : 'win', process.env) === 'unsigned') throw new Error('Signing credentials are required by package:signed');
if (!process.env.npm_execpath) throw new Error('Run this helper through pnpm package:signed');
const buildCommand = pnpmInvocation(['build']);
const build = spawnSync(buildCommand.command, buildCommand.args, { cwd: desktop, stdio: 'inherit', windowsHide: true });
if (build.status !== 0) process.exit(build.status ?? 1);
const result = spawnSync(process.execPath, [fileURLToPath(new URL('package-release.mjs', import.meta.url)), '--require-signing', ...process.argv.slice(2)], { cwd: desktop, stdio: 'inherit' });
process.exit(result.status ?? 1);
