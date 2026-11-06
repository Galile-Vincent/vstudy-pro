/** Check distributable entry points and plugin assets without touching client configurations. */
import { accessSync, constants, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
for (const name of ['vstudy-mcp', 'installer', 'windows-acl']) {
  const path = `dist/${name}.cjs`;
  accessSync(path, constants.R_OK);
  console.log(`${path} sha256 ${createHash('sha256').update(readFileSync(path)).digest('hex')}`);
}
const output = execFileSync(process.execPath, ['dist/vstudy-mcp.cjs', '--version'], { encoding: 'utf8' }).trim();
if (output !== '0.2.0') throw new Error('Bundled CLI version mismatch.');
for (const client of ['claude', 'codex', 'agy', 'claude-desktop', 'cursor']) {
  accessSync(`plugins/${client}/README.md`, constants.R_OK);
}
accessSync('plugins/claude/.claude-plugin/plugin.json', constants.R_OK);
accessSync('plugins/claude/.mcp.json', constants.R_OK);
console.log('Bundled CLI executes and all five client asset packages exist.');
const artifact = readFileSync('dist/vstudy-mcp.cjs');
for (const client of ['claude', 'agy', 'cursor']) {
  if (!readFileSync(`plugins/${client}/dist/vstudy-mcp.cjs`).equals(artifact)) {
    throw new Error(`${client} plugin does not include the current CLI artifact.`);
  }
}
console.log('Native plugin CLI copies match the standalone artifact.');
