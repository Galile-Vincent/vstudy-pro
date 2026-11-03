import type { UsageRecord } from '../../shared/domain';
export function usageCsv(records: UsageRecord[]): string {
  const keys = ['id','createdAt','providerId','modelId','kind','conversationId','documentId','messageId','inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens','costUsd','costSource','aborted'] as const;
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""').replace(/^(?:[=+@\-\t\r]|\s+(?=[=+@-]))/, "'$&")}"`;
  return [keys.join(','), ...records.map(r => keys.map(k => cell(r[k])).join(','))].join('\r\n');
}
