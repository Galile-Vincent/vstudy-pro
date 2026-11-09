import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ExportedMessageRepository, type AssistantRuntime, useAuiState, type ThreadMessageLike } from '@assistant-ui/react';
import { useTranslation } from 'react-i18next';
import type { Conversation, Message } from '../shared';
import { tr } from '../shared/i18n';
import { assistantContent } from './chat-content';
import { errorText } from './status';
import { desktop } from './bridge';
import { Button } from './components/ui/button';
import { LoadError } from './components/load-error';

export type MessageCursor = {createdAt:string;id:string};
export function chatHistoryMessages(history: Message[]): ThreadMessageLike[] {
  return history.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.role === 'assistant' ? m.parts.flatMap(p => assistantContent(p.text,p.reasoning,p.citations,p.toolCalls)) : m.parts.map(p => ({type:'text' as const,text:p.text})),
      createdAt: new Date(m.createdAt),
      ...(m.role === 'assistant' && m.parts.some(p => p.status === 'error') ? { status: { type: 'incomplete' as const, reason: 'error' as const, error: m.parts.find(p => p.status === 'error')?.error?.includes('VSTUDY_STATUS:') ? errorText(new Error(m.parts.find(p => p.status === 'error')?.error ?? '')) : tr('errors:provider_unavailable') } } : {}),
      ...(m.role === 'assistant' && m.parts.some(p => p.status === 'aborted') ? {status:{type:'incomplete' as const,reason:'cancelled' as const}} : {}),
      metadata: { custom: { usage: m.parts.find(p => p.usage)?.usage, modelId: m.parts[0]?.modelId, options: m.parts[0]?.options, selection: m.parts[0]?.selection, turnId: m.parts[0]?.turnId, citations: m.parts[0]?.citations } },
    }));
}

export function EarlierMessages({runtime,conversationId,cursor:initialCursor,jumpMessageId,onLoaded}:{runtime:AssistantRuntime;conversationId:Conversation['id'];cursor?:MessageCursor|null|undefined;jumpMessageId?:string|undefined;onLoaded:(messages:Message[],cursor:MessageCursor|null)=>void}) {
  useTranslation();
  const running = useAuiState(state => state.thread.isRunning);
  const targetFound = useAuiState(state => state.thread.messages.some(message => message.id === jumpMessageId));
  const [cursor,setCursor] = useState(initialCursor), [loading,setLoading] = useState(false), [error,setError] = useState('');
  const [jump,setJump] = useState({id:jumpMessageId,pages:0});
  const messageIds = useAuiState(state => state.thread.messages.map(message => message.id).join());
  const control = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const focusMessage = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (cursor || focusMessage.current === null) return;
    const messages = container.current?.parentElement?.querySelectorAll<HTMLElement>('[data-message-id]');
    const target = Array.from(messages ?? []).find(message => message.dataset.messageId === focusMessage.current);
    if (target) { target.tabIndex = -1; target.focus(); }
    else { container.current?.focus(); return; }
    focusMessage.current = null;
  }, [cursor, messageIds]);
  const pending = useRef(false), live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const load = useCallback(async () => {
    if (!cursor || pending.current || runtime.thread.getState().isRunning) return;
    const hadFocus = document.activeElement === control.current;
    pending.current = true; setLoading(true); setError('');
    try {
      const page = await desktop.invoke('messages:page',{conversationId,limit:50,direction:'backward',cursor:cursor as NonNullable<import('../shared/ipc').IpcRequest<'messages:page'>['cursor']>});
      if (!live.current || runtime.thread.getState().isRunning) return;
      const current = runtime.thread.export();
      const ids = new Set(current.messages.map(item => item.message.id));
      const older = ExportedMessageRepository.fromArray(chatHistoryMessages(page.items.filter(message => !ids.has(message.id))));
      const parentId = older.messages.at(-1)?.message.id;
      if (parentId) runtime.thread.import({...current,messages:[...older.messages,...current.messages.map(item => item.parentId === null ? {...item,parentId} : item)]});
      if (!page.nextCursor && hadFocus) focusMessage.current = page.items[0]?.id ?? '';
      setCursor(page.nextCursor); onLoaded(page.items,page.nextCursor);
    } catch (failure) { if (live.current) setError(errorText(failure)); }
    finally { pending.current = false; if (live.current) setLoading(false); }
  }, [cursor, runtime, conversationId, onLoaded]);
  useEffect(() => {
    if (jump.id !== jumpMessageId) { setJump({id:jumpMessageId,pages:0}); return; }
    if (jumpMessageId && cursor && !loading && !error && !running && !targetFound && jump.pages < 5) {
      setJump({...jump,pages:jump.pages+1});
      void load();
    }
  }, [jumpMessageId, jump, cursor, loading, error, running, targetFound, load]);
  const missingTarget = jumpMessageId && !targetFound && !loading && !error && (!cursor || (jump.id === jumpMessageId && jump.pages >= 5));

  return <div ref={container} tabIndex={-1} role="group" aria-label={tr('common:load_earlier_messages')}>{missingTarget && <p role="status">{tr('history:message_not_found')}</p>}{cursor && (error ? <LoadError message={error} retry={() => void load()}/> : <Button ref={control} variant="ghost" disabled={loading || running} onClick={() => void load()}>{tr(loading ? 'common:loading_earlier_messages' : 'common:load_earlier_messages')}</Button>)}</div>;
}
