/**
 * Select prompt history and branch replacements for an accepted chat turn.
 * Owned by main/services. Superseding is planned here and committed by ChatService.
 * @packageDocumentation
 */
import { randomUUID } from 'node:crypto';
import type { ChatRequest, Message } from '../../shared/domain';

/** A replay decision and its active history; this helper never changes stored messages. */
export interface ChatTurnContext {
  regenerating: boolean;
  userMessageId: string;
  assistantMessageId: string;
  superseded: Message['id'][];
  history: Message[];
}

/** Keep the active context before an edit or regeneration and identify the replaced branch. */
export function chatTurnContext(messages: Message[], request: ChatRequest): ChatTurnContext {
  const replayIndex = request.turnId ? messages.findIndex(m => m.role === 'user' && (m.id === request.turnId || m.parts.some(p => p.turnId === request.turnId))) : -1;
  const replayUser = replayIndex >= 0 ? messages[replayIndex] : undefined;
  const regenerating = replayUser?.parts.map(p => p.text).join('\n') === request.userMessage;
  const userMessageId = regenerating ? replayUser!.id : randomUUID();
  const assistantMessageId = randomUUID();
  const omittedIndex = request.contextTurnIds ? messages.findIndex((m, index) => m.role === 'user' && index !== replayIndex && !request.contextTurnIds!.includes(m.parts[0]?.turnId ?? m.id)) : -1;
  const cutoff = replayIndex >= 0 ? replayIndex : omittedIndex;
  const superseded = cutoff >= 0 ? messages.slice(cutoff + (regenerating ? 1 : 0)).map(m => m.id) : [];
  const beforeReplay = cutoff < 0 ? messages : messages.slice(0, cutoff);
  const contextMessages = request.contextTurnIds ? beforeReplay.filter((m, index) => {
    const turnId = m.parts[0]?.turnId ?? (m.role === 'user' ? m.id : beforeReplay[index - 1]?.id);
    return !!turnId && request.contextTurnIds!.includes(turnId);
  }) : beforeReplay;
  const latestTurns = contextMessages.filter((m, i, all) => {
    const turn = m.parts[0]?.turnId;
    return !turn || !all.slice(i + 1).some(next => next.role === m.role && next.parts[0]?.turnId === turn);
  });
  const history = latestTurns.filter((message, index) => message.parts.every(p=>!p.contextExcluded) && (message.role === "assistant"
    ? message.parts.every(p => !p.contextExcluded && (!p.status || p.status === "complete"))
    : latestTurns[index + 1]?.role === "assistant" && latestTurns[index + 1]!.parts.every(p => !p.contextExcluded && (!p.status || p.status === "complete"))));
  return { regenerating, userMessageId, assistantMessageId, superseded, history };
}
