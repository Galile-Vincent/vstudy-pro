export function assertCodexChatEvent(record: Record<string, unknown>) {
  const item = record.item as { type?: string } | undefined;
  if (item && !['agent_message', 'reasoning'].includes(item.type ?? ''))
    throw new Error(`Unexpected Codex item: ${item.type}`);
}
