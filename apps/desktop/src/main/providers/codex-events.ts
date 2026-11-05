/**
 * Reject Codex events that violate the verified tool-free chat protocol.
 * Owned by main/providers.
 * Integrations are opt-in; subprocesses use argv arrays and release resources on cancellation.
 * @packageDocumentation
 */
export function assertCodexChatEvent(record: Record<string, unknown>) {
  const item = record.item as { type?: string } | undefined;
  if (item && !['agent_message', 'reasoning'].includes(item.type ?? ''))
    throw new Error(`Unexpected Codex item: ${item.type}`);
}
