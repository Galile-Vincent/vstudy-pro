import type { MoodleAccount, MoodleCourseDetail, MoodleOverview, MoodleReminder, MoodleSchool } from '../../shared/moodle';
import { createMockMoodleApi } from '../dev-mock';

export interface MoodleApi {
  schools(): Promise<MoodleSchool[]>;
  connect(schoolId: string): Promise<MoodleAccount>;
  disconnect(accountId: string): Promise<void>;
  overview(): Promise<MoodleOverview>;
  sync(accountId?: string): Promise<void>;
  course(courseId: string): Promise<MoodleCourseDetail>;
  openFile(fileId: string): Promise<{ documentId: string }>;
  markRead(notificationId: string): Promise<void>;
  createReminder(input: { deadlineId: string; remindAt: string; note: string }): Promise<MoodleReminder>;
  deleteReminder(id: string): Promise<void>;
  exportCalendar(deadlineIds: string[]): Promise<void>;
}

const mock = createMockMoodleApi();
const methods: (keyof MoodleApi)[] = ['schools', 'connect', 'disconnect', 'overview', 'sync', 'course', 'openFile', 'markRead', 'createReminder', 'deleteReminder', 'exportCalendar'];
export function useMoodleApi(): MoodleApi {
  const bridge = (window as Window & { vstudy?: { moodle?: MoodleApi } }).vstudy?.moodle;
  return bridge && methods.every(method => typeof bridge[method] === 'function') ? bridge : mock;
}
