import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, handle, type Bindings, type Database, type Statement } from '../src/index';
import { signToken, verifyToken } from '../src/tokens';
import { acceptedResponseSchema, subscribeRequestSchema } from '../src/contract';
import { confirmationEmail, consentText } from '../src/email';

class SqlStatement implements Statement {
  values: (string | number | null)[] = [];
  constructor(readonly db: DatabaseSync, readonly sql: string) {}
  bind(...values: (string | number | null)[]) { this.values = values; return this; }
  async first<T>(): Promise<T | null> { return (this.db.prepare(this.sql).get(...this.values) as T | undefined) ?? null; }
  async run() { return this.db.prepare(this.sql).run(...this.values); }
}
class SqlDatabase implements Database {
  readonly sqlite = new DatabaseSync(':memory:');
  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.sqlite.exec(readFileSync(new NodeURL('../migrations/0001_newsletter.sql', import.meta.url), 'utf8'));
  }
  prepare(sql: string) { return new SqlStatement(this.sqlite, sql); }
  async batch(statements: Statement[]) {
    this.sqlite.exec('BEGIN');
    try { for (const statement of statements) await statement.run(); this.sqlite.exec('COMMIT'); }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
const valid = { email: 'Student@example.com', locale: 'en', source: 'onboarding', consent: true, app_version: '1.2.3' };
const now = Date.parse('2026-11-06T00:00:00Z');
let db: SqlDatabase;
let env: Omit<Bindings, 'DB'> & { DB: SqlDatabase };
const transport = vi.fn<typeof fetch>();
function request(path: string, value?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://newsletter.example${path}`, value === undefined ? { headers } : {
    method: 'POST', body: JSON.stringify(value), headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...headers },
  });
}
async function subscriber() { return db.prepare('SELECT * FROM subscribers').first<{ id: string; state: string; email: string; confirmed_at: number | null }>(); }
async function token(purpose: 'confirm' | 'unsubscribe' | 'delete', expiry = now + 86400000) {
  return signToken(env.UNSUBSCRIBE_SIGNING_SECRET, purpose, (await subscriber())!.id, expiry);
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  db = new SqlDatabase();
  env = { DB: db, RESEND_API_KEY: 'mock-only', UNSUBSCRIBE_SIGNING_SECRET: 'mock-signing-secret-with-at-least-32-bytes', FROM_EMAIL: 'updates@example.com', PUBLIC_BASE_URL: 'https://newsletter.example', ALLOWED_ORIGINS: 'https://vstudy.example' };
  transport.mockReset().mockImplementation(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', transport);
});
afterEach(() => { db.sqlite.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('newsletter', () => {
  it.each([
    { ...valid, consent: false }, { ...valid, consent: undefined }, { ...valid, email: 'invalid' },
    { ...valid, email: 'x@example.com\r\nBcc: y@example.com' }, { ...valid, source: 'other' },
    { ...valid, locale: 'fr' }, { ...valid, installation_id: 'forbidden' }, { ...valid, app_version: '../bad' },
  ])('rejects invalid or nonconsenting input with generic response: %j', async input => {
    expect(subscribeRequestSchema.safeParse(input).success).toBe(false);
    const response = await handle(request('/v1/subscribe', input), env);
    expect(response.status).toBe(202);
    expect(acceptedResponseSchema.parse(await response.json())).toEqual({ status: 'accepted' });
    expect(await subscriber()).toBeNull(); expect(transport).not.toHaveBeenCalled();
  });
  it('stores minimal consent and pending data; only explicit confirmation activates', async () => {
    expect((await handle(request('/v1/subscribe', valid), env)).status).toBe(202);
    expect(await subscriber()).toMatchObject({ state: 'pending', email: 'student@example.com' });
    const receipt = await db.prepare('SELECT * FROM consent_receipts').first();
    expect(receipt).toEqual({ subscriber_id: (await subscriber())!.id, consent_at: now, policy_version: 'newsletter-policy-2026-11-06', consent_text_version: 'newsletter-consent-v1', locale: 'en', source: 'onboarding', app_version: '1.2.3' });
    const mail = JSON.parse(transport.mock.calls[0]![1]!.body as string);
    expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(mail.text).not.toContain('student@example.com');
    const confirmUrl = mail.text.match(/https:\/\/newsletter.example\/v1\/confirm\?token=\S+/)[0];
    await handle(new Request(confirmUrl), env);
    expect(await subscriber()).toMatchObject({ state: 'active', confirmed_at: now });
    await handle(new Request(confirmUrl), env);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('uses generic identical responses for new, duplicate, rate-limited and provider-failed requests', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    transport.mockImplementation(async () => new Response('private email provider detail', { status: 500 }));
    for (let i = 0; i < 8; i++) {
      const response = await handle(request('/v1/subscribe', valid), env);
      expect(response.status).toBe(202); expect(await response.json()).toEqual({ status: 'accepted' });
    }
    expect(transport).toHaveBeenCalledTimes(1);
    expect(log.mock.calls).toEqual([[JSON.stringify({ error: 'email_delivery' })]]);
  });
  it('enforces 5 attempts per 15 minute salted bucket and expires buckets', async () => {
    for (let i = 0; i < 7; i++) await handle(request('/v1/subscribe', { ...valid, email: `s${i}@example.com` }), env);
    expect(transport).toHaveBeenCalledTimes(5);
    const rows = db.sqlite.prepare('SELECT * FROM rate_buckets').all();
    expect(rows).toHaveLength(1); expect(JSON.stringify(rows)).not.toContain('192.0.2.1');
    expect(rows[0]!.bucket_hash).toMatch(/^[0-9a-f]{64}$/);
    vi.spyOn(Date, 'now').mockReturnValue(now + 900000);
    await handle(request('/v1/subscribe', { ...valid, email: 'next@example.com' }), env);
    expect(transport).toHaveBeenCalledTimes(6);
    await cleanup(env, now + 1800000);
    expect(db.sqlite.prepare('SELECT * FROM rate_buckets').all()).toHaveLength(0);
  });
  it('fails closed when trusted edge IP is missing', async () => {
    const r = request('/v1/subscribe', valid); r.headers.delete('CF-Connecting-IP');
    await handle(r, env); expect(transport).not.toHaveBeenCalled();
  });
  it('validates tamper, purpose and expiry and prevents reactivation after unsubscribe', async () => {
    await handle(request('/v1/subscribe', valid), env);
    const t = await token('confirm');
    expect(await verifyToken(env.UNSUBSCRIBE_SIGNING_SECRET, t.slice(0, -1) + (t.endsWith('0') ? '1' : '0'), 'confirm', now)).toBeNull();
    expect(await verifyToken(env.UNSUBSCRIBE_SIGNING_SECRET, t, 'delete', now)).toBeNull();
    expect(await verifyToken(env.UNSUBSCRIBE_SIGNING_SECRET, t, 'confirm', now + 86400000)).toBeNull();
    expect((await handle(request('/v1/confirm?token=bad'), env)).status).toBe(400);
    const u = await token('unsubscribe');
    for (let i = 0; i < 2; i++) expect((await handle(new Request(`https://newsletter.example/v1/unsubscribe?token=${u}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }), env)).status).toBe(200);
    await handle(request(`/v1/confirm?token=${t}`), env);
    await handle(request('/v1/subscribe', valid), env);
    expect((await subscriber())!.state).toBe('unsubscribed');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('erases subscriber and receipt, is idempotent, and old links cannot affect a fresh signup', async () => {
    await handle(request('/v1/subscribe', valid), env);
    const t = await token('delete'); const oldConfirm = await token('confirm');
    for (let i = 0; i < 2; i++) expect((await handle(request('/v1/delete', { token: t }), env)).status).toBe(200);
    expect(await subscriber()).toBeNull(); expect(await db.prepare('SELECT * FROM consent_receipts').first()).toBeNull();
    await handle(request('/v1/subscribe', valid), env);
    await handle(request(`/v1/confirm?token=${oldConfirm}`), env);
    expect((await subscriber())!.state).toBe('pending');
  });
  it('does not activate expired pending records and cleanup cascades receipts', async () => {
    await handle(request('/v1/subscribe', valid), env);
    const t = await token('confirm', now + 10 * 86400000);
    vi.spyOn(Date, 'now').mockReturnValue(now + 48 * 3600000);
    await handle(request(`/v1/confirm?token=${t}`), env);
    expect((await subscriber())!.state).toBe('pending');
    await cleanup(env, Date.now()); expect(await subscriber()).toBeNull();
    expect(await db.prepare('SELECT * FROM consent_receipts').first()).toBeNull();
  });
  it('retains active subscribers and removes opt-outs after 30 days', async () => {
    await handle(request('/v1/subscribe', valid), env);
    await handle(request(`/v1/confirm?token=${await token('confirm')}`), env);
    await cleanup(env, now + 50 * 86400000); expect((await subscriber())!.state).toBe('active');
    await handle(request(`/v1/unsubscribe?token=${await token('unsubscribe')}`), env);
    await cleanup(env, now + 30 * 86400000); expect(await subscriber()).toBeNull();
  });
  it('closes CORS except configured origins, rejects null, and supports native no-Origin JSON', async () => {
    for (const origin of ['https://evil.example', 'null']) expect((await handle(request('/v1/subscribe', valid, { Origin: origin }), env)).status).toBe(403);
    const good = await handle(request('/v1/subscribe', valid, { Origin: 'https://vstudy.example' }), env);
    expect(good.headers.get('Access-Control-Allow-Origin')).toBe('https://vstudy.example');
    expect(good.headers.get('Referrer-Policy')).toBe('no-referrer');
    const native = await handle(request('/v1/subscribe', valid), env); expect(native.status).toBe(202);
    expect(native.headers.has('Access-Control-Allow-Origin')).toBe(false);
    const preflight = await handle(new Request('https://newsletter.example/v1/subscribe', { method: 'OPTIONS', headers: { Origin: 'https://vstudy.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } }), env);
    expect(preflight.status).toBe(204);
  });
  it('bounds streamed bodies without trusting Content-Length and requires JSON', async () => {
    for (const r of [request('/v1/subscribe', valid, { 'Content-Type': 'text/plain' }), new Request('https://newsletter.example/v1/subscribe', { method: 'POST', body: '{bad', headers: { 'Content-Type': 'application/json' } }), request('/v1/subscribe', { ...valid, extra: 'x'.repeat(5000) })]) {
      expect((await handle(r, env)).status).toBe(202);
    }
    expect(transport).not.toHaveBeenCalled(); expect(await subscriber()).toBeNull();
    expect((await handle(request('/v1/delete', { token: 'x'.repeat(5000) }), env)).status).toBe(400);
  });
  it('logs no PII or tokens even when dependencies throw sensitive errors', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    transport.mockRejectedValue(new Error('Student@example.com 192.0.2.1 secret mock-only'));
    await handle(request('/v1/subscribe', valid), env);
    expect(log.mock.calls).toEqual([[JSON.stringify({ error: 'request_failed' })]]);
  });
  it('rolls back pending creation when consent storage fails, without exposing the error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.sqlite.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON consent_receipts BEGIN SELECT RAISE(ABORT, 'private Student@example.com'); END;");
    const response = await handle(request('/v1/subscribe', valid), env);
    expect(response.status).toBe(202);
    expect(await subscriber()).toBeNull(); expect(transport).not.toHaveBeenCalled();
    expect(log.mock.calls).toEqual([[JSON.stringify({ error: 'request_failed' })]]);
  });
  it('rejects unsigned erasure and non-one-click unsubscribe POST without changing state', async () => {
    await handle(request('/v1/subscribe', valid), env);
    expect((await handle(request('/v1/delete', { token: 'bad' }), env)).status).toBe(400);
    const u = await token('unsubscribe');
    expect((await handle(request(`/v1/unsubscribe?token=${u}`, {}), env)).status).toBe(400);
    expect((await subscriber())!.state).toBe('pending');
    expect((await handle(request('/unknown'), env)).status).toBe(404);
  });
  it('fails closed on weak or missing server configuration', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    env.UNSUBSCRIBE_SIGNING_SECRET = 'weak';
    expect((await handle(request('/v1/subscribe', valid), env)).status).toBe(202);
    expect(await subscriber()).toBeNull(); expect(transport).not.toHaveBeenCalled();
  });
  it.each(['en', 'ja', 'zh-Hant'] as const)('has short localized plain text and unsubscribe headers for %s', locale => {
    const email = confirmationEmail(locale, 'https://example.com/c', 'https://example.com/u', 'delete-token');
    expect(email.text.length).toBeLessThan(600); expect(email.subject).toBeTruthy(); expect(consentText[locale]).toBeTruthy();
    expect(email.headers).toEqual({ 'List-Unsubscribe': '<https://example.com/u>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
  });
});
