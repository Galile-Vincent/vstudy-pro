import type { IpcResponse } from '../../shared/ipc';
import { LoadError } from '../components/load-error';
import { errorText } from '../status';
/** Shell History and Cmd/Ctrl+K finder. Both navigate to the same persistent conversation. */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import type { ChatHit } from '../../shared/chat-history';
import type { Conversation } from '../../shared/domain';
import type { Providers } from '../providers';
import { desktop } from '../bridge';
import { useNavigate } from '../shell';
import { SurfaceErrorBoundary } from '../components/surface-error-boundary';
import { HistorySearch } from './search';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
const Chat = lazy(() => import('../chat').then(m => ({ default: m.Chat })));
export function HistoryFinder() {
  useTranslation();
  const { navigate } = useNavigate(), [open, setOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
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
      if (!open) trigger.current = document.activeElement as HTMLElement;
      setOpen(o => !o);
    } };
    const show = () => { trigger.current = document.activeElement as HTMLElement; setOpen(true); };
    window.addEventListener('keydown', key);
    window.addEventListener('vstudy:find-history', show);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('vstudy:find-history', show); };
  }, [open]);
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="history-dialog" onKeyDown={event => {
    if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); setOpen(false); }
  }} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}><DialogTitle>{tr('history:title')}</DialogTitle><DialogDescription>{tr('history:subtitle')}</DialogDescription><HistorySearch compact onOpen={(hit, messageId) => { setOpen(false); navigate({ view: 'history', conversationId: hit.id, messageId }); }}/><button onClick={() => { setOpen(false); navigate('history'); }}>{tr('history:full_history')}</button></DialogContent></Dialog>;
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
  const [revision, setRevision] = useState(0);
  const refreshProviders = async () => setProviders(await desktop.invoke('providers:list', {}));
  useEffect(() => {
    let live = true;
    setLoaded(null);
    setModelError(false);
    setDraft('');
    setFailed('');
    if (route.conversationId)
      void Promise.all([refreshProviders(), desktop.invoke('chats:get', { conversationId: route.conversationId }), desktop.invoke('messages:page', { conversationId: route.conversationId, limit:50, direction:'backward' })]).then(([, conversation, messages]) => { if (live) {
        if (conversation)
          setLoaded({ conversation, messages });
        else
          setFailed(tr('history:unavailable'));
      } }).catch(error => { if (live) setFailed(errorText(error)); });
    return () => { live = false; };
  }, [route.conversationId, revision]);
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
  return <main className="history-page"><header><h1>{tr('history:title')}</h1><p>{tr('history:subtitle')}</p></header><div className="history-layout">
  <section className="history-browser" aria-label={tr('history:title')}><HistorySearch onOpen={open}/></section>
  {route.conversationId && <section className="history-conversation chat-pane" aria-label={tr('common:chat')}><button className="history-back" onClick={() => navigate('history')}>{tr('history:back')}</button>
   {modelError && <p role="alert">{tr('history:model_change_error')}</p>}
   {failed ? <LoadError message={failed} retry={() => setRevision(value => value + 1)}/> : loaded ? <Suspense fallback={<p role="status">{tr('common:loading_conversation')}</p>}><Chat key={loaded.conversation.id} conversation={loaded.conversation} history={loaded.messages.items} historyCursor={loaded.messages.nextCursor} jumpMessageId={route.messageId} autoFocus={false} draft={draft} onDraft={setDraft} selection={null} onClearSelection={() => { }} providers={providers} model={loaded.conversation.providerId + '/' + loaded.conversation.modelId} onModel={value => { void changeModel(value); }} onSettings={settings} onProvidersChanged={refreshProviders} onUsage={settings}/></Suspense> : <p role="status">{tr('common:loading_conversation')}</p>}
  </section>}
 </div></main>;
}
