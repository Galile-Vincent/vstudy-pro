import { app } from 'electron';
import { subscribeRequestSchema, acceptedResponseSchema } from '../../shared/newsletter';
import type { createIpcRegistrar } from './register';
import type { IpcChannel } from '../../shared/ipc';
import { recordEgress } from '../services/egress';
// Deployment configuration only; no credential belongs in the desktop app.
export const NEWSLETTER_URL = process.env.VSTUDY_NEWSLETTER_URL ?? '';
export function newsletterEndpoint(value = NEWSLETTER_URL): string | undefined {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.hash ? url.href : undefined; } catch { return undefined; }
}
export function registerNewsletterIpc(registrar: ReturnType<typeof createIpcRegistrar>, implemented: Set<IpcChannel>) {
  implemented.add('newsletter:getConfig'); implemented.add('newsletter:subscribe');
  registrar.handle('newsletter:getConfig', () => ({ available: !!newsletterEndpoint() }));
  registrar.handle('newsletter:subscribe', async input => {
    const endpoint = newsletterEndpoint();
    if (!endpoint) return { accepted: false };
    const body = subscribeRequestSchema.parse({ ...input, app_version: app.getVersion() });
    recordEgress('newsletter_subscribe', new URL(endpoint).origin);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(10000) });
      return { accepted: response.ok && acceptedResponseSchema.safeParse(await response.json()).success };
    } catch { return { accepted: false }; }
  });
}
