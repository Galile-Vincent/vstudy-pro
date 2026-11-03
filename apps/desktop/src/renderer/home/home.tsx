import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { dashboardSchema, folderSchema } from '../../shared/library';
import type { Document, Settings } from '../../shared';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { useFormat } from '../i18n';
import { AnimatedText } from '../motion/animated-text';
import { UploadCard } from './upload-card';
import './home.css';
export type HomeNavigate = (view: 'home' | 'library' | 'workspace', documentId?: Document['id']) => void;
export type Dashboard = z.infer<typeof dashboardSchema>;
export function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return <section className="home-card" aria-labelledby={id}><h2 id={id}>{title}</h2>{children}</section>;
}
export function sparklinePoints(values: number[]) {
  const max = Math.max(1, ...values);
  return values.map((v, i) => `${values.length < 2 ? 50 : i / (values.length - 1) * 100},${28 - Math.max(0, v) / max * 26}`).join(' ');
}
export function Sparkline({ series }: { series: Dashboard['series'] }) {
  return <svg className="home-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={tr('home:sparkline')}><polyline points={sparklinePoints(series.map(d => d.inputTokens + d.outputTokens))} fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke" /></svg>;
}
export function Streak({ streak }: { streak: Dashboard['streak'] }) {
  const fmt = useFormat();
  return <><strong className="home-stat">{tr('home:streak_days', { count: streak.current, formatted: fmt.number(streak.current) })}</strong><p>{tr(streak.today ? 'home:studied_today' : 'home:today_invitation')}</p><p className="muted">{tr('home:best', { count: streak.best, formatted: fmt.number(streak.best) })}</p><ul className="streak-days">{streak.days.slice(-7).map(d => <li key={d.date} data-studied={d.studied} title={d.date}><span aria-hidden="true">{d.studied ? '●' : '○'}</span><span className="motion-sr">{tr(d.studied ? 'home:day_studied' : 'home:day_rest', { date: d.date })}</span></li>)}</ul><small className="muted">{tr('home:streak_definition')}</small></>;
}
function Pins({ kind, items, onOpen, refresh, onError }: { kind: 'documents' | 'folders'; items: { id: string; title: string }[]; onOpen: (id: string) => void; refresh: () => void; onError: () => void }) {
  const reorder = async (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const ids = items.map(item => item.id); ids.splice(to, 0, ids.splice(from, 1)[0]!);
    try { await desktop.invoke('library:pins:reorder', { kind, ids }); refresh(); } catch { onError(); }
  };
  return items.length ? <ul className="home-list">{items.map((item, i) => <li key={item.id} draggable onDragStart={e => e.dataTransfer.setData(`application/vstudy-${kind}`, String(i))} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); e.stopPropagation(); const value = e.dataTransfer.getData(`application/vstudy-${kind}`); if (value) void reorder(Number(value), i); }} onKeyDown={e => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); void reorder(i, i + (e.key === 'ArrowUp' ? -1 : 1)); } }}>
    <button className="home-row" onClick={() => onOpen(item.id)}>{item.title}</button><button disabled={!i} aria-label={tr('home:move_up', { title: item.title })} onClick={() => void reorder(i, i - 1)}>↑</button><button disabled={i === items.length - 1} aria-label={tr('home:move_down', { title: item.title })} onClick={() => void reorder(i, i + 1)}>↓</button>
  </li>)}</ul> : <p className="home-empty">{tr(kind === 'documents' ? 'home:no_pinned_documents' : 'home:no_pinned_folders')}</p>;
}
export function Home({ navigate, onUsage, onFolder, name, initialData }: { navigate: HomeNavigate; onUsage: () => void; onFolder?: (id: z.infer<typeof folderSchema>['id']) => void; name?: string; initialData?: Dashboard }) {
  useTranslation();
  const fmt = useFormat();
  const [data, setData] = useState(initialData);
  const [settings, setSettings] = useState<Settings>();
  const [folders, setFolders] = useState<z.infer<typeof folderSchema>[]>([]);
  const [error, setError] = useState('');
  const [hour, setHour] = useState(new Date().getHours());
  const refresh = useCallback(() => {
    void Promise.all([desktop.invoke('dashboard:get', {}), desktop.invoke('settings:get', {}), desktop.invoke('library:folders:list', {})]).then(([d, s, f]) => { setData(d); setSettings(s); setFolders(f); setError(''); }).catch(() => setError(tr('home:load_error')));
  }, []);
  useEffect(() => {
    if (!initialData) refresh();
    const timer = window.setInterval(() => { setHour(new Date().getHours()); refresh(); }, 60_000);
    const events = ['activity-updated', 'usage-updated', 'focus', 'library-updated'];
    events.forEach(event => window.addEventListener(event, refresh));
    const unsubscribe = desktop.onDocumentProgress?.(refresh);
    return () => { clearInterval(timer); events.forEach(event => window.removeEventListener(event, refresh)); unsubscribe?.(); };
  }, [refresh, initialData]);
  const tokens = data ? data.month.inputTokens + data.month.outputTokens : 0;
  const percent = Math.max(settings?.monthlyBudgetUsd ? (data?.month.costUsd ?? 0) / settings.monthlyBudgetUsd * 100 : 0, settings?.monthlyTokenBudget ? tokens / settings.monthlyTokenBudget * 100 : 0);
  const displayName = name ?? settings?.displayName;
  return <main className="home-page">
    <header className="home-greeting"><h1>{tr(`home:${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}`)}{displayName ? tr('home:greeting_name', { name: displayName }) : ''}</h1><p><AnimatedText texts={[tr('home:prompt_1'), tr('home:prompt_2'), tr('home:prompt_3')]} /></p></header>
    {error && <div role="alert">{error}<button onClick={refresh}>{tr('common:retry')}</button></div>}
    {!data ? !error && <div className="home-grid" role="status" aria-busy="true" aria-label={tr('home:loading')}>{Array.from({ length: 6 }, (_, i) => <div className="home-card home-skeleton" key={i}/>)}</div> : <div className="home-grid">
      <Card title={tr('home:continue')}><ul className="home-list">{data.recentDocuments.slice(0, 3).map(d => <li key={d.document.id}><button className="home-row" onClick={() => navigate('workspace', d.document.id)}><strong>{d.document.title}</strong><small>{d.lastChat || tr('home:continue_hint')}</small><span className="home-marker" aria-hidden="true"/></button></li>)}</ul>{!data.recentDocuments.length && <p className="home-empty">{tr('home:no_recent')}</p>}<button onClick={() => navigate('library')}>{tr('home:open_library')}</button></Card>
      <Card title={tr('home:upload')}><UploadCard folders={folders} onImported={refresh}/></Card>
      <Card title={tr('home:usage')}><strong className="home-stat" title={fmt.number(tokens)} aria-label={fmt.number(tokens)}>{fmt.number(tokens, { notation: tokens >= 1e6 ? "compact" : "standard", maximumFractionDigits: 1 })}</strong><p>{tr('home:month_tokens', { cost: fmt.currency(data.month.costUsd) })}</p><Sparkline series={data.series}/>{!!(settings?.monthlyBudgetUsd || settings?.monthlyTokenBudget) && <><label>{tr('home:budget', { percent: fmt.number(percent) })}<progress aria-label={tr('common:monthly_budget_used')} max={100} value={Math.min(100, percent)}/></label></>}<button onClick={onUsage}>{tr('home:view_usage')}</button></Card>
      <Card title={tr('home:pinned_folders')}><Pins kind="folders" items={data.pinnedFolders.map(f => ({ id: f.id, title: f.name }))} onOpen={id => { const folder = data.pinnedFolders.find(f => f.id === id); if (folder && onFolder) onFolder(folder.id); else navigate('library'); }} refresh={refresh} onError={() => setError(tr('errors:generic'))}/></Card>
      <Card title={tr('home:pinned_documents')}><Pins kind="documents" items={data.pinnedDocuments.map(d => ({ id: d.document.id, title: d.document.title }))} onOpen={id => { const d = data.pinnedDocuments.find(d => d.document.id === id); if (d) navigate('workspace', d.document.id); }} refresh={refresh} onError={() => setError(tr('errors:generic'))}/></Card>
      <Card title={tr('home:streak')}><Streak streak={data.streak}/></Card>
      <section className="home-card home-activity" aria-label={tr("home:activity")}><details><summary>{tr('home:activity')}</summary>{data.recentActivity.length ? <ul className="home-list">{data.recentActivity.map(a => <li key={a.id}><button className="home-row" onClick={() => navigate('workspace', a.documentId)}>{tr(a.kind === 'import' ? 'home:activity_import' : 'home:activity_chat')}<small>{fmt.date(a.createdAt)}</small></button></li>)}</ul> : <p className="home-empty">{tr('home:no_activity')}</p>}</details></section>
    </div>}
  </main>;
}
