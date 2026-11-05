/**
 * Serialize usage rows as CSV while protecting spreadsheet consumers from formula injection.
 * Owned by main/db.
 * Applied SQL remains immutable; repositories share one connection and use bound query values.
 * @packageDocumentation
 */
import type { UsageRecord } from '../../shared/domain';
/** Escape CSV fields and neutralize formula prefixes before spreadsheet export. */
export function usageCsv(records: UsageRecord[]): string {
  const keys = ['id','createdAt','providerId','modelId','kind','conversationId','documentId','messageId','inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens','costUsd','costSource','aborted'] as const;
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""').replace(/^(?:[=+@\-\t\r]|\s+(?=[=+@-]))/, "'$&")}"`;
  return [keys.join(','), ...records.map(r => keys.map(k => cell(r[k])).join(','))].join('\r\n');
}
