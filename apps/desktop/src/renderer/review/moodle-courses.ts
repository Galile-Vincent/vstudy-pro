import { useEffect, useRef } from 'react';
import { desktop } from '../bridge';

const MAX_COURSES = 50;

/**
 * Give every current Moodle course a study course so chats are sorted from the first day.
 * Main returns the existing study course for a Moodle course already materialized, so this is safe to repeat.
 * Students without a Moodle account have nothing to materialize; they keep the manual path.
 */
export async function materializeActiveMoodleCourses(now = Date.now()): Promise<string[]> {
  let overview;
  try { overview = await desktop.invoke('moodle:overview', {}); }
  catch { return []; }
  const ids: string[] = [];
  for (const course of overview.courses.filter(item => !item.endAt || Date.parse(item.endAt) > now).slice(0, MAX_COURSES)) {
    try { ids.push((await desktop.invoke('review:courses:materialize', { moodleCourseId: course.id })).id); }
    catch { /* One course that cannot be read must not block the others. */ }
  }
  return ids;
}

/** Runs on mount and whenever Moodle finishes a sync. `known` is the study course ids already listed. */
export function useMoodleCourseSync(known: () => ReadonlySet<string>, onNewCourses: () => void) {
  const latest = useRef({ known, onNewCourses });
  latest.current = { known, onNewCourses };
  useEffect(() => {
    let active = true, running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const ids = await materializeActiveMoodleCourses();
        const listed = latest.current.known();
        if (active && ids.some(id => !listed.has(id))) latest.current.onNewCourses();
      } finally { running = false; }
    };
    void run();
    const unsubscribe = desktop.onMoodleProgress?.(event => { if (event.state === 'idle') void run(); });
    return () => { active = false; unsubscribe?.(); };
  }, []);
}
