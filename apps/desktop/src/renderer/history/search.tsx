/** Search controller with debounced queries, stale-response protection and reversible metadata actions. */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { tr } from '../../shared/i18n';
import type { ChatHit, ChatPatch, ChatSearch } from '../../shared/chat-history';
import type { IpcResponse } from '../../shared/ipc';
import { desktop } from '../bridge';
import { SurfaceErrorBoundary } from '../components/surface-error-boundary';
import { HistoryResults } from './results';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import './history.css';
type HistorySearchProps = {
  onOpen: (hit: ChatHit, messageId?: string) => void;
  documentId?: ChatSearch['documentId'];
  courseId?: string | undefined;
  compact?: boolean;
};
export function HistorySearch(props: HistorySearchProps) {
  return <SurfaceErrorBoundary><SearchContent {...props}/></SurfaceErrorBoundary>;
}
function SearchContent({ onOpen, documentId, courseId, compact = false }: HistorySearchProps) {
  useTranslation();
  const [filters, setFilters] = useState<ChatSearch>({ scope: 'all', limit: 30, query: '', ...(documentId ? { documentId } : {}), ...(courseId ? { courseIds: [courseId] } : {}) });
  const [page, setPage] = useState<IpcResponse<'chats:search'>>({ items: [], nextCursor: null });
  const [facets, setFacets] = useState<IpcResponse<'chats:facets'>>({ courses: [], documents: [], models: [] });
  const [loading, setLoading] = useState(true), [error, setError] = useState(false), [revision, setRevision] = useState(0);
  const [undo, setUndo] = useState<{
    id: ChatHit['id'];
    patch: ChatPatch;
  } | null>(null);
  const [renaming, setRenaming] = useState<ChatHit | null>(null), [title, setTitle] = useState('');
  const [grouped, setGrouped] = useState(false);
  const serial = useRef(0), host = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<ChatSearch>) => setFilters(f => ({ ...f, ...patch, cursor: undefined }));
  useEffect(() => { let live = true; void desktop.invoke('chats:facets', {}).then(v => { if (live)
    setFacets(v); }).catch(() => { if (live)
    setError(true); }); return () => { live = false; }; }, [revision]);
  useEffect(() => {
    const generation = ++serial.current;
    setLoading(true);
    setError(false);
    const timer = setTimeout(() => { void desktop.invoke('chats:search', filters).then(v => { if (generation === serial.current)
      setPage(v); }).catch(() => { if (generation === serial.current)
      setError(true); }).finally(() => { if (generation === serial.current)
      setLoading(false); }); }, 120);
    return () => { clearTimeout(timer); serial.current++; };
  }, [filters, revision]);
  useEffect(() => { const refresh = () => setRevision(n => n + 1); window.addEventListener('focus', refresh); window.addEventListener('vstudy:history-changed', refresh); return () => { window.removeEventListener('focus', refresh); window.removeEventListener('vstudy:history-changed', refresh); }; }, []);
  useEffect(() => { if (!undo)
    return; const timer = setTimeout(() => setUndo(null), 30000); return () => clearTimeout(timer); }, [undo]);
  const update = async (hit: ChatHit, patch: ChatPatch) => {
    try {
      await desktop.invoke('chats:update', { conversationId: hit.id, patch });
      const previous: ChatPatch = {};
      if (patch.title !== undefined)
        previous.title = hit.title;
      if (patch.pinned !== undefined)
        previous.pinned = hit.pinned;
      if (patch.archived !== undefined)
        previous.archived = hit.archived;
      if (patch.deleted !== undefined)
        previous.deleted = false;
      setUndo({ id: hit.id, patch: previous });
      setRevision(n => n + 1);
      window.dispatchEvent(new Event('vstudy:history-changed'));
    }
    catch {
      setError(true);
    }
  };
  const more = async () => {
    if (!page.nextCursor || loading)
      return;
    const generation = serial.current;
    setLoading(true);
    try {
      const next = await desktop.invoke('chats:search', { ...filters, cursor: page.nextCursor });
      if (generation === serial.current)
        setPage(p => ({ items: [...p.items, ...next.items.filter(h => !p.items.some(old => old.id === h.id))], nextCursor: next.nextCursor }));
    }
    catch {
      if (generation === serial.current)
        setError(true);
    }
    finally {
      if (generation === serial.current)
        setLoading(false);
    }
  };
  return <div className={'history-search' + (compact ? ' history-compact' : '')} ref={host} onKeyDown={event => {
      if (event.nativeEvent.isComposing)
        return;
      if (!['ArrowDown', 'ArrowUp'].includes(event.key))
        return;
      if ((event.target as HTMLElement).matches('select,input:not([type=search])'))
        return;
      const buttons = Array.from(host.current?.querySelectorAll<HTMLButtonElement>('[data-history-result]') ?? []);
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = buttons[(at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }}>
  <label className="history-input"><Search size={18}/><input type="search" autoFocus={compact} aria-label={tr('history:search')} placeholder={tr('history:placeholder')} value={filters.query ?? ''} onChange={e => set({ query: e.target.value })}/></label>
  <div className="history-chips" aria-label={tr('history:filters')}>
   {(['all', 'courses', 'documents', 'general', 'pinned'] as const).map(chip => <button key={chip} aria-pressed={chip === 'pinned' ? !!filters.pinned : (filters.scope ?? 'all') === chip && !filters.pinned} onClick={() => set(chip === 'pinned' ? { pinned: filters.pinned ? undefined : true } : { scope: chip, pinned: undefined, courseIds: courseId ? [courseId] : undefined, documentId })}>{tr('history:' + chip)}</button>)}
  </div>
  <details className="history-filters"><summary>{tr('history:more_filters')}</summary><div className="history-filter-grid">
   <label>{tr('history:course')}<select value={filters.courseIds?.[0] ?? ''} onChange={e => set({ courseIds: e.target.value ? [e.target.value] : undefined })}><option value="">{tr('history:all')}</option>{facets.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
   <label>{tr('history:term')}<select value={filters.term ?? ''} onChange={e => set({ term: e.target.value || undefined })}><option value="">{tr('history:all')}</option>{[...new Set(facets.courses.flatMap(c => c.term ? [c.term] : []))].map(t => <option key={t}>{t}</option>)}</select></label>
   <label>{tr('history:document')}<select value={filters.documentId ?? ''} onChange={e => set({ documentId: e.target.value as ChatSearch['documentId'] || undefined })}><option value="">{tr('history:all')}</option>{facets.documents.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
   <label>{tr('history:role')}<select value={filters.role ?? ''} onChange={e => set({ role: e.target.value as ChatSearch['role'] || undefined })}><option value="">{tr('history:all')}</option><option value="user">{tr('history:questions')}</option><option value="assistant">{tr('history:answers')}</option></select></label>
   <label>{tr('history:model')}<select value={filters.model ?? ''} onChange={e => set({ model: e.target.value || undefined })}><option value="">{tr('history:all')}</option>{facets.models.map(m => <option key={m}>{m}</option>)}</select></label>
   <label>{tr('history:from')}<input type="date" onChange={e => set({ from: e.target.value ? new Date(e.target.value + 'T00:00:00').toISOString() : undefined })}/></label>
   <label>{tr('history:to')}<input type="date" onChange={e => set({ to: e.target.value ? new Date(e.target.value + 'T23:59:59.999').toISOString() : undefined })}/></label>
   <label><input type="checkbox" checked={!!filters.archived} onChange={e => set({ archived: e.target.checked })}/>{tr('history:archived')}</label>
   <label><input type="checkbox" checked={!!filters.hasAttachments} onChange={e => set({ hasAttachments: e.target.checked ? true : undefined })}/>{tr('history:attachments')}</label>
   <label><input type="checkbox" checked={!!filters.hasCitations} onChange={e => set({ hasCitations: e.target.checked ? true : undefined })}/>{tr('history:citations')}</label>
   <label><input type="checkbox" checked={grouped} onChange={e => setGrouped(e.target.checked)}/>{tr('history:group_courses')}</label>
  </div></details>
  {undo && <div role="status" className="history-undo">{tr('history:updated')}<button onClick={() => { void desktop.invoke('chats:update', { conversationId: undo.id, patch: undo.patch }).then(() => { setUndo(null); setRevision(n => n + 1); window.dispatchEvent(new Event('vstudy:history-changed')); }).catch(() => setError(true)); }}>{tr('history:undo')}</button></div>}
  {error && <p role="alert">{tr('history:error')} <button onClick={() => setRevision(n => n + 1)}>{tr('common:retry')}</button></p>}
  <div className="history-results" aria-busy={loading}>
   <p role="status">{loading && !page.items.length ? tr('history:searching') : ''}</p>
   {!loading && !page.items.length && !error && <div className="history-empty"><Search size={28}/><h2>{tr(filters.query ? 'history:no_results' : 'history:empty')}</h2><p>{tr(filters.query ? 'history:no_results_hint' : 'history:empty_hint')}</p></div>}
   {<HistoryResults items={page.items} onOpen={onOpen} onUpdate={(h, p) => { void update(h, p); }} onRename={h => { setTitle(h.title); setRenaming(h); }} groupByCourse={grouped}/>}
   {page.nextCursor && <button disabled={loading} onClick={() => void more()}>{tr('history:more')}</button>}
  </div>
  <Dialog open={!!renaming} onOpenChange={open => { if (!open)
    setRenaming(null); }}><DialogContent><DialogTitle>{tr('common:rename')}</DialogTitle><DialogDescription>{tr('history:rename_hint')}</DialogDescription><form onSubmit={e => { e.preventDefault(); if (renaming && title.trim()) {
    void update(renaming, { title: title.trim() });
    setRenaming(null);
  } }}><input autoFocus aria-label={tr('common:rename_thread')} maxLength={300} value={title} onChange={e => setTitle(e.target.value)}/><button type="submit" disabled={!title.trim()}>{tr('history:save')}</button></form></DialogContent></Dialog>
 </div>;
}
