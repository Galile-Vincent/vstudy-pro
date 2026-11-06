/** Run administration through the actual bundle without changing real client configurations. @packageDocumentation */
import { afterEach, describe, expect, it } from 'vitest';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { doctor } from '../src/doctor';
import { installableClients } from '../src/client-config';
import { fixture, grant } from './fixture';

const bin = resolve('dist/vstudy-mcp.cjs');
const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function home() {
  const path = mkdtempSync('/private/tmp/vcli-');
  cleanups.push(() => rmSync(path, { recursive: true, force: true })); return path;
}
function env(home: string) { return { HOME: home, PATH: process.env.PATH ?? '', VSTUDY_USER_DATA: join(home, 'app') }; }

describe('CLI administration', () => {
  it('supports help and version without contacting the app or creating grants', () => {
    const directory = home();
    expect(execFileSync(bin, ['--version'], { env: env(directory), encoding: 'utf8' })).toBe('0.2.0\n');
    expect(execFileSync(process.execPath, [bin, '--help'], { env: env(directory), encoding: 'utf8' })).toContain('--dry-run');
    expect(readdirSync(directory)).toEqual([]);
  });

  for (const client of installableClients) {
    it(`${client} installs only in a temporary home through the real CLI`, () => {
      const directory = home();
      const run = (command: string, ...args: string[]) => JSON.parse(execFileSync(process.execPath,
        [bin, command, '--client', client, '--json', ...args], { env: env(directory), encoding: 'utf8' }));
      expect(run('install', '--dry-run').changed).toBe(true);
      expect(readdirSync(directory)).toEqual([]);
      const installed = run('install');
      expect(installed.configPath.startsWith(directory + '/')).toBe(true);
      expect(existsSync(installed.configPath)).toBe(true);
      expect(JSON.stringify(installed)).not.toContain(grant);
      expect(readFileSync(installed.configPath, 'utf8')).not.toContain('grant');
      expect(run('install').changed).toBe(false);
      expect(run('uninstall', '--dry-run').changed).toBe(true);
      expect(run('uninstall').changed).toBe(true);
      expect(existsSync(join(directory, '.config/vstudy-mcp'))).toBe(false);
    });
  }

  it('launches an artifact with spaces, quotes, and shell syntax as one argv item', () => {
    const directory = home();
    const app = join(directory, "student's $() `study`; & app"); mkdirSync(app);
    const copied = join(app, 'vstudy-mcp.cjs'); copyFileSync(bin, copied);
    const output = execFileSync(process.execPath, [copied, 'install', '--client', 'cursor', '--json'], { env: env(directory), encoding: 'utf8' });
    const result = JSON.parse(output);
    const entry = JSON.parse(readFileSync(result.configPath, 'utf8')).mcpServers.vstudy;
    expect(entry.args).toEqual([copied, '--client', 'cursor']);
    expect(execFileSync(entry.command, [entry.args[0], '--version'], { env: env(directory), encoding: 'utf8' })).toBe('0.2.0\n');
  });

  it('rejects unknown arguments with fixed stderr and no stdout', () => {
    const directory = home();
    for (const args of [['unknown'], ['install'], ['--client', 'not-a-client'], ['--grant', 'must-not-print'], ['--dry-run']]) {
      const result = spawnSync(process.execPath, [bin, ...args], { env: env(directory), encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).not.toContain('must-not-print');
    }
    expect(readdirSync(directory)).toEqual([]);
  });

  it('doctor pings the actual fixture without pairing or printing private contents', async () => {
    const app = await fixture(); cleanups.push(app.close);
    let stdout = '';
    try {
      const result = await promisify(execFile)(process.execPath, [bin, 'doctor', '--client', 'codex', '--json'],
        { env: { ...env(app.home), VSTUDY_USER_DATA: app.userData }, timeout: 5000 });
      stdout = result.stdout;
    } catch (error) {
      if (!(error instanceof Error) || !('stdout' in error)) throw error;
      stdout = String(error.stdout);
    }
    const result = JSON.parse(stdout);
    expect(result.checks).toContainEqual({ name: 'bridge', ok: true, detail: 'Running bridge protocol 1.' });
    expect(stdout).not.toContain(grant);
    expect(app.calls.map(call => call.method)).toEqual(['ping']);
    expect(existsSync(join(app.home, '.config'))).toBe(false);
  });

  it('exports installer and doctor APIs for desktop IPC without starting stdio', async () => {
    const api = createRequire(import.meta.url)(resolve('dist/installer.cjs'));
    expect(Object.keys(api).sort()).toEqual(['detectClients', 'doctor', 'installClient', 'restoreConfigBackup', 'uninstallClient']);
    const directory = home();
    const result = api.installClient({ client: 'codex', home: directory, environment: { PATH: process.env.PATH }, dryRun: true });
    expect(result.changed).toBe(true);
    expect(readdirSync(directory)).toEqual([]);
    const diagnosis = await doctor({ home: directory, client: 'codex', userData: join(directory, 'app'), environment: { PATH: process.env.PATH } });
    expect(diagnosis.ok).toBe(false);
    expect(readdirSync(directory)).toEqual([]);
  });
});
