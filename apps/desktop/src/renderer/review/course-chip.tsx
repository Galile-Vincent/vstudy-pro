import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IpcResponse } from '../../shared';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';

type Course = IpcResponse<'review:courses:list'>['items'][number];
type Cursor = NonNullable<IpcResponse<'review:courses:list'>['nextCursor']>;

export function CourseChip({ conversationId }: { conversationId: string }) {
  useTranslation();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string | null>();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [excluded, setExcluded] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setCourseId(undefined); setError(false); setExcluded(false); setOpen(false);
    async function load() {
      const all: Course[] = [];
      let cursor: Cursor | undefined;
      do {
        const page = await desktop.invoke('review:courses:list', { includeArchived: true, limit: 50, ...(cursor ? { cursor } : {}) });
        if (!active) return;
        all.push(...page.items); cursor = page.nextCursor ?? undefined;
      } while (cursor);
      const link = await desktop.invoke('review:chat:link-get', { conversationId });
      if (!active) return;
      setCourses(all); setCourseId(link?.courseId ?? null); setExcluded(link?.excludeFromMemory ?? false);
    }
    void load().catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [conversationId, revision]);
  async function assign(next: string) {
    setBusy(true); setError(false);
    try {
      const link = await desktop.invoke('review:chat:assign', { conversationId, courseId: next || null });
      setCourseId(link.courseId);
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  async function exclude() {
    setBusy(true); setError(false);
    try { await desktop.invoke('review:chat:exclude', { conversationId, excluded: true }); setExcluded(true); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  const label = courseId === null ? tr('review:unsorted') : courses.find(course => course.id === courseId)?.title ?? tr('review:course_picker');
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" size="sm" variant="ghost" data-testid="chat-course-chip">{label}</Button></PopoverTrigger>
    <PopoverContent align="start">
      <label>{tr('review:course_picker')}<select aria-label={tr('review:course_picker')} value={courseId ?? ''} disabled={busy} onChange={event => void assign(event.target.value)}>
        <option value="">{tr('review:unsorted')}</option>
        {courses.filter(course => !course.archivedAt || course.id === courseId).map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
      </select></label>
      <Button type="button" variant="ghost" disabled={busy || excluded} onClick={() => void exclude()}>{tr('review:exclude_chat')}</Button>
      {excluded && <p role="status">{tr('review:chat_excluded')}</p>}
      {error && <div role="alert"><p>{tr('review:error')}</p><Button onClick={() => setRevision(value => value + 1)}>{tr('review:retry')}</Button></div>}
    </PopoverContent>
  </Popover>;
}
