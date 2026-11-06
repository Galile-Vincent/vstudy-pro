export type CourseSort = 'smart' | 'name';
export type CourseSortPreferences = Partial<Record<'current' | 'future' | 'past' | 'all', CourseSort>>;
export interface CourseOrderItem {
  id: string;
  name: string;
  term: string | null;
  pinned: boolean;
  nextDueAt: number | null;
  latestOverdueAt: number | null;
  overdueCount: number;
  unreadCount: number;
}

export function orderCourses<T extends CourseOrderItem>(courses: readonly T[], {now, locale, sort = 'smart', groupPins = true, groupTerms = false}: {
  now: number;
  locale: string;
  sort?: CourseSort;
  groupPins?: boolean;
  groupTerms?: boolean;
}): T[] {
  const compare = new Intl.Collator(locale, {numeric:true, sensitivity:'base'}).compare;
  const tier = (course: T) => course.nextDueAt !== null && course.nextDueAt >= now && course.nextDueAt <= now + 7 * 86400000 ? 0 : course.overdueCount > 0 ? 1 : course.unreadCount > 0 ? 2 : 3;
  return [...courses].sort((a,b) => {
    if (groupPins && a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === 'name' && groupTerms && a.term !== b.term) {
      const term = compare(b.term ?? '',a.term ?? '');
      if (term) return term;
    }
    if (sort === 'smart') {
      const aTier = tier(a), bTier = tier(b);
      if (aTier !== bTier) return aTier - bTier;
      const rank = aTier === 0 ? a.nextDueAt! - b.nextDueAt! : aTier === 1 ? (b.latestOverdueAt ?? Number.MIN_SAFE_INTEGER) - (a.latestOverdueAt ?? Number.MIN_SAFE_INTEGER) : aTier === 2 ? b.unreadCount - a.unreadCount : 0;
      if (rank) return rank;
    }
    return compare(a.name,b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
