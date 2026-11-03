import { tr } from "../i18n";
import { createRateLimitProbe } from "../providers/rate-limits";
import { dialog } from 'electron';
import { estimateCost } from '../pricing';
import { stat } from 'node:fs/promises';
import { exportText } from '../services/export-file';
import type { Store } from '../db';
import type { createIpcRegistrar } from './register';
type IpcRegistrar = ReturnType<typeof createIpcRegistrar>;
import type { IpcChannel } from '../../shared/ipc';
import type { UsageRecord } from '../../shared/domain';
export function usageCsv(records: UsageRecord[]): string {
  const keys = ['id','createdAt','providerId','modelId','kind','conversationId','documentId','messageId','inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens','costUsd','costSource','aborted'] as const;
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""').replace(/^[=+@-]/, "'$&")}"`;
  return [keys.join(','), ...records.map(r => keys.map(k => cell(r[k])).join(','))].join('\r\n');
}
export function registerUsageIpc(registrar: IpcRegistrar, store: Store, implemented: Set<IpcChannel>) {
  const probe = createRateLimitProbe();
  registrar.handle('usage:estimate', async ({ conversationId, userMessage }) => {
    const c = store.conversations.get(conversationId);
    if (!c) throw new Error('Conversation not found');
    const d = store.documents.get(c.documentId);
    const bytes = d ? Math.min(2_000_000, (await stat(d.markdownPath)).size) : 0;
    const history = store.messages.list(conversationId).reduce((n,m) => n + m.parts.reduce((t,p) => t + p.text.length,0),0);
    const usage = { inputTokens: Math.ceil((Math.min(bytes,100_000) + Math.min(history,100_000) + userMessage.length + 2000) / 4), outputTokens: 1024, costSource: 'estimated' as const };
    return { ...usage, costUsd: estimateCost(c.modelId, usage, store.settings.get().priceOverrides) };
  });
  registrar.handle('usage:dashboard', ({period}) => store.usage.dashboard(period));
  registrar.handle('usage:summary' , ({ period }) => store.usage.summary(period));
  registrar.handle('usage:forConversation', ({ conversationId }) => store.usage.forConversation(conversationId));
  registrar.handle('usage:forDocument', ({ documentId }) => store.usage.forDocument(documentId));
  registrar.handle('usage:rateLimits', async () => {
    const rows = store.usage.rateLimits();
    const rateLimit = await probe();
    return rateLimit ? [...rows.filter(r => r.providerId !== 'codex-cli'), { providerId: 'codex-cli' as const, createdAt: new Date().toISOString(), rateLimit }] : rows;
  });
  registrar.handle('usage:export', async () => {
    const result = await dialog.showSaveDialog({ title:tr('usage:export_title'), defaultPath: 'vstudy-usage.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (result.canceled || !result.filePath) return { saved: false };
    await exportText(usageCsv(store.usage.list()), result.filePath);
    return { saved: true };
  });
  for (const channel of ['usage:dashboard','usage:estimate','usage:summary','usage:forConversation','usage:forDocument','usage:rateLimits','usage:export'] as const) implemented.add(channel);
}
