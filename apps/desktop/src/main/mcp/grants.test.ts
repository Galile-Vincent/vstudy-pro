/** Grants are private, expiring, durable, and independently revocable. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, statSync, rmSync, symlinkSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { GrantStore } from './grants';
import { testStatePersistence } from './state-test-fixture';

const directories: string[] = [];
function directory() { const path = mkdtempSync(join(tmpdir(), 'vmp-')); directories.push(path); return path; }
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, {recursive: true, force: true}); });

it.skipIf(process.platform==='win32')('defaults off and persists only hashed independent 30-day grants with private permissions', () => {
  const root = directory();
  let now = Date.parse('2026-11-06T00:00:00Z');
  const store = new GrantStore(root, () => now,testStatePersistence(root));
  expect(store.enabled).toBe(false);
  store.setEnabled(true);
  const account = randomUUID();
  const first = store.issue(randomUUID(), 'Codex', ['read:courses'], [account]);
  const second = store.issue(randomUUID(), 'Claude', ['read:files'], [account]);
  const raw = readFileSync(join(root, 'mcp/state.json'), 'utf8');
  expect(raw).not.toContain(first.grant);
  expect(raw).not.toContain(second.grant);
  expect(JSON.parse(raw).grants[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(store.grants)).not.toContain('tokenHash');
  expect(Date.parse(first.grantInfo.expiresAt) - now).toBe(30 * 24 * 60 * 60 * 1000);
  expect(statSync(join(root, 'mcp')).mode & 0o777).toBe(0o700);
  expect(statSync(join(root, 'mcp/state.json')).mode & 0o777).toBe(0o600);
  const restarted = new GrantStore(root, () => now,testStatePersistence(root));
  expect(restarted.authorize(first.grant).accountIds).toEqual([account]);
  restarted.revoke(first.grantInfo.id);
  expect(() => restarted.authorize(first.grant)).toThrow('DENIED');
  expect(restarted.authorize(second.grant).clientName).toBe('Claude');
  now += 30 * 24 * 60 * 60 * 1000;
  expect(() => restarted.authorize(second.grant)).toThrow('EXPIRED');
});

it('re-pairing invalidates the old bearer and editing cannot extend beyond 30 days', () => {
  const root=directory();const store = new GrantStore(root,Date.now,testStatePersistence(root));
  store.setEnabled(true);
  const client = randomUUID();
  const old = store.issue(client, 'Codex', ['read:courses'], []);
  const fresh = store.issue(client, 'Codex', ['read:files'], []);
  expect(() => store.authorize(old.grant)).toThrow('DENIED');
  expect(store.authorize(fresh.grant).scopes).toEqual(['read:files']);
  expect(() => store.edit(fresh.grantInfo.id, [], [], new Date(Date.now() + 31 * 86400_000).toISOString())).toThrow('INVALID_ARGUMENT');
  store.setEnabled(false);
  expect(() => store.authorize(fresh.grant)).toThrow('DISABLED');
});

it.skipIf(process.platform==='win32')('rejects symlinked directories, state files, corrupt state, and public state files', () => {
  const root = directory();
  const external = directory();
  symlinkSync(external, join(root, 'mcp'));
  expect(() => new GrantStore(root)).toThrow('DENIED');
  rmSync(join(root, 'mcp'));
  mkdirSync(join(root, 'mcp'));
  writeFileSync(join(external, 'state.json'), '{}');
  symlinkSync(join(external, 'state.json'), join(root, 'mcp/state.json'));
  expect(() => new GrantStore(root)).toThrow('DENIED');
  rmSync(join(root, 'mcp/state.json'));
  writeFileSync(join(root, 'mcp/state.json'), '{}', {mode: 0o600});
  expect(() => new GrantStore(root)).toThrow('DENIED');
  rmSync(join(root, 'mcp/state.json'));
  const store = new GrantStore(root);
  store.setEnabled(true);
  chmodSync(join(root, 'mcp/state.json'), 0o644);
  expect(() => new GrantStore(root)).toThrow('DENIED');
});

it('retains at most 1000 sanitized activity records for 30 days', () => {
  let now = Date.parse('2026-11-06T00:00:00Z');
  const root = directory();
  const entry = {id: randomUUID(), at: new Date(now).toISOString(), clientName: 'Codex', tool: 'list_accounts' as const, accountId: null, status: 'OK', args: {}};
  mkdirSync(join(root, 'mcp'), {mode: 0o700});
  writeFileSync(join(root, 'mcp/state.json'), JSON.stringify({version: 1, enabled: false, grants: [], activity: Array.from({length: 1000}, () => ({...entry, id: randomUUID()}))}), {mode: 0o600});
  const store = new GrantStore(root, () => now,testStatePersistence(root));
  const {grantInfo} = store.issue(randomUUID(), 'Codex', [], []);
  store.record(grantInfo.id, entry);
  expect(store.activity).toHaveLength(1000);
  expect(store.activity.at(-1)?.status).toBe('OK');
  store.record(grantInfo.id, {...entry, args: {text: '字'.repeat(4000)}});
  expect(Buffer.byteLength(JSON.stringify(store.activity.at(-1)))).toBeLessThanOrEqual(4096);
  expect(store.activity.at(-1)?.args).toEqual({omitted: 'Arguments exceed the retained activity limit.'});
  now += 31 * 86400_000;
  expect(new GrantStore(root, () => now,testStatePersistence(root)).activity).toEqual([]);
});
it('keeps grant policy independent of platform private-file enforcement',()=>{
  let text:string|undefined;
  const persistence={read:()=>text,write:(_root:string,value:string)=>{text=value;}};
  const store=new GrantStore('C:\\profile',Date.now,persistence);store.setEnabled(true);
  const {grant,grantInfo}=store.issue(randomUUID(),'Windows client',['read:courses'],[randomUUID()]);
  expect(text).not.toContain(grant);expect(text).toContain('tokenHash');
  const restarted=new GrantStore('C:\\profile',Date.now,persistence);
  expect(restarted.authorize(grant).id).toBe(grantInfo.id);
  restarted.revoke(grantInfo.id);expect(()=>restarted.authorize(grant)).toThrow('DENIED');
});
