/** Verify config adapters only in isolated homes, including preservation and hostile paths. @packageDocumentation */
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { clientConfig, installableClients, type ClientOptions } from '../src/client-config';
import { editConfig, parseConfig } from '../src/config-edit';
import { installClient, restoreConfigBackup, uninstallClient } from '../src/installer';

const homes: string[] = [];
afterEach(() => { for (const path of homes.splice(0)) rmSync(path, { recursive: true, force: true }); });
function options(client: ClientOptions['client']): ClientOptions {
  const home = mkdtempSync('/private/tmp/vmi-'); homes.push(home);
  return { client, home, environment: {}, command: process.execPath, binPath: join(home, 'app with spaces', 'vstudy-mcp.cjs') };
}
function seed(options: ClientOptions, text: string): string {
  const { path } = clientConfig(options); mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, { mode: 0o600 }); return path;
}
function unrelated(format: 'json' | 'jsonc' | 'toml') {
  if (format === 'json') return '{"privateKey":"secret-not-for-diff","mcpServers":{"other":{"command":"other-command","args":["secret-not-for-diff"]}}}\n';
  return format === 'toml' ? '# retained comment\nmodel = "private-model"\n[mcp_servers.other]\ncommand = "other-command"\nargs = ["secret-not-for-diff"]\n'
    : '{\n  // retained comment\n  "privateKey": "secret-not-for-diff",\n  "mcpServers": { "other": { "command": "other-command", "args": ["secret-not-for-diff"] } },\n}\n';
}

describe('safe client installers', () => {
  for (const client of installableClients) {
    it(`${client} dry-run creates no files, folders, identities, or backups`, () => {
      const args = options(client);
      const result = installClient({ ...args, dryRun: true });
      expect(result.changed).toBe(true);
      expect(result.diff).toContain('vstudy');
      expect(readdirSync(args.home!)).toEqual([]);
      expect(uninstallClient({ ...args, dryRun: true }).changed).toBe(false);
      expect(readdirSync(args.home!)).toEqual([]);
    });

    it(`${client} preserves unrelated settings and comments, backs up, and is idempotent`, () => {
      const args = options(client);
      const config = clientConfig(args);
      const original = unrelated(config.format);
      const path = seed(args, original);
      const result = installClient(args);
      expect(result.changed).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(readFileSync(result.backupPath!, 'utf8')).toBe(original);
      expect(statSync(result.backupPath!).mode & 0o777).toBe(0o600);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(result.diff).not.toContain('secret-not-for-diff');
      const after = readFileSync(path, 'utf8');
      if (config.format !== 'json') expect(after).toContain(config.format === 'toml' ? '# retained comment' : '// retained comment');
      const parsed = parseConfig(after, config.format);
      const map = parsed[config.format === 'toml' ? 'mcp_servers' : 'mcpServers'] as Record<string, unknown>;
      expect(map.vstudy).toEqual(config.entry);
      expect(map.other).toEqual({ command: 'other-command', args: ['secret-not-for-diff'] });
      const listing = readdirSync(dirname(path));
      expect(installClient(args).changed).toBe(false);
      expect(readdirSync(dirname(path))).toEqual(listing);
      expect(readFileSync(path, 'utf8')).toBe(after);
      const removed = uninstallClient(args);
      expect(removed.changed).toBe(true);
      expect(isDeepStrictEqual(parseConfig(readFileSync(path, 'utf8'), config.format), parseConfig(original, config.format))).toBe(true);
      expect(uninstallClient(args).changed).toBe(false);
    });

    it(`${client} restores a selected backup and retains the displaced file`, () => {
      const args = options(client);
      const config = clientConfig(args);
      const original = unrelated(config.format);
      const path = seed(args, original);
      const installed = installClient(args);
      const current = readFileSync(path, 'utf8');
      expect(restoreConfigBackup({ ...args, backupPath: installed.backupPath!, dryRun: true }).changed).toBe(true);
      expect(readFileSync(path, 'utf8')).toBe(current);
      const restored = restoreConfigBackup({ ...args, backupPath: installed.backupPath! });
      expect(readFileSync(path, 'utf8')).toBe(original);
      expect(readFileSync(restored.backupPath!, 'utf8')).toBe(current);
      expect(() => restoreConfigBackup({ ...args, backupPath: '/private/tmp/arbitrary' })).toThrow();
    });

    it(`${client} refuses conflicts and edited entries without printing or overwriting them`, () => {
      const args = options(client);
      const config = clientConfig(args);
      const source = config.format === 'toml' ? '[mcp_servers.vstudy]\ncommand="private-secret"\n' : '{"mcpServers":{"vstudy":{"command":"private-secret"}}}';
      const path = seed(args, source);
      for (const change of [installClient, uninstallClient]) {
        expect(() => change(args)).toThrow(/conflicting/);
        try { change(args); } catch (error) { expect(String(error)).not.toContain('private-secret'); }
        expect(readFileSync(path, 'utf8')).toBe(source);
      }
      expect(readdirSync(dirname(path))).toEqual([client === 'codex' ? 'config.toml' : path.split('/').at(-1)]);
    });

    it(`${client} preserves spaces, quotes, dollar signs, and shell metacharacters as argv`, () => {
      const args = options(client);
      args.binPath = join(args.home!, "student's $() `work`; & notes", 'vstudy-mcp.cjs');
      const config = clientConfig(args);
      installClient(args);
      const parsed = parseConfig(readFileSync(config.path, 'utf8'), config.format);
      const map = parsed[config.format === 'toml' ? 'mcp_servers' : 'mcpServers'] as Record<string, Record<string, unknown>>;
      expect(map.vstudy?.args).toEqual([args.binPath, '--client', client]);
      expect(Object.keys(map.vstudy!)).not.toContain('grant');
    });
  }

  it('rejects symlinked files, parents, backups, and lock files', () => {
    const args = options('cursor');
    const target = join(args.home!, 'target'); writeFileSync(target, '{"private":"value"}');
    const path = clientConfig(args).path; mkdirSync(dirname(path)); symlinkSync(target, path);
    expect(() => installClient(args)).toThrow(/symlink/);
    expect(readFileSync(target, 'utf8')).toBe('{"private":"value"}');
    const other = options('codex'); symlinkSync(dirname(target), join(other.home!, '.codex'));
    expect(() => installClient(other)).toThrow(/symlink/);
    const third = options('claude');
    const thirdPath = seed(third, '{}'); symlinkSync(target, `${thirdPath}.vstudy-lock`);
    expect(() => installClient(third)).toThrow(/symlink/);
    expect(readFileSync(thirdPath, 'utf8')).toBe('{}');
    const backup = `${thirdPath}.vstudy-backup-00000000-0000-4000-8000-000000000000`;
    symlinkSync(target, backup);
    expect(() => restoreConfigBackup({ ...third, backupPath: backup })).toThrow(/symlink/);
  });

  it('rejects invalid, duplicate, scalar, and ambiguous configurations', () => {
    const args = options('claude');
    for (const text of ['', '{', '[]', '{"mcpServers":5}', '{"a":1,"a":2}', '{"mcpServers":{"vstudy":{},"vstudy":{}}}']) {
      seed(args, text);
      expect(() => installClient(args)).toThrow();
    }
    const codex = options('codex'); seed(codex, '[mcp_servers]\na=1\na=2');
    expect(() => installClient(codex)).toThrow();
  });

  it('rejects unsafe interpolation paths and generic automatic installation', () => {
    const args = options('cursor');
    expect(() => installClient({ ...args, binPath: '/app/${env:UNTRUSTED}/cli.cjs' })).toThrow(/interpolation/);
    expect(() => installClient({ ...args, client: 'generic' })).toThrow(/manual/);
    expect(existsSync(clientConfig(args).path)).toBe(false);
  });

  it('honors verified custom client homes and only removes the unchanged owned TOML block', () => {
    const args = options('codex');
    const custom = join(args.home!, 'custom codex');
    expect(clientConfig({ ...args, environment: { CODEX_HOME: custom } }).path).toBe(join(custom, 'config.toml'));
    const claude = options('claude');
    expect(clientConfig({ ...claude, environment: { CLAUDE_CONFIG_DIR: join(claude.home!, 'custom') } }).path).toBe(join(claude.home!, 'custom/.claude.json'));
    const config = clientConfig(args);
    const installed = editConfig('# keep\n', config, false).text;
    expect(() => editConfig(installed.replace('# vstudy-mcp managed entry end', 'unrelated = true\n# vstudy-mcp managed entry end'), config, true)).toThrow();
    expect(() => editConfig(installed.replace('# vstudy-mcp managed entry begin', '# changed'), config, true)).toThrow();
  });
});
