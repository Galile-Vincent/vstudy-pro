export const COURSE_VIEW_MODES = ['list', 'cards'] as const;
export type CourseViewMode = (typeof COURSE_VIEW_MODES)[number];

export const COURSE_VIEW_STORAGE_KEY = 'vstudy.courses.view';

export function parseCourseViewMode(raw: unknown): CourseViewMode {
  return COURSE_VIEW_MODES.find(mode => mode === raw) ?? 'list';
}

export function loadCourseViewMode(): CourseViewMode {
  try {
    return parseCourseViewMode(localStorage.getItem(COURSE_VIEW_STORAGE_KEY));
  } catch {
    return 'list';
  }
}

export function saveCourseViewMode(mode: CourseViewMode): void {
  try {
    localStorage.setItem(COURSE_VIEW_STORAGE_KEY, mode);
  } catch {
    return;
  }
}
