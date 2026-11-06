/** Build the main-only Unix peer credential helper for the current desktop target. */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--output')) throw new Error('Usage: node scripts/build-mcp-peer.mjs [--output path]');
if (!['darwin', 'linux'].includes(process.platform)) throw new Error('The MCP peer helper requires macOS or Linux.');
const output = resolve(args[1] ?? resolve(root, 'apps/desktop/resources/mcp-peer'));
const temporary = `${output}.${randomUUID()}.tmp`;
mkdirSync(dirname(output), {recursive: true});
try {
  const result = spawnSync(process.env.CC ?? 'cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', resolve(root, 'apps/desktop/resources/mcp-peer.c'), '-o', temporary], {stdio: 'inherit', shell: false});
  if (result.error || result.status !== 0) throw new Error('Failed to compile the MCP peer helper.');
  chmodSync(temporary, 0o755);
  renameSync(temporary, output);
} finally { rmSync(temporary, {force: true}); }
