/**
 * Reject Codex events that violate the verified tool-free chat protocol.
 * Owned by main/providers.
 * Integrations are opt-in; subprocesses use argv arrays and release resources on cancellation.
 * @packageDocumentation
 */
export function assertCodexChatEvent(record: Record<string, unknown>) {
  const item = record.item as { type?: string } | undefined;
  // `error` items are non-fatal diagnostics (e.g. a missing optional code-mode host); real failures arrive as `turn.failed` or a top-level `error` record.
  if (item && !['agent_message', 'reasoning', 'error'].includes(item.type ?? ''))
    throw new Error(`Unexpected Codex item: ${item.type}`);
}
