import { IconButton } from "@astryxdesign/core";
import { Button } from "@astryxdesign/core";
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, CheckCheck, Mail, MailOpen } from 'lucide-react';
import type { MoodleCourse, MoodleNotification } from '../../shared/moodle';
import { i18n, tr } from '../../shared/i18n';
import { displayTitle } from '../../shared/moodle-course-display';
import { plainText } from '../../shared/plain-text';
import './updates.css';

function dayGroup(value: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const time = Date.parse(value);
  return time >= +today ? 'today' : time >= +yesterday ? 'yesterday' : 'earlier';
}
function relativeTime(value: string) {
  const minutes = (Date.parse(value) - Date.now()) / 60000;
  const unit = Math.abs(minutes) < 60 ? 'minute' : Math.abs(minutes) < 1440 ? 'hour' : 'day';
  return new Intl.RelativeTimeFormat(i18n.resolvedLanguage, { numeric: 'auto' }).format(Math.round(minutes / (unit === 'minute' ? 1 : unit === 'hour' ? 60 : 1440)), unit);
}

export function UpdatesInbox({ items, courses, onRead, onClose, onOpen }: {
  items: MoodleNotification[];
  courses: MoodleCourse[];
  onRead: (items: MoodleNotification[], read: boolean) => Promise<void>;
  onClose: () => void;
  onOpen: (item: MoodleNotification) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const readerHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => readerHeading.current?.focus({preventScroll:true}), [selectedId]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({preventScroll:true}), []);
  const selected = items.find(item => item.id === selectedId);
  const visible = [...items].filter(item => filter === 'all' || !item.read).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  const unread = items.filter(item => !item.read);
  const sender = (item: MoodleNotification) => {
    const course = courses.find(course => course.id === item.courseId);
    return course ? displayTitle(course.identity, i18n.resolvedLanguage || 'en', course.fullName) : tr('moodle:school');
  };
  const changeRead = async (targets: MoodleNotification[], read: boolean, restoreFocus = true) => {
    const active = document.activeElement;
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('.update-open') ?? []);
    const index = buttons.findIndex(button => button === active || button.parentElement?.contains(active));
    setBusy(true);
    try { await onRead(targets, read); } finally {
      setBusy(false);
      requestAnimationFrame(() => {
        if (!restoreFocus || index < 0 || active?.isConnected) return;
        const remaining = list.current?.querySelectorAll<HTMLButtonElement>('.update-open');
        (remaining?.[Math.min(index, remaining.length-1)] ?? heading.current)?.focus();
      });
    }
  };
  const open = (item: MoodleNotification) => {
    setSelectedId(item.id);
    if (!item.read) void changeRead([item], true, false);
  };
  return <section className="updates-inbox" aria-labelledby="updates-title" aria-busy={busy}>
    <Button icon={<ArrowLeft />} label={(tr('moodle:courses'))} variant="ghost" className="moodle-back" onClick={onClose}>{tr('moodle:courses')}</Button>
    <header className="updates-heading">
      <h1 id="updates-title" tabIndex={-1} ref={heading}>{tr('moodle:updates')}</h1>
      <Button icon={<CheckCheck />} label={(tr('moodle:mark_all_read'))} variant="ghost"  isDisabled={busy || !unread.length} onClick={() => void changeRead(unread, true)}>{tr('moodle:mark_all_read')}</Button>
    </header>
    <div className="updates-toolbar" role="group" aria-label={tr('moodle:updates_filter')}>
      {(['all','unread'] as const).map(value => <Button label={(tr(`moodle:updates_${value}`))} key={value} variant="ghost" aria-pressed={filter === value} onClick={() => {setFilter(value);setSelectedId(undefined);}}>{tr(`moodle:updates_${value}`)}{value === 'unread' && unread.length > 0 && <span>{unread.length}</span>}</Button>)}
    </div>
    <div className="updates-layout" data-reading={!!selected}>
      <div className="updates-list" ref={list} onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey || !(event.target instanceof HTMLElement)) return;
        const row = event.target.closest<HTMLElement>('[data-update-id]');
        const item = items.find(item => item.id === row?.dataset.updateId);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
          const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('.update-open') ?? []);
          const index = buttons.findIndex(button => button === event.target);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : Math.max(0,Math.min(buttons.length-1,index+(event.key === 'ArrowDown' ? 1 : -1)));
          event.preventDefault(); buttons[next]?.focus();
        } else if (event.key.toLowerCase() === 'm' && item && !busy) {
          event.preventDefault(); void changeRead([item], !item.read);
        }
      }}>
        {(['today','yesterday','earlier'] as const).map(group => {
          const rows = visible.filter(item => dayGroup(item.createdAt) === group);
          return rows.length > 0 && <section className="updates-group" key={group} aria-labelledby={`updates-${group}`}>
            <h2 id={`updates-${group}`}>{tr(`moodle:updates_${group}`)}</h2>
            <ul>{rows.map(item => <li key={item.id} data-update-id={item.id} data-unread={!item.read} data-selected={item.id === selectedId}>
              <button className="update-open" aria-disabled={busy} onClick={() => {if (!busy) open(item);}} aria-current={item.id === selectedId ? 'true' : undefined}>
                <span className="update-dot" role="img" aria-label={tr(item.read ? 'moodle:read' : 'moodle:unread')} />
                <span className="update-copy"><span className="update-sender">{sender(item)}</span><span className="update-subject">{item.subject || tr('moodle:updates')}</span><span className="update-preview">{plainText(item.body).replace(/\s+/g,' ')}</span></span>
                <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString(i18n.resolvedLanguage)}>{relativeTime(item.createdAt)}</time>
              </button>
              <IconButton label={tr(item.read ? 'moodle:mark_unread' : 'moodle:mark_read')} className="update-toggle" variant="ghost"  size="md"  isDisabled={busy} {...{title:tr(item.read ? 'moodle:mark_unread' : 'moodle:mark_read')}} aria-label={tr(item.read ? 'moodle:mark_unread' : 'moodle:mark_read')} onClick={() => void changeRead([item], !item.read)} icon={item.read ? <Mail /> : <MailOpen />} />
            </li>)}</ul>
          </section>;
        })}
        {!visible.length && <div className="updates-empty" role="status"><CheckCheck /><h2>{tr('moodle:updates_empty')}</h2></div>}
      </div>
      {selected && <article className="update-reader" aria-labelledby="update-subject">
        <Button icon={<ArrowLeft />} label={(tr('moodle:updates'))} variant="ghost" onClick={() => {setSelectedId(undefined);list.current?.querySelector<HTMLButtonElement>(`[data-update-id="${selected.id}"] .update-open`)?.focus();}}>{tr('moodle:updates')}</Button>
        <p className="update-reader-sender">{sender(selected)}</p>
        <h2 id="update-subject" ref={readerHeading} tabIndex={-1}>{selected.subject || tr('moodle:updates')}</h2>
        <time dateTime={selected.createdAt}>{new Date(selected.createdAt).toLocaleString(i18n.resolvedLanguage)}</time>
        <p className="update-body">{plainText(selected.body)}</p>
        {selected.url && <Button endContent={<ArrowUpRight />} label={(tr('moodle:open_moodle'))} variant="secondary" onClick={() => onOpen(selected)}>{tr('moodle:open_moodle')}</Button>}
      </article>}
    </div>
    <p className="updates-shortcuts">{tr('moodle:updates_shortcuts')}</p>
  </section>;
}
