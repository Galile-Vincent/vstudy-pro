/** Shared assistant-ui thread list for full History and scoped quick finders. */
import { createContext, useContext } from 'react';
import { AssistantRuntimeProvider, ThreadListPrimitive, ThreadListItemPrimitive, useExternalStoreRuntime, useAuiState, type ThreadMessage } from '@assistant-ui/react';
import { Pin, MoreHorizontal } from 'lucide-react';
import type { ChatHit, ChatPatch } from '../../shared/chat-history';
import { tr } from '../../shared/i18n';
import { useTranslation } from 'react-i18next';
import { ThreadListRoot } from '../components/assistant-ui/elements/thread-list.aui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
export function HistorySnippet({ text }: {
  text: string;
}) {
  return <>{text.split(/(\[mark\][\s\S]*?\[\/mark\])/g).map((part, i) => part.startsWith('[mark]') && part.endsWith('[/mark]') ? <mark key={i}>{part.slice(6, -7)}</mark> : part)}</>;
}
export function courseColor(id: string | null) {
  let hash = 0;
  for (const char of id ?? '')
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return ['var(--folder-sage)', 'var(--folder-blue)', 'var(--folder-amber)'][Math.abs(hash) % 3];
}
type ContextValue = {
  items: ChatHit[];
  open: (hit: ChatHit, messageId?: string) => void;
  update: (hit: ChatHit, patch: ChatPatch) => void;
  rename: (hit: ChatHit) => void;
  groupByCourse: boolean;
};
const Context = createContext<ContextValue | null>(null);
function Result() {
  useTranslation();
  const id = useAuiState(s => s.threadListItem.id), context = useContext(Context)!;
  const hit = context.items.find(h => h.id === id)!;
  const group = hit.courseTitle || hit.documentTitle || tr('history:' + hit.scope);
  const first = context.items.find(h => (h.courseId ?? h.documentId ?? h.scope) === (hit.courseId ?? hit.documentId ?? hit.scope))?.id === id;
  return <>{context.groupByCourse && first && <h2 className="history-group">{group}</h2>}<ThreadListItemPrimitive.Root className="history-result" data-testid="history-result">
  <ThreadListItemPrimitive.Trigger asChild><button className="history-result-title" data-history-result>
   <strong><HistorySnippet text={hit.titleSnippet || tr('common:new_chat')}/></strong>
   {hit.pinned && <Pin size={13} aria-label={tr('history:pinned')}/>}
   <time dateTime={hit.updatedAt}>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(hit.updatedAt))}</time>
  </button></ThreadListItemPrimitive.Trigger>
  <p className="history-meta"><span className="history-course-dot" style={{ background: courseColor(hit.courseId) }}/>{group}{hit.term ? ' · ' + hit.term : ''} · {hit.modelId}</p>
  {hit.matches.map(m => <button key={m.messageId} className="history-match" onClick={() => context.open(hit, m.messageId)}><span className="history-role">{tr(m.role === 'user' ? 'history:question' : 'history:answer')}</span><HistorySnippet text={m.snippet}/></button>)}
  <DropdownMenu><DropdownMenuTrigger className="history-more" aria-label={tr('common:more_options')}><MoreHorizontal size={16}/></DropdownMenuTrigger><DropdownMenuContent>
   <DropdownMenuItem onSelect={() => context.rename(hit)}>{tr('common:rename')}</DropdownMenuItem>
   <DropdownMenuItem onSelect={() => context.update(hit, { pinned: !hit.pinned })}>{tr(hit.pinned ? 'history:unpin' : 'history:pin')}</DropdownMenuItem>
   <DropdownMenuItem onSelect={() => context.update(hit, { archived: !hit.archived })}>{tr(hit.archived ? 'history:unarchive' : 'common:archive')}</DropdownMenuItem>
   <DropdownMenuItem onSelect={() => context.update(hit, { deleted: true })}>{tr('common:delete')}</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>
 </ThreadListItemPrimitive.Root></>;
}
export function HistoryResults({ items, onOpen, onUpdate, onRename, groupByCourse = false }: {
  items: ChatHit[];
  onOpen: ContextValue['open'];
  onUpdate: ContextValue['update'];
  onRename: ContextValue['rename'];
  groupByCourse?: boolean;
}) {
  const ordered = groupByCourse ? [...items].sort((a, b) => (a.courseTitle || a.documentTitle || a.scope).localeCompare(b.courseTitle || b.documentTitle || b.scope)) : items;
  const runtime = useExternalStoreRuntime<ThreadMessage>({ messages: [], onNew: async () => { }, adapters: { threadList: { threads: ordered.map(h => ({ id: h.id, title: h.title, status: 'regular' as const })), onSwitchToThread: id => { const hit = items.find(h => h.id === id); if (hit)
          onOpen(hit, hit.matches[0]?.messageId); } } } });
  return <AssistantRuntimeProvider runtime={runtime}><Context.Provider value={{ items: ordered, open: onOpen, update: onUpdate, rename: onRename, groupByCourse }}><ThreadListRoot><ThreadListPrimitive.Items components={{ ThreadListItem: Result }}/></ThreadListRoot></Context.Provider></AssistantRuntimeProvider>;
}
