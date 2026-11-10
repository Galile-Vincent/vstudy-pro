/** Student dashboard with a reading-first hierarchy and optional setup guidance. */
import { Brand } from '../components/brand';
import { contentLanguage } from '../../shared/content-language';
import { DocumentArt } from '../shell/document-art';
import { ArrowDown, ArrowUp, ArrowUpRight, BookOpen, Info } from 'lucide-react';
import { Button, Card as AstryxCard, IconButton, ProgressBar, Skeleton, Tooltip } from '@astryxdesign/core';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { dashboardSchema, folderSchema } from '../../shared/library';
import type { Document, Settings } from '../../shared';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { useFormat } from '../i18n';
import { UploadCard } from './upload-card';
import './home.css';
import { PageContainer, PageHeader, Section, Stat, ListRow } from '../components/ui';
import { plainText } from '../../shared/plain-text';
export type HomeNavigate = (view: 'home' | 'library' | 'workspace' | 'welcome', documentId?: Document['id']) => void;
export type Dashboard = z.infer<typeof dashboardSchema>;
export function Card({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <AstryxCard padding={6} className={`home-tone min-w-0 ${className}`}>
      <Section title={title}>{children}</Section>
    </AstryxCard>
  );
}
export function sparklinePoints(values: number[]) {
  const max = Math.max(1, ...values);
  return values
    .map((v, i) => `${values.length < 2 ? 50 : (i / (values.length - 1)) * 100},${28 - (Math.max(0, v) / max) * 26}`)
    .join(' ');
}
export function Sparkline({ series }: { series: Dashboard['series'] }) {
  return (
    <svg
      className="home-sparkline"
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      role="img"
      aria-label={tr('home:sparkline')}
    >
      {series.length === 1 ? (
        <circle cx="50" cy="15" r="2" fill="currentColor" />
      ) : (
        <polyline
          pathLength={1}
          points={sparklinePoints(series.map((d) => d.inputTokens + d.outputTokens))}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
export function Streak({ streak }: { streak: Dashboard['streak'] }) {
  const fmt = useFormat();
  return (
    <>
      <Stat
        label={tr(streak.today ? 'home:studied_today' : 'home:today_invitation')}
        value={
          <strong>{tr('home:streak_days', { count: streak.current, formatted: fmt.number(streak.current) })}</strong>
        }
      />
      <ul className="streak-days">
        {streak.days.slice(-7).map((d) => (
          <li
            key={d.date}
            data-studied={d.studied}
            title={d.date}
            data-today={d.date === new Intl.DateTimeFormat('en-CA').format(new Date())}
          >
            <span aria-hidden="true">{d.studied ? '●' : '○'}</span>
            <small>
              {new Intl.DateTimeFormat(globalThis.document?.documentElement.lang || 'en', {
                weekday: 'narrow',
                timeZone: 'UTC',
              }).format(new Date(d.date + 'T12:00:00Z'))}
            </small>
            <span className="motion-sr">{tr(d.studied ? 'home:day_studied' : 'home:day_rest', { date: d.date })}</span>
          </li>
        ))}
      </ul>
      <Tooltip content={tr('home:streak_definition')}>
        <small className="muted" tabIndex={0}>
          {tr('home:best', { count: streak.best, formatted: fmt.number(streak.best) })}
        </small>
      </Tooltip>
    </>
  );
}
function Pins({
  kind,
  items,
  onOpen,
  refresh,
  onError,
}: {
  kind: 'documents' | 'folders';
  items: { id: string; title: string }[];
  onOpen: (id: string) => void;
  refresh: () => void;
  onError: () => void;
}) {
  const reorder = async (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const ids = items.map((item) => item.id);
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    try {
      await desktop.invoke('library:pins:reorder', { kind, ids });
      refresh();
    } catch {
      onError();
    }
  };
  return items.length ? (
    <ul className="home-list">
      {items.slice(0, 5).map((item, i) => (
        <li
          key={item.id}
          draggable
          onDragStart={(e) => e.dataTransfer.setData(`application/vstudy-${kind}`, String(i))}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const value = e.dataTransfer.getData(`application/vstudy-${kind}`);
            if (value) void reorder(Number(value), i);
          }}
          onKeyDown={(e) => {
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              e.preventDefault();
              void reorder(i, i + (e.key === 'ArrowUp' ? -1 : 1));
            }
          }}
        >
          <ListRow
            className="min-w-0 flex-1"
            title={<span lang={contentLanguage(item.title) ?? 'en'}>{item.title}</span>}
            onClick={() => onOpen(item.id)}
            actions={
              <>
                <IconButton
                  variant="ghost"
                  size="sm"
                  isDisabled={!i}
                  label={tr('home:move_up', { title: item.title })}
                  icon={<ArrowUp size={14} />}
                  onClick={() => void reorder(i, i - 1)}
                />
                <IconButton
                  variant="ghost"
                  size="sm"
                  isDisabled={i === items.length - 1}
                  label={tr('home:move_down', { title: item.title })}
                  icon={<ArrowDown size={14} />}
                  onClick={() => void reorder(i, i + 1)}
                />
              </>
            }
          />
        </li>
      ))}
    </ul>
  ) : (
    <p className="home-empty">{tr(kind === 'documents' ? 'home:no_pinned_documents' : 'home:no_pinned_folders')}</p>
  );
}
export function Home({
  navigate,
  onUsage,
  onFolder,
  name,
  initialData,
  guidance,
}: {
  navigate: HomeNavigate;
  onUsage: () => void;
  onFolder?: (id: z.infer<typeof folderSchema>['id']) => void;
  name?: string;
  initialData?: Dashboard;
  guidance?: ReactNode;
}) {
  useTranslation();
  const fmt = useFormat();
  const [data, setData] = useState(initialData);
  const [settings, setSettings] = useState<Settings>();
  const [folders, setFolders] = useState<z.infer<typeof folderSchema>[]>([]);
  const [error, setError] = useState('');
  const [hour, setHour] = useState(new Date().getHours());
  const refresh = useCallback(() => {
    void Promise.all([
      desktop.invoke('dashboard:get', {}),
      desktop.invoke('settings:get', {}),
      desktop.invoke('library:folders:list', {}),
    ])
      .then(([d, s, f]) => {
        setData(d);
        setSettings(s);
        setFolders(f);
        setError('');
      })
      .catch(() => setError(tr('home:load_error')));
  }, []);
  useEffect(() => {
    if (!initialData) refresh();
    const timer = window.setInterval(() => {
      setHour(new Date().getHours());
      refresh();
    }, 60_000);
    const events = ['activity-updated', 'usage-updated', 'focus', 'library-updated'];
    events.forEach((event) => window.addEventListener(event, refresh));
    const unsubscribe = desktop.onDocumentProgress?.(refresh);
    return () => {
      clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, refresh));
      unsubscribe?.();
    };
  }, [refresh, initialData]);
  const tokens = data ? data.month.inputTokens + data.month.outputTokens : 0;
  const percent = Math.max(
    settings?.monthlyBudgetUsd ? ((data?.month.costUsd ?? 0) / settings.monthlyBudgetUsd) * 100 : 0,
    settings?.monthlyTokenBudget ? (tokens / settings.monthlyTokenBudget) * 100 : 0
  );
  const displayName = name ?? settings?.displayName;
  return (
    <PageContainer as="main" className="home-page" data-tab-scroll="">
      <div className="home-content">
        <PageHeader
          leading={<Brand />}
          title={
            <>
              {tr(`home:${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}`)}
              {displayName ? tr('home:greeting_name', { name: displayName }) : ''}
            </>
          }
          description={tr('home:prompt_1')}
          actions={
            <Button variant="ghost" id="welcome-entry" icon={<Info size={14} />} label={`${tr('home:how_to_use')} · ${tr('welcome:try_title')}`} onClick={() => navigate('welcome')} />
          }
        />

        {error && (
          <div role="alert">
            {error}
            <Button variant="ghost" label={tr('common:retry')} onClick={refresh} />
          </div>
        )}
        {!data ? (
          !error && (
            <div className="home-grid" role="status" aria-busy="true" aria-label={tr('home:loading')}>
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} height="calc(var(--space-8) * 6)" index={i} />
              ))}
            </div>
          )
        ) : (
          <div className="home-grid">
            {!!data.recentDocuments.length && (
              <Section title={tr('home:continue')}>
                <div className="flex flex-col gap-[var(--space-2)]">
                  {data.recentDocuments.slice(0, 6).map((recent, index) => {
                    const title = recent.document.title;
                    const thumbnail = (
                      <span className="home-recent-thumbnail">
                        <DocumentArt
                          id={recent.document.id}
                          kind={recent.document.sourceName.split('.').pop()?.toUpperCase() ?? 'MD'}
                        />
                      </span>
                    );
                    const snippet = recent.lastChat && (
                      <span className="line-clamp-2">{plainText(recent.lastChat)}</span>
                    );
                    return index === 0 ? (
                      <AstryxCard key={recent.document.id} padding={3} className="home-tone home-continue">
                        {thumbnail}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium break-words" lang={contentLanguage(title) ?? 'en'}>
                            {title}
                          </h3>
                          <p className="text-[var(--muted)]">{snippet}</p>
                        </div>
                        <Button
                          variant="primary"
                          label={tr('home:resume_title', { title })}
                          endContent={<ArrowUpRight size={16} aria-hidden="true" />}
                          onClick={() => navigate('workspace', recent.document.id)}
                        >
                          {tr('home:resume')}
                        </Button>
                      </AstryxCard>
                    ) : (
                      <ListRow
                        key={recent.document.id}
                        leading={thumbnail}
                        title={
                          <span className="break-words" lang={contentLanguage(title) ?? 'en'}>
                            {title}
                          </span>
                        }
                        subtitle={snippet}
                        onClick={() => navigate('workspace', recent.document.id)}
                      />
                    );
                  })}
                </div>
              </Section>
            )}
            <div className="art-reader-launchpad">
              <UploadCard
                title={tr('home:upload')}
                primary={!data.recentDocuments.length}
                folders={folders}
                onImported={refresh}
                footer={
                  <Button variant="ghost" icon={<BookOpen size={16} />} endContent={<ArrowUpRight size={16} aria-hidden="true" />} label={tr('common:library')} onClick={() => navigate('library')} />
                }
              />
            </div>
            <div className="home-secondary">
              {guidance}
              {!!data.month.calls && (
                <Card title={tr('home:usage')}>
                  <Stat
                    label={tr('home:month_tokens', {
                      cost: fmt.currency(data.month.costUsd),
                    })}
                    value={fmt.number(tokens, {
                      notation: tokens >= 1e6 ? 'compact' : 'standard',
                      maximumFractionDigits: 1,
                    })}
                    title={fmt.number(tokens)}
                    aria-label={fmt.number(tokens)}
                  />
                  <Sparkline series={data.series} />
                  {!!(settings?.monthlyBudgetUsd || settings?.monthlyTokenBudget) && (
                    <>
                      <label>
                        {tr('home:budget', { percent: fmt.number(percent) })}
                        <ProgressBar label={tr('common:monthly_budget_used')} isLabelHidden value={Math.min(100, percent)} />
                      </label>
                    </>
                  )}
                  <Button variant="ghost" label={tr('home:view_usage')} onClick={onUsage} />
                </Card>
              )}
              {data.streak.best > 0 && (
                <Card title={tr('home:streak')}>
                  <Streak streak={data.streak} />
                </Card>
              )}
            </div>
            {!!data.pinnedFolders.length && (
              <div className="home-pins">
                <Card title={tr('home:pinned_folders')}>
                  <Pins
                    kind="folders"
                    items={data.pinnedFolders.map((f) => ({
                      id: f.id,
                      title: f.name,
                    }))}
                    onOpen={(id) => {
                      const folder = data.pinnedFolders.find((f) => f.id === id);
                      if (folder) onFolder?.(folder.id);
                    }}
                    refresh={refresh}
                    onError={() => setError(tr('errors:generic'))}
                  />
                </Card>
              </div>
            )}
            {!!data.pinnedDocuments.length && (
              <div className="home-pins">
                <Card title={tr('home:pinned_documents')}>
                  <Pins
                    kind="documents"
                    items={data.pinnedDocuments.map((d) => ({
                      id: d.document.id,
                      title: d.document.title,
                    }))}
                    onOpen={(id) => {
                      const d = data.pinnedDocuments.find((d) => d.document.id === id);
                      if (d) navigate('workspace', d.document.id);
                    }}
                    refresh={refresh}
                    onError={() => setError(tr('errors:generic'))}
                  />
                </Card>
              </div>
            )}
            {!!data.recentActivity.length && (
              <section className="home-activity" aria-label={tr('home:activity')}>
                <details>
                  <summary>{tr('home:activity')}</summary>
                    <ul className="home-list">
                      {data.recentActivity.slice(0, 5).map((a) => (
                        <li key={a.id}>
                          <ListRow
                            onClick={() => navigate('workspace', a.documentId)}
                            title={
                              <>
                                {tr(a.kind === 'import' ? 'home:activity_import' : 'home:activity_chat')}
                                {a.documentTitle && <strong>{a.documentTitle}</strong>}
                              </>
                            }
                            subtitle={fmt.date(a.createdAt)}
                          />
                        </li>
                      ))}
                    </ul>
                </details>
              </section>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
