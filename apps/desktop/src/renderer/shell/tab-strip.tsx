import { Button, IconButton, Popover, TextInput } from '@astryxdesign/core';
import { useEffect, useRef, useState } from 'react';
import { Home, BookOpen, FileText, GraduationCap, History, ClipboardCheck, Plus, List, X } from 'lucide-react';
import { useNavigate, type View } from './index';
import { hasNavigationOverlay } from './history-swipe-navigation';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { MAX_APP_TABS, type TabRoute } from '../../shared/app-tabs';
import './tab-strip.css';

const icons = { Home, BookOpen, FileText, GraduationCap, History, ClipboardCheck };
export function tabLabel(view: string): string {
  switch (view) {
    case 'home': return tr('library:home');
    case 'library': return tr('common:library');
    case 'workspace': return tr('tabs:document');
    case 'moodle': return tr('webview:title');
    case 'courses': return tr('moodle:courses');
    case 'history': return tr('history:title');
    case 'review': return tr('review:title');
    case 'exams': return tr('exams:title');
    default: return tr('web-chat:title');
  }
}
export function TabStrip() {
  const { tabs, openTab, closeTab, activateTab, reorderTabs } = useNavigate();
  const [native,setNative]=useState<Record<string,string>>({});
  const membership=tabs.tabs.map(tab=>tab.id).join(',');
  useEffect(()=>{
    let active=true;
    let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try {
        const result=await desktop.invoke('moodle:webview-sync',{tabIds:tabs.tabs.map(tab=>tab.id)}).catch(()=>({tabs:[]}));
        if(!active)return;
        const chat=await desktop.invoke('web-chat:sync',{tabIds:tabs.tabs.map(tab=>tab.id)}).catch(()=>({tabs:[]}));
        if(active) setNative(Object.fromEntries([...result.tabs,...chat.tabs].map(tab=>[tab.tabId,tab.status])));
      } catch {if(active) setNative({});}
      if(active) timer=setTimeout(()=>void poll(),1000);
    };
    void poll();
    return ()=>{active=false;clearTimeout(timer);};
  },[membership]);
  const [picker, setPicker] = useState(false);
  useEffect(()=>{const limit=()=>setPicker(true);window.addEventListener('vstudy:tab-limit',limit);return()=>window.removeEventListener('vstudy:tab-limit',limit);},[]);
  const [all, setAll] = useState(false);
  const [search, setSearch] = useState('');
  const [recent, setRecent] = useState<TabRoute[]>([]);
  useEffect(() => {
    if (!picker) return;
    let active = true;
    void desktop.invoke('dashboard:get', {}).then(data => {
      if (active) setRecent(data.recentDocuments.slice(0, 5).map(({ document }) => ({ view: 'workspace', documentId: document.id, title: document.title })));
    }).catch(() => { if (active) setRecent([]); });
    return () => { active = false; };
  }, [picker]);
  const [announcement, setAnnouncement] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number } | null>(null);
  const labels = tabs.tabs.map(tab => tab.title || tabLabel(tab.history.entries[tab.history.index]!.view));
  useEffect(() => {
    const reveal = () => root.current?.querySelector('.app-tab[data-active=true]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    reveal();
    const observer = new ResizeObserver(reveal);
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [tabs.activeId, tabs.tabs.length]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || hasNavigationOverlay()) return;
      const index = tabs.tabs.findIndex(tab => tab.id === tabs.activeId);
      let target: number | undefined;
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 't') { event.preventDefault(); setPicker(true); return; }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'w') { event.preventDefault(); closeTab(tabs.activeId); return; }
      if (event.ctrlKey && event.key === 'Tab') target = (index + (event.shiftKey ? -1 : 1) + tabs.tabs.length) % tabs.tabs.length;
      if (event.metaKey && event.shiftKey && ['BracketLeft', 'BracketRight'].includes(event.code)) target = (index + (event.code === 'BracketLeft' ? -1 : 1) + tabs.tabs.length) % tabs.tabs.length;
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && /^[1-9]$/.test(event.key)) target = event.key === '9' ? tabs.tabs.length - 1 : Number(event.key) - 1;
      if (target !== undefined && tabs.tabs[target]) { event.preventDefault(); activateTab(tabs.tabs[target]!.id); }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [tabs, activateTab, closeTab]);
  useEffect(()=>desktop.onNativeTabShortcut?.(shortcut=>{
    if(shortcut==='new') {setPicker(true);return;}
    if(shortcut==='close') {closeTab(tabs.activeId);return;}
    const index=tabs.tabs.findIndex(tab=>tab.id===tabs.activeId);
    const next=shortcut==='previous' ? (index-1+tabs.tabs.length)%tabs.tabs.length : shortcut==='next' ? (index+1)%tabs.tabs.length : shortcut==='9' ? tabs.tabs.length-1 : Number(shortcut)-1;
    if(tabs.tabs[next]) activateTab(tabs.tabs[next]!.id);
  }),[tabs,closeTab,activateTab]);
  const reorder = (index: number, target: number) => {
    if (target < 0 || target >= tabs.tabs.length) return;
    const ids = tabs.tabs.map(tab => tab.id);
    ids.splice(target, 0, ids.splice(index, 1)[0]!);
    reorderTabs(ids); setAnnouncement(tr('tabs:reordered', { title: labels[index], position: target + 1 }));
  };
  return <div
  ref={root}
  className={`app-tabs ${tabs.tabs.length === 1 ? 'app-tabs-single' : ''}`}
>
  {tabs.tabs.length > 1 && (
    <div
      className="app-tabs-scroll"
      role="tablist"
      aria-label={tr('tabs:title')}
    >
      {tabs.tabs.map((tab, index) => {
        const Icon = icons[tab.icon];
        const nativeStatus =
          native[tab.id] ??
          (['moodle', 'hosted-chat'].includes(
            tab.history.entries[tab.history.index]?.view ?? '',
          ) && tab.id !== tabs.activeId
            ? 'discarded'
            : undefined);
        return (
          <div
            className="app-tab"
            key={tab.id}
            data-active={tab.id === tabs.activeId}
            onPointerDown={(event) => {
              if (event.button === 0) drag.current = { id: tab.id, x: event.clientX };
            }}
            onPointerUp={(event) => {
              const source = drag.current;
              drag.current = null;
              if (
                source &&
                source.id !== tab.id &&
                Math.abs(event.clientX - source.x) >= 4
              )
                reorder(
                  tabs.tabs.findIndex((item) => item.id === source.id),
                  index,
                );
            }}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                closeTab(tab.id);
              }
            }}
          >
            <button
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-controls="active-tab-panel"
              aria-selected={tab.id === tabs.activeId}
              tabIndex={tab.id === tabs.activeId ? 0 : -1}
              aria-busy={nativeStatus === 'loading'}
              title={nativeStatus === 'discarded' ? tr('tabs:discarded') : labels[index]}
              onClick={() => activateTab(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'Delete') {
                  if (event.repeat || event.nativeEvent.isComposing ||
                    event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
                  event.preventDefault();
                  closeTab(tab.id);
                  return;
                }
                const target =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.tabs.length - 1
                      : event.key === 'ArrowRight'
                        ? (index + 1) % tabs.tabs.length
                        : event.key === 'ArrowLeft'
                          ? (index - 1 + tabs.tabs.length) % tabs.tabs.length
                          : undefined;
                if (target === undefined) return;
                event.preventDefault();
                if (
                  event.shiftKey &&
                  (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
                )
                  reorder(index, index + (event.key === 'ArrowLeft' ? -1 : 1));
                else {
                  activateTab(tabs.tabs[target]!.id);
                  document.getElementById(`tab-${tabs.tabs[target]!.id}`)?.focus();
                }
              }}
            >
              <Icon
                size={15}
                aria-hidden="true"
              />
              <span>
                {nativeStatus === 'loading'
                  ? '◌ '
                  : nativeStatus === 'discarded'
                    ? '↻ '
                    : ''}
                {labels[index]}
              </span>
              {nativeStatus === 'discarded' && (
                <span className="sr-only">{tr('tabs:discarded')}</span>
              )}
            </button>
            <IconButton
              variant="ghost"
              size="sm"
              tabIndex={-1}
              className="app-tab-close"
              label={tr('tabs:close', { title: labels[index] })}
              icon={<X size={13} />}
              onClick={() => closeTab(tab.id)}
            />
          </div>
        );
      })}
    </div>
  )}
  <Popover
    isOpen={picker}
    onOpenChange={setPicker}
    placement="below"
    alignment="end"
    label={tr('tabs:new')}
    content={
      <div className="app-tabs-menu">
        {tabs.tabs.length >= MAX_APP_TABS ? (
          <p role="status">{tr('tabs:limit')}</p>
        ) : (
          <>
            {(['home', 'courses', 'library', 'ai-chats'] satisfies View[]).map((view) => (
              <Button
                variant="ghost"
                key={view}
                label={tabLabel(view)}
                onClick={() => {
                  setPicker(false);
                  openTab(view);
                }}
              />
            ))}
            <small>{tr('tabs:recent')}</small>
            {recent.map((route) => (
              <Button
                variant="ghost"
                key={route.documentId}
                label={route.title ?? ''}
                onClick={() => {
                  setPicker(false);
                  openTab(route);
                }}
              />
            ))}
          </>
        )}
      </div>
    }
  >
    <IconButton
      variant="ghost"
      size="sm"
      className="app-tabs-add"
      label={tr('tabs:new')}
      tooltip={tr('tabs:new')}
      icon={<Plus size={17} />}
    />
  </Popover>
  {tabs.tabs.length > 1 && (
    <Popover
      isOpen={all}
      onOpenChange={setAll}
      placement="below"
      alignment="end"
      label={tr('tabs:all')}
      content={
        <div className="app-tabs-menu">
          <TextInput
            type="search"
            label={tr('tabs:search')}
            isLabelHidden
            placeholder={tr('tabs:search')}
            value={search}
            onChange={setSearch}
          />
          {tabs.tabs.map(
            (tab, index) =>
              labels[index]!.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (
                <Button
                  variant="ghost"
                  key={tab.id}
                  label={labels[index]!}
                  aria-current={tab.id === tabs.activeId ? 'page' : undefined}
                  onClick={() => {
                    setAll(false);
                    activateTab(tab.id);
                  }}
                />
              ),
          )}
        </div>
      }
    >
      <IconButton variant="ghost" size="sm" label={tr('tabs:all')} tooltip={tr('tabs:all')} icon={<List size={17} />} />
    </Popover>
  )}
  <span
    className="sr-only tab-announcement"
    role="status"
  >
    {announcement}
  </span>
</div>;
}
