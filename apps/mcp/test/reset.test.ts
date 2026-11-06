/** Reconnect explicitly after local expiry or revocation without exposing or automatically renewing grants. @packageDocumentation */
import { afterEach, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fixture, grant } from './fixture';
import { Credentials } from '../src/credentials';
import { credentialPath } from '../src/paths';

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const bin = resolve('dist/vstudy-mcp.cjs');

for (const state of ['expired', 'revoked'] as const) {
  it(`resets a ${state} local credential and pairs the next fresh server with the same clientId`, async () => {
    const failure = state === 'revoked' ? { toolFailure: 'DENIED' as const, toolFailureRpc: true } : {};
    const app = await fixture(failure); cleanups.push(app.close);
    const credentials = new Credentials(credentialPath('codex', app.home));
    const identity = credentials.identity();
    credentials.save({ ...identity, grant, expiresAt: state === 'expired' ? '2020-01-01T00:00:00.000Z' : new Date(Date.now() + 86_400_000).toISOString() });
    const env = { HOME: app.home, PATH: process.env.PATH ?? '', VSTUDY_USER_DATA: app.userData };
    async function connect() {
      const client = new Client({ name: 'Reset fixture', version: '1.0.0' });
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin, '--client', 'codex'], env, stderr: 'pipe' }));
      cleanups.push(() => client.close()); return client;
    }
    const beforeClient = await connect();
    const failed = await beforeClient.callTool({ name: 'list_accounts', arguments: {} });
    expect(failed.structuredContent).toMatchObject({ ok: false, error: { code: state === 'expired' ? 'EXPIRED' : 'DENIED' } });
    expect(app.calls.filter(call => call.method === 'pair.begin')).toHaveLength(0);
    await beforeClient.close();
    const methods = app.calls.length;
    const original = readFileSync(credentials.path, 'utf8');
    const dry = execFileSync(process.execPath, [bin, 'reset', '--client', 'codex', '--dry-run', '--json'], { env, encoding: 'utf8' });
    expect(JSON.parse(dry).changed).toBe(true);
    expect(readFileSync(credentials.path, 'utf8')).toBe(original);
    const output = execFileSync(process.execPath, [bin, 'reset', '--client', 'codex', '--json'], { env, encoding: 'utf8' });
    expect(JSON.parse(output).changed).toBe(true);
    expect(output + dry).not.toContain(grant);
    expect(JSON.parse(readFileSync(credentials.path, 'utf8'))).toEqual({ clientId: identity.clientId });
    expect(statSync(credentials.path).mode & 0o777).toBe(0o600);
    expect(app.calls).toHaveLength(methods);
    expect(JSON.parse(execFileSync(process.execPath, [bin, 'reset', '--client', 'codex', '--json'], { env, encoding: 'utf8' })).changed).toBe(false);
    const next = await connect();
    await next.callTool({ name: 'list_accounts', arguments: {} });
    const begin = app.calls.find(call => call.method === 'pair.begin');
    expect(begin?.params).toMatchObject({ clientId: identity.clientId, scopes: ['read:courses', 'read:content', 'read:calendar', 'read:files'] });
    expect(app.calls.filter(call => call.method === 'pair.begin')).toHaveLength(1);
    expect(credentials.read()?.grant).toBe(grant);
  });
}
