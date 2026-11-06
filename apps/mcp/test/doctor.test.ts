/** Check stored bearer authorization without pairing, app launch, or account-content output. @packageDocumentation */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { doctor, detectClients } from '../src/doctor';
import { Credentials } from '../src/credentials';
import { credentialPath } from '../src/paths';
import { fixture, grant, malicious, type FixtureOptions } from './fixture';
import type { McpErrorCode } from '../src/contract';

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function setup(options: FixtureOptions = {}) {
  const app = await fixture(options); cleanups.push(app.close);
  const credentials = new Credentials(credentialPath('codex', app.home));
  const identity = credentials.identity();
  credentials.save({ ...identity, grant, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  const before = readFileSync(credentials.path, 'utf8');
  return { app, credentials, before, run: () => doctor({ home: app.home, userData: app.userData, client: 'codex', command: process.execPath, environment: {} }) };
}

describe('doctor grant probe', () => {
  it('checks live authorization on the ping connection and discards account content', async () => {
    const { app, credentials, before, run } = await setup({ echoGrant: true });
    const result = await run();
    expect(result.checks.find(check => check.name === 'codex-grant')).toMatchObject({ ok: true });
    expect(app.calls.map(call => call.method)).toEqual(['ping', 'tools.call']);
    expect(app.connections).toBe(1);
    const call = app.calls[1];
    expect(call?.method === 'tools.call' && call.params).toMatchObject({ name: 'list_accounts', grant, args: {} });
    expect(JSON.stringify(result)).not.toContain(grant);
    expect(JSON.stringify(result)).not.toContain(malicious);
    expect(readFileSync(credentials.path, 'utf8')).toBe(before);
  });

  for (const code of ['DENIED', 'EXPIRED', 'DISABLED', 'SCOPE_REQUIRED', 'UNPAIRED'] satisfies McpErrorCode[]) {
    for (const toolFailureRpc of [false, true]) {
      it(`reports ${code} from ${toolFailureRpc ? 'JSON-RPC errors' : 'the tool envelope'} without pairing`, async () => {
        const { app, credentials, before, run } = await setup({ toolFailure: code, toolFailureRpc });
        const result = await run();
        const check = result.checks.find(check => check.name === 'codex-grant');
        expect(check?.ok).toBe(false);
        expect(check?.detail).toContain(code);
        if (code === 'SCOPE_REQUIRED') expect(check?.detail).toContain('recognized the bearer');
        if (code === 'DENIED') expect(check?.detail).toContain('revoked');
        expect(JSON.stringify(result)).not.toContain(grant);
        expect(app.calls.map(call => call.method)).toEqual(['ping', 'tools.call']);
        expect(readFileSync(credentials.path, 'utf8')).toBe(before);
      });
    }
  }

  it('does not create an identity or attempt pairing when there is no bearer', async () => {
    const app = await fixture(); cleanups.push(app.close);
    const result = await doctor({ home: app.home, userData: app.userData, client: 'codex', command: process.execPath, environment: {} });
    expect(result.checks.find(check => check.name === 'codex-grant')?.ok).toBe(false);
    expect(app.calls.map(call => call.method)).toEqual(['ping']);
    expect(existsSync(credentialPath('codex', app.home))).toBe(false);
  });

  it('does not claim stored metadata proves authorization when the app is absent', async () => {
    const { app, credentials, before } = await setup();
    const result = await doctor({ home: app.home, userData: join(app.root, 'absent'), client: 'codex', command: process.execPath, environment: {} });
    const check = result.checks.find(check => check.name === 'codex-grant');
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('could not be checked');
    expect(app.calls).toEqual([]);
    expect(readFileSync(credentials.path, 'utf8')).toBe(before);
  });

  it('returns an actionable quoted install command without shell interpolation', () => {
    const home = mkdtempSync('/private/tmp/vcmd-'); cleanups.push(() => rmSync(home, { recursive: true, force: true }));
    const directory = join(home, "student's $() `notes`; & app"); mkdirSync(directory);
    const binPath = join(directory, 'vstudy-mcp.cjs'); copyFileSync(resolve('dist/vstudy-mcp.cjs'), binPath);
    const detected = detectClients({ home, command: process.execPath, binPath, environment: {} });
    const command = detected.find(client => client.client === 'codex')!.command;
    const result = JSON.parse(execFileSync('/bin/sh', ['-c', command + ' --dry-run --json'],
      { env: { HOME: home, PATH: process.env.PATH ?? '' }, encoding: 'utf8' }));
    expect(result.changed).toBe(true);
    expect(result.configPath).toBe(join(home, '.codex/config.toml'));
    expect(readdirSync(home)).toEqual([directory.split('/').at(-1)]);
  });
});
