import { useId } from "react";
import { useOverlayFocusReturn } from "../components/use-overlay-focus-return";
import { Button, Layout, LayoutPanel, LayoutContent, Dialog, DialogHeader } from "@astryxdesign/core";
import { ArrowLeft } from "lucide-react";
import type { IpcResponse } from '../../shared/ipc';
import { LoadError } from '../components/load-error';
import { errorText } from '../status';
/** Shell History and Cmd/Ctrl+K finder. Both navigate to the same persistent conversation. */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import type { ChatHit } from '../../shared/chat-history';
import type { Conversation } from '../../shared/domain';
import type { Providers } from '../providers';
import { desktop } from '../bridge';
import { useNavigate } from '../shell';
import { SurfaceErrorBoundary } from '../components/surface-error-boundary';
import { HistorySearch } from './search';
import { PageContainer, PageHeader } from "../components/ui";
import { useFormat } from '../i18n';
const Chat = lazy(() => import('../chat').then(m => ({ default: m.Chat })));
export function HistoryFinder() {
  useTranslation();
  const dialogDescriptionId = useId();
  const { navigate } = useNavigate(), [open, setOpen] = useState(false);
  const captureOpener = useOverlayFocusReturn(open);
  useEffect(() => {
    let titles: Record<string, string> = {};
    try {
      titles = JSON.parse(localStorage.getItem('vstudy-thread-titles') ?? '{}');
    }
    catch {
      return;
    }
    void (async () => {
      for (const [id, title] of Object.entries(titles)) {
        if (typeof title !== 'string' || !title.trim() || !/^[0-9a-f-]{36}$/i.test(id))
          continue;
        try {
          await desktop.invoke('chats:update', { conversationId: id as Conversation['id'], patch: { title: title.slice(0, 300) } });
          delete titles[id];
          localStorage.setItem('vstudy-thread-titles', JSON.stringify(titles));
        }
        catch {
          continue;
        }
      }
    })();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k' && !e.isComposing) {
      e.preventDefault();
      if (!open) captureOpener();
      setOpen(o => !o);
    } };
    const show = () => { if (!open) captureOpener(); setOpen(true); };
    window.addEventListener('keydown', key);
    window.addEventListener('vstudy:find-history', show);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('vstudy:find-history', show); };
  }, [open, captureOpener]);
  return <>{open && <Dialog aria-describedby={dialogDescriptionId} role="dialog" isOpen={open} onOpenChange={setOpen} className="history-dialog"><DialogHeader title={<>{tr('history:title')}</>} /><div id={dialogDescriptionId} className="dialog-description">{tr('history:subtitle')}</div><HistorySearch compact onOpen={(hit, messageId) => { setOpen(false); navigate({ view: 'history', conversationId: hit.id, messageId }); }}/><Button variant="secondary" label={tr('history:full_history')} onClick={() => { setOpen(false); navigate('history'); }}/></Dialog>}</>;
}
export function HistoryView() {
  return <SurfaceErrorBoundary><HistoryContent/></SurfaceErrorBoundary>;
}
function HistoryContent() {
  useTranslation();
  const { route, navigate } = useNavigate();
  const [loaded, setLoaded] = useState<{
    conversation: Conversation;
    messages: IpcResponse<'messages:page'>;
  } | null>(null);
  const [providers, setProviders] = useState<Providers>([]), [draft, setDraft] = useState(''), [failed, setFailed] = useState(''), [modelError, setModelError] = useState(false);
  const [revision, setRevision] = useState(0), heading = useRef<HTMLSpanElement>(null);
  const [providersFailed, setProvidersFailed] = useState(false);
  const [summary, setSummary] = useState<{ count: number; more: boolean } | null>(null), format = useFormat();
  const refreshProviders = useCallback(async () => {
    try { setProviders(await desktop.invoke('providers:list', {})); setProvidersFailed(false); }
    catch { setProvidersFailed(true); }
  }, []);
  useEffect(() => {
    let live = true;
    setLoaded(null);
    setModelError(false);
    setDraft('');
    setFailed('');
    if (route.conversationId)
      void Promise.all([desktop.invoke('chats:get', { conversationId: route.conversationId }), desktop.invoke('messages:page', { conversationId: route.conversationId, limit:50, direction:'backward' })]).then(([conversation, messages]) => { if (live) {
        if (conversation)
          setLoaded({ conversation, messages });
        else
          setFailed(tr('history:unavailable'));
      } }).catch(error => { if (live) setFailed(errorText(error)); });
    return () => { live = false; };
  }, [route.conversationId, revision]);
  useEffect(() => { void refreshProviders(); }, [refreshProviders]);
  const open = (hit: ChatHit, messageId?: string) => navigate({ view: 'history', conversationId: hit.id, messageId });
  const changeModel = async (value: string) => {
    if (!loaded)
      return;
    const slash = value.indexOf('/'), providerId = value.slice(0, slash) as Conversation['providerId'], modelId = value.slice(slash + 1);
    try {
      const c = loaded.conversation;
      setModelError(false);
      const messages = await desktop.invoke('messages:page', { conversationId: c.id, limit:1 });
      if (!messages.items.length) {
        const next = await desktop.invoke('conversations:model', { conversationId: c.id, providerId, modelId });
        setLoaded({ ...loaded, conversation: next });
        return;
      }
      const next = await desktop.invoke('conversations:create', { providerId, modelId, ...(c.scope === 'course' ? { scope: 'course', courseId: c.courseId } : c.scope === 'general' ? { scope: 'general' } : { documentId: c.documentId }) });
      navigate({ view: 'history', conversationId: next.id });
    }
    catch {
      setModelError(true);
    }
  };
  const settings = () => window.dispatchEvent(new Event('vstudy:open-settings'));
  const count = summary && tr(summary.more ? 'history:count_more' : 'history:count', { count: summary.count, formatted: format.number(summary.count) });
  return <PageContainer as="main" className="history-page"><PageHeader title={<span ref={heading} tabIndex={-1}>{tr('history:title')}</span>} description={tr('history:subtitle')} meta={count && <p className="text-[var(--muted)]">{count}</p>}/><Layout height="fill" padding={0} className="history-layout" start={<LayoutPanel width={route.conversationId ? 320 : "100%"} className="history-browser" aria-label={tr('history:title')}><HistorySearch onOpen={open} onSummary={setSummary} onFocusFallback={() => heading.current?.focus()}/></LayoutPanel>} content={route.conversationId && <LayoutContent className="history-conversation chat-pane" aria-label={tr('common:chat')}><Button variant="ghost" className="history-back" icon={<ArrowLeft size={16}/>} label={tr('history:back')} onClick={() => navigate('history')}/>
   {providersFailed && <LoadError message={tr('history:providers_error')} retry={() => void refreshProviders()}/>}
   {modelError && <p role="alert">{tr('history:model_change_error')}</p>}
   {failed ? <LoadError message={failed} retry={() => setRevision(value => value + 1)}/> : loaded ? <Suspense fallback={<p role="status">{tr('common:loading_conversation')}</p>}><Chat key={loaded.conversation.id} conversation={loaded.conversation} history={loaded.messages.items} historyCursor={loaded.messages.nextCursor} jumpMessageId={route.messageId} autoFocus={false} draft={draft} onDraft={setDraft} selection={null} onClearSelection={() => { }} providers={providers} model={loaded.conversation.providerId + '/' + loaded.conversation.modelId} onModel={value => { void changeModel(value); }} onSettings={settings} onProvidersChanged={refreshProviders} onUsage={settings}/></Suspense> : <p role="status">{tr('common:loading_conversation')}</p>}
  </LayoutContent>} /></PageContainer>;
}
