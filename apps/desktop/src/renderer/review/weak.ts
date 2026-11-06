import { useEffect, useState } from 'react';
import type { IpcResponse } from '../../shared/ipc';
import { desktop } from '../bridge';

export type WeakConcept = IpcResponse<'review:courses:mastery'>['items'][number];
const PAGE = 100, MAX_PAGES = 50;

/**
 * Reads every mastery page of a course and keeps the concepts that need review.
 * Mastery pages mix all states, so filtering one page would claim nothing needs review
 * while later pages still hold concepts, and "Review today" would cover only part of them.
 */
export function useWeakConcepts(courseId: string, revision: number) {
  const [attempt, setAttempt] = useState(0);
  const key = `${courseId}:${revision}:${attempt}`;
  const [result, setResult] = useState<{ courseId: string; key: string; items: WeakConcept[]; error: boolean }>({ courseId: '', key: '', items: [], error: false });
  useEffect(() => {
    if (!courseId) return;
    let active = true;
    void (async () => {
      const found: WeakConcept[] = [];
      let cursor: { at: string; id: string } | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const response = await desktop.invoke('review:courses:mastery', { courseId, limit: PAGE, ...(cursor ? { cursor } : {}) });
        found.push(...response.items.filter(item => item.mastery.state === 'needs_review'));
        cursor = response.nextCursor ?? undefined;
        if (!cursor) break;
      }
      if (active) setResult({ courseId, key, items: found, error: false });
    })().catch(() => { if (active) setResult({ courseId, key, items: [], error: true }); });
    return () => { active = false; };
  }, [courseId, revision, attempt]);
  const loading = courseId !== '' && result.key !== key;
  return { items: result.courseId === courseId ? result.items : [], loading, error: !loading && result.error, retry: () => setAttempt(value => value + 1) };
}
