import { deleteRequestSchema, subscribeRequestSchema } from './contract';
import { confirmationEmail } from './email';
import { mac, signToken, verifyToken } from './tokens';

export type Bindings = Env & {
  RESEND_API_KEY: string;
  UNSUBSCRIBE_SIGNING_SECRET: string;
  FROM_EMAIL: string;
  PUBLIC_BASE_URL: string;
  ALLOWED_ORIGINS: string;
};
// Small binding surface lets the tests execute actual SQL without emulating D1 internals.
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
}
export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
type Environment = Omit<Bindings, 'DB'> & { DB: Database };
const HOUR = 3_600_000;
const LIMIT = 4096;
const ACCEPTED = { status: 'accepted' };

class InvalidRequest extends Error {}
async function body(request: Request): Promise<string> {
  if (Number(request.headers.get('Content-Length')) > LIMIT) throw new InvalidRequest();
  const reader = request.body?.getReader();
  if (!reader) return '';
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) { await reader.cancel(); throw new InvalidRequest(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
}
function jsonBody(request: Request, text: string): unknown {
  if (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new InvalidRequest();
  try { return JSON.parse(text); } catch { throw new InvalidRequest(); }
}
function settings(env: Environment) {
  if (!env.RESEND_API_KEY || env.UNSUBSCRIBE_SIGNING_SECRET?.length < 32 || !env.FROM_EMAIL || typeof env.ALLOWED_ORIGINS !== 'string') throw new Error('configuration');
  const base = new URL(env.PUBLIC_BASE_URL);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('configuration');
  return base.origin;
}
async function allowedRate(request: Request, env: Environment, now: number) {
  // Cloudflare overwrites CF-Connecting-IP at the public edge. Never trust X-Forwarded-For.
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return false; // Fail closed off the Cloudflare edge.
  const window = Math.floor(now / (15 * 60_000));
  const hash = await mac(env.UNSUBSCRIBE_SIGNING_SECRET, `rate:v1:${window}:${ip}`);
  const result = await env.DB.prepare(`INSERT INTO rate_buckets (bucket_hash, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket_hash) DO UPDATE SET count = MIN(count + 1, 6) RETURNING count`)
    .bind(hash, (window + 1) * 15 * 60_000).first<{ count: number }>();
  return !!result && result.count <= 5;
}
async function subscribe(request: Request, env: Environment, now: number, text: string) {
  const parsed = subscribeRequestSchema.safeParse(jsonBody(request, text));
  if (!parsed.success) return;
  if (!await allowedRate(request, env, now)) return;
  const input = parsed.data;
  const id = crypto.randomUUID();
  const expires = now + 48 * HOUR;
  // First insert wins: duplicate requests cannot overwrite consent or reactivate an opt-out.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO subscribers (id, email, locale, state, created_at, expires_at)
      VALUES (?, ?, ?, 'pending', ?, ?) ON CONFLICT(email) DO NOTHING`).bind(id, input.email, input.locale, now, expires),
    env.DB.prepare(`INSERT INTO consent_receipts
      (subscriber_id, consent_at, policy_version, consent_text_version, locale, source, app_version)
      SELECT id, ?, 'newsletter-policy-2026-11-06', 'newsletter-consent-v1', ?, ?, ? FROM subscribers WHERE id = ?`)
      .bind(now, input.locale, input.source, input.app_version, id),
  ]);
  if (!await env.DB.prepare('SELECT id FROM subscribers WHERE id = ?').bind(id).first()) return;
  const base = settings(env);
  const confirm = await signToken(env.UNSUBSCRIBE_SIGNING_SECRET, 'confirm', id, expires);
  const unsubscribe = await signToken(env.UNSUBSCRIBE_SIGNING_SECRET, 'unsubscribe', id, now + 365 * 24 * HOUR);
  const deletion = await signToken(env.UNSUBSCRIBE_SIGNING_SECRET, 'delete', id, now + 365 * 24 * HOUR);
  const mail = confirmationEmail(input.locale, `${base}/v1/confirm?token=${confirm}`, `${base}/v1/unsubscribe?token=${unsubscribe}`, deletion);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `confirm-${id}` },
    body: JSON.stringify({ from: env.FROM_EMAIL, to: [input.email], ...mail }),
    signal: AbortSignal.timeout(8000),
  });
  // Never log provider bodies, errors, addresses, request URLs, or bearer tokens.
  await response.body?.cancel();
  if (!response.ok) console.error(JSON.stringify({ error: 'email_delivery' }));
}
export async function handle(request: Request, env: Environment): Promise<Response> {
  const url = new URL(request.url);
  const isSubscribe = url.pathname === '/v1/subscribe' && request.method === 'POST';
  const origin = request.headers.get('Origin');
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' });
  const reply = (data: object, status = 200) => Response.json(data, { status, headers });
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(x => x.trim()).filter(x => x && x !== '*' && x !== 'null');
  if (origin !== null && !allowed.includes(origin)) return reply({ error: 'forbidden' }, 403);
  if (origin !== null) headers.set('Access-Control-Allow-Origin', origin);
  // Missing Origin is intentional for native Electron and email providers. It is not authentication.
  if (request.method === 'OPTIONS') {
    if (!origin || !['POST', 'GET'].includes(request.headers.get('Access-Control-Request-Method') ?? '') ||
      (request.headers.get('Access-Control-Request-Headers') ?? '').split(',').some(h => h.trim() && h.trim().toLowerCase() !== 'content-type')) return reply({ error: 'forbidden' }, 403);
    headers.set('Access-Control-Allow-Methods', 'GET, POST');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return new Response(null, { status: 204, headers });
  }
  try {
    settings(env);
    const now = Date.now();
    const text = request.method === 'POST' ? await body(request) : '';
    if (isSubscribe) {
      await subscribe(request, env, now, text);
      return reply(ACCEPTED, 202);
    }
    if (url.pathname === '/v1/confirm' && request.method === 'GET') {
      const id = await verifyToken(env.UNSUBSCRIBE_SIGNING_SECRET, url.searchParams.get('token') ?? '', 'confirm', now);
      if (!id) return reply({ error: 'invalid_request' }, 400);
      await env.DB.prepare(`UPDATE subscribers SET state = 'active', confirmed_at = ?
        WHERE id = ? AND state = 'pending' AND expires_at > ?`).bind(now, id, now).run();
      return reply({ status: 'ok' });
    }
    if (url.pathname === '/v1/unsubscribe' && ['GET', 'POST'].includes(request.method)) {
      if (request.method === 'POST' && (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/x-www-form-urlencoded' || text !== 'List-Unsubscribe=One-Click')) throw new InvalidRequest();
      const id = await verifyToken(env.UNSUBSCRIBE_SIGNING_SECRET, url.searchParams.get('token') ?? '', 'unsubscribe', now);
      if (!id) return reply({ error: 'invalid_request' }, 400);
      await env.DB.prepare(`UPDATE subscribers SET state = 'unsubscribed', unsubscribed_at = ?
        WHERE id = ? AND state != 'unsubscribed'`).bind(now, id).run();
      return reply({ status: 'ok' });
    }
    if (url.pathname === '/v1/delete' && request.method === 'POST') {
      const input = deleteRequestSchema.safeParse(jsonBody(request, text));
      const id = input.success ? await verifyToken(env.UNSUBSCRIBE_SIGNING_SECRET, input.data.token, 'delete', now) : null;
      if (!id) return reply({ error: 'invalid_request' }, 400);
      await env.DB.prepare('DELETE FROM subscribers WHERE id = ?').bind(id).run();
      return reply({ status: 'ok' });
    }
    return reply({ error: 'not_found' }, 404);
  } catch (error) {
    if (!(error instanceof InvalidRequest)) console.error(JSON.stringify({ error: 'request_failed' }));
    if (isSubscribe) return reply(ACCEPTED, 202);
    return reply({ error: error instanceof InvalidRequest ? 'invalid_request' : 'unavailable' }, error instanceof InvalidRequest ? 400 : 503);
  }
}
export async function cleanup(env: Pick<Environment, 'DB'>, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM subscribers WHERE (state = 'pending' AND expires_at <= ?) OR (state = 'unsubscribed' AND unsubscribed_at <= ?)").bind(now, now - 30 * 24 * HOUR),
    env.DB.prepare('DELETE FROM rate_buckets WHERE expires_at <= ?').bind(now),
  ]);
}
export default {
  fetch: handle,
  async scheduled(_controller, env) {
    try { await cleanup(env); } catch { console.error(JSON.stringify({ error: 'cleanup_failed' })); }
  },
} satisfies ExportedHandler<Bindings>;
