/** Probe installed client config readers in disposable homes and print no private configuration. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { parse as toml } from 'smol-toml';
import { createRequire } from 'node:module';
const { detectClients } = createRequire(import.meta.url)(resolve('dist/installer.cjs'));
const root = mkdtempSync('/private/tmp/vstudy-format-check-');
const originalHome = homedir();
try {
  for (const client of detectClients()) {
    const binary = client.client === 'claude-desktop' ? undefined : process.env.PATH?.split(':')
      .map(path => join(path, client.client)).find(path => existsSync(path));
    if (!binary) { console.log(`${client.client}: no CLI config reader detected; app detection ${client.detected ? 'found' : 'absent'}`); continue; }
    const home = join(root, client.client); mkdirSync(home);
    const env = { HOME: home, PATH: process.env.PATH ?? '' };
    execFileSync(process.execPath, [resolve('dist/vstudy-mcp.cjs'), 'install', '--client', client.client, '--json'], { env, timeout: 5000 });
    const args = client.client === 'codex' ? ['mcp', 'get', 'vstudy', '--json']
      : client.client === 'claude' ? ['mcp', 'get', 'vstudy'] : ['mcp', 'list'];
    const output = execFileSync(binary, args, { env, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
    if (!output.includes('vstudy')) throw new Error(`${client.client} did not recognize its isolated entry.`);
    const version = execFileSync(binary, ['--version'], { env, encoding: 'utf8', timeout: 5000 }).match(/\d+\.\d+\.\d+/)?.[0];
    console.log(`${client.client}: ${version}, isolated config reader accepted vstudy; no conversation launched`);
  }
  for (const [client, path, format] of [
    ['claude', '.claude.json', 'json'], ['codex', '.codex/config.toml', 'toml'],
    ['agy', '.gemini/config/mcp_config.json', 'json'],
    ['claude-desktop', 'Library/Application Support/Claude/claude_desktop_config.json', 'json'],
    ['cursor', '.cursor/mcp.json', 'json'],
  ]) {
    const full = join(originalHome, path);
    if (!existsSync(full)) { console.log(`${client}: actual config absent`); continue; }
    try {
      const source = readFileSync(full, 'utf8');
      const value = format === 'toml' ? toml(source) : JSON.parse(source);
      const servers = value[format === 'toml' ? 'mcp_servers' : 'mcpServers'] ?? {};
      console.log(`${client}: actual config parsed; ${Object.keys(servers).length} server entries; contents withheld`);
    } catch { console.log(`${client}: actual config does not parse; contents withheld`); }
  }
} finally { rmSync(root, { recursive: true, force: true }); }
