/** Verify MCP resources in an actual packaged app without launching Electron. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { 'release-dir': { type: 'string' } } });
const release = resolve(values['release-dir'] ?? '../desktop/release');
const apps = readdirSync(release, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
  if (entry.name.startsWith('mac')) return [{ kind: 'mac', resources: join(release, entry.name, 'VStudy Pro.app/Contents/Resources') }];
  if (/^win.*unpacked$/.test(entry.name)) return [{ kind: 'win', resources: join(release, entry.name, 'resources') }];
  return [];
}).filter(app => existsSync(app.resources));
assert.ok(apps.length, 'Build a desktop app directory before checking packaged MCP resources.');
for (const { kind, resources } of apps) {
  const helper = join(resources, 'mcp-peer');
  if (kind === 'mac') {
    assert.ok(statSync(helper).isFile(), 'Native helper must be outside ASAR.');
    assert.ok(statSync(helper).mode & 0o111, 'Native helper must retain executable permissions.');
  }
  for (const file of ['dist/vstudy-mcp.cjs', 'dist/installer.cjs', 'dist/windows-acl.cjs', 'CLIENT_FORMATS.md',
    'plugins/claude/.mcp.json', 'plugins/claude/.claude-plugin/plugin.json',
    'plugins/agy/plugin.json', 'plugins/cursor/.cursor-plugin/plugin.json',
    'plugins/codex/skills/vstudy/SKILL.md', 'plugins/claude-desktop/README.md']) {
    const path = join(resources, 'mcp', file);
    assert.ok(statSync(path).isFile(), `Packaged MCP resource missing: ${file}`);
  }
  const bin = join(resources, 'mcp/dist/vstudy-mcp.cjs');
  assert.equal(execFileSync(process.execPath, [bin, '--version'], { encoding: 'utf8' }).trim(), '0.2.0');
  assert.ok(readFileSync(bin).equals(readFileSync('dist/vstudy-mcp.cjs')), 'Packaged CLI must match the built artifact.');
  console.log(`${resources}: CLI and client resources present. ${kind === 'mac' ? 'Unix helper executable outside ASAR.' : 'Unix helper not required. Main Windows host/persistence acceptance remains unverified.'}`);
  for (const path of [bin, ...(kind === 'mac' ? [helper] : [])]) console.log(`${path} sha256 ${createHash('sha256').update(readFileSync(path)).digest('hex')}`);
}
