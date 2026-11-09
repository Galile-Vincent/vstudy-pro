/** Search controller with debounced queries, stale-response protection and reversible metadata actions. */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { tr } from '../../shared/i18n';
import type { ChatHit, ChatPatch, ChatSearch } from '../../shared/chat-history';
import type { IpcResponse } from '../../shared/ipc';
import { desktop } from '../bridge';
import { useFormat } from '../i18n';
import { SurfaceErrorBoundary } from '../components/surface-error-boundary';
import { HistoryResults } from './results';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { EmptyState, FormField, Toolbar } from '../components/ui';
import './history.css';
type HistorySearchProps = {
  onOpen: (hit: ChatHit, messageId?: string) => void;
  documentId?: ChatSearch['documentId'];
  courseId?: string | undefined;
  compact?: boolean;
  onFocusFallback?: () => void;
  onSummary?: (summary: { count: number; more: boolean } | null) => void;
};
export function HistorySearch(props: HistorySearchProps) {
  return <SurfaceErrorBoundary><SearchContent {...props}/></SurfaceErrorBoundary>;
}
function SearchContent({ onOpen, documentId, courseId, compact = false, onFocusFallback, onSummary }: HistorySearchProps) {
  useTranslation();
  const format = useFormat();
  const [filters, setFilters] = useState<ChatSearch>({ scope: 'all', limit: 30, query: '', ...(documentId ? { documentId } : {}), ...(courseId ? { courseIds: [courseId] } : {}) });
  const [page, setPage] = useState<IpcResponse<'chats:search'>>({ items: [], nextCursor: null });
  const [facets, setFacets] = useState<IpcResponse<'chats:facets'>>({ courses: [], documents: [], models: [] });
  const [loading, setLoading] = useState(true), [error, setError] = useState(false), [revision, setRevision] = useState(0);
  const [undo, setUndo] = useState<{
    id: ChatHit['id'];
    patch: ChatPatch;
    restore?: { hit: ChatHit; index: number; filters: ChatSearch };
  } | null>(null);
  const [renaming, setRenaming] = useState<ChatHit | null>(null), [title, setTitle] = useState('');
  const [grouped, setGrouped] = useState(false);
  const [outcome, setOutcome] = useState<{ count: number; more: boolean } | 'error' | null>(null);
  const announce = useRef<{ timer?: ReturnType<typeof setTimeout>; filters: ChatSearch | null }>({ filters: null });
  const serial = useRef(0), host = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null), undoButton = useRef<HTMLButtonElement>(null);
  const afterDelete = useRef<{ id: string; neighbours: string[]; ready: boolean } | null>(null);
  const resultsList = useRef<HTMLDivElement>(null);
  const pages = useRef({ filters: null as ChatSearch | null, count: 1 });
  const current = useRef(filters);
  current.current = filters;
  const focusFallback = () => { if (onFocusFallback) onFocusFallback(); else searchInput.current?.focus(); };
  const leaveUndo = () => { if (document.activeElement === undoButton.current) focusFallback(); };
  const set = (patch: Partial<ChatSearch>) => { afterDelete.current = null; setFilters(f => ({ ...f, ...patch, cursor: undefined })); };
  useEffect(() => () => clearTimeout(announce.current.timer), []);
  useEffect(() => { let live = true; void desktop.invoke('chats:facets', {}).then(v => { if (live)
    setFacets(v); }).catch(() => { if (live)
    setError(true); }); return () => { live = false; }; }, [revision]);
  useEffect(() => {
    const generation = ++serial.current;
    const quiet = announce.current;
    clearTimeout(quiet.timer);
    const say = (next: NonNullable<typeof outcome>) => { quiet.timer = setTimeout(() => setOutcome(next), 500); };
    const want = pages.current.filters === filters ? pages.current.count : 1;
    setLoading(true);
    setError(false);
    const load = async () => {
      let result = await desktop.invoke('chats:search', filters), loaded = 1;
      while (loaded < want && result.nextCursor && generation === serial.current) {
        const next = await desktop.invoke('chats:search', { ...filters, cursor: result.nextCursor });
        const seen = new Set(result.items.map(h => h.id));
        result = { items: [...result.items, ...next.items.filter(h => !seen.has(h.id))], nextCursor: next.nextCursor };
        loaded++;
      }
      return { result, loaded };
    };
    const timer = setTimeout(() => { void load().then(({ result, loaded }) => { if (generation === serial.current) {
      pages.current = { filters, count: loaded };
      setPage(result);
      if (quiet.filters !== filters) {
        quiet.filters = filters;
        say({ count: result.items.length, more: !!result.nextCursor });
      }
    } }).catch(() => { if (generation === serial.current) {
      setError(true);
      quiet.filters = null;
      say('error');
    } }).finally(() => { if (generation === serial.current)
      setLoading(false); }); }, 120);
    return () => { clearTimeout(timer); serial.current++; };
  }, [filters, revision]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = -Infinity;
    const refresh = () => {
      if (timer !== undefined) return;
      const run = () => { timer = undefined; last = Date.now(); setRevision(n => n + 1); };
      const delay = Math.max(0, 500 - (Date.now() - last));
      if (delay) timer = setTimeout(run, delay); else run();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('vstudy:history-changed', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); window.removeEventListener('vstudy:history-changed', refresh); };
  }, []);
  useEffect(() => { if (!undo)
    return; const timer = setTimeout(() => { leaveUndo(); setUndo(null); }, 30000); return () => clearTimeout(timer); }, [undo]);
  useEffect(() => {
    const pending = afterDelete.current;
    if (!pending?.ready) return;
    const rows = Array.from(host.current?.querySelectorAll<HTMLElement>('[data-history-id]') ?? []);
    const find = (id: string) => rows.find(row => row.dataset.historyId === id);
    if (find(pending.id)) return;
    afterDelete.current = null;
    const active = document.activeElement;
    if (active && active !== document.body && !resultsList.current?.contains(active)) return;
    const target = pending.neighbours.map(find).find(Boolean) ?? undoButton.current;
    if (target) target.focus(); else focusFallback();
  }, [page]);
  useEffect(() => { onSummary?.(loading && !page.items.length || error || !page.items.length ? null : { count: page.items.length, more: !!page.nextCursor }); }, [page, loading, error]);
  const restoreRow = (restore: NonNullable<typeof undo>['restore']) => {
    if (!restore || restore.filters !== current.current) return;
    setPage(p => p.items.some(h => h.id === restore.hit.id) ? p : { ...p, items: [...p.items.slice(0, restore.index), restore.hit, ...p.items.slice(restore.index)] });
  };
  const update = async (hit: ChatHit, patch: ChatPatch) => {
    const ids = patch.deleted ? Array.from(host.current?.querySelectorAll<HTMLElement>('[data-history-id]') ?? [], row => row.dataset.historyId!) : [];
    const at = ids.indexOf(hit.id);
    const handoff = patch.deleted ? { id: hit.id, neighbours: [ids[at + 1], ids[at - 1]].filter((id): id is string => !!id && at >= 0), ready: false } : null;
    const restore = { hit, index: Math.max(0, page.items.findIndex(h => h.id === hit.id)), filters: current.current };
    if (handoff) afterDelete.current = handoff;
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
      setUndo({ id: hit.id, patch: previous, ...(patch.deleted ? { restore } : {}) });
      if (handoff) {
        handoff.ready = true;
        setPage(p => ({ ...p, items: p.items.filter(h => h.id !== hit.id) }));
        setRevision(n => n + 1);
      }
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
      if (generation === serial.current) {
        pages.current.count++;
        setPage(p => ({ items: [...p.items, ...next.items.filter(h => !p.items.some(old => old.id === h.id))], nextCursor: next.nextCursor }));
      }
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
  const searching = loading && !page.items.length;
  const announcement = outcome === 'error' ? tr('history:error') : outcome
    ? tr(outcome.more ? 'history:count_more' : 'history:count', { count: outcome.count, formatted: format.number(outcome.count) })
    : '';
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
  <label className="history-input"><Search size={18}/><input ref={searchInput} type="search" autoFocus={compact} aria-label={tr('history:search')} placeholder={tr('history:placeholder')} value={filters.query ?? ''} onChange={e => set({ query: e.target.value })}/></label>
  <Toolbar className="history-chips" role="group" aria-label={tr('history:filters')} left={(['all', 'courses', 'documents', 'general', 'pinned'] as const).map(chip => {
    const pressed = chip === 'pinned' ? !!filters.pinned : (filters.scope ?? 'all') === chip && !filters.pinned;
    const choose = () => set(chip === 'pinned'
      ? { pinned: filters.pinned ? undefined : true }
      : { scope: chip, pinned: undefined, courseIds: courseId ? [courseId] : undefined, documentId });
    return <button key={chip} aria-pressed={pressed} onClick={choose}>{tr('history:' + chip)}</button>;
  })}/>
  <details className="history-filters"><summary>{tr('history:more_filters')}</summary><div className="history-filter-grid">
   <FormField label={tr('history:course')}>{field => <select {...field} value={filters.courseIds?.[0] ?? ''} onChange={e => set({ courseIds: e.target.value ? [e.target.value] : undefined })}><option value="">{tr('history:all')}</option>{facets.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>}</FormField>
   <FormField label={tr('history:term')}>{field => <select {...field} value={filters.term ?? ''} onChange={e => set({ term: e.target.value || undefined })}><option value="">{tr('history:all')}</option>{[...new Set(facets.courses.flatMap(c => c.term ? [c.term] : []))].map(t => <option key={t}>{t}</option>)}</select>}</FormField>
   <FormField label={tr('history:document')}>{field => <select {...field} value={filters.documentId ?? ''} onChange={e => set({ documentId: e.target.value as ChatSearch['documentId'] || undefined })}><option value="">{tr('history:all')}</option>{facets.documents.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select>}</FormField>
   <FormField label={tr('history:role')}>{field => <select {...field} value={filters.role ?? ''} onChange={e => set({ role: e.target.value as ChatSearch['role'] || undefined })}><option value="">{tr('history:all')}</option><option value="user">{tr('history:questions')}</option><option value="assistant">{tr('history:answers')}</option></select>}</FormField>
   <FormField label={tr('history:model')}>{field => <select {...field} value={filters.model ?? ''} onChange={e => set({ model: e.target.value || undefined })}><option value="">{tr('history:all')}</option>{facets.models.map(m => <option key={m}>{m}</option>)}</select>}</FormField>
   <FormField label={tr('history:from')}>{field => <input {...field} type="date" onChange={e => set({ from: e.target.value ? new Date(e.target.value + 'T00:00:00').toISOString() : undefined })}/>}</FormField>
   <FormField label={tr('history:to')}>{field => <input {...field} type="date" onChange={e => set({ to: e.target.value ? new Date(e.target.value + 'T23:59:59.999').toISOString() : undefined })}/>}</FormField>
   <label className="history-check"><input type="checkbox" checked={!!filters.archived} onChange={e => set({ archived: e.target.checked })}/>{tr('history:archived')}</label>
   <label className="history-check"><input type="checkbox" checked={!!filters.hasAttachments} onChange={e => set({ hasAttachments: e.target.checked ? true : undefined })}/>{tr('history:attachments')}</label>
   <label className="history-check"><input type="checkbox" checked={!!filters.hasCitations} onChange={e => set({ hasCitations: e.target.checked ? true : undefined })}/>{tr('history:citations')}</label>
   <label className="history-check"><input type="checkbox" checked={grouped} onChange={e => setGrouped(e.target.checked)}/>{tr('history:group_courses')}</label>
  </div></details>
  {undo && <div role="status" className="history-undo">{tr('history:updated')}<button ref={undoButton} onClick={() => { afterDelete.current = null; void desktop.invoke('chats:update', { conversationId: undo.id, patch: undo.patch }).then(() => { leaveUndo(); setUndo(null); restoreRow(undo.restore); setRevision(n => n + 1); window.dispatchEvent(new Event('vstudy:history-changed')); }).catch(() => setError(true)); }}>{tr('history:undo')}</button></div>}
  {error && <p role="alert">{tr('history:error')} <button onClick={() => setRevision(n => n + 1)}>{tr('common:retry')}</button></p>}
  <div className="history-results" ref={resultsList} aria-busy={loading}>
   <p role="status" className={searching ? undefined : 'sr-only'}>{searching ? tr('history:searching') : announcement}</p>
   {!loading && !page.items.length && !error && <EmptyState headingLevel={2} icon={<Search size={28}/>} title={tr(filters.query ? 'history:no_results' : 'history:empty')} description={tr(filters.query ? 'history:no_results_hint' : 'history:empty_hint')}/>}
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
