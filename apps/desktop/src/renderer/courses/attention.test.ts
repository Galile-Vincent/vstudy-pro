import { expect, it } from 'vitest';
import { courseAttention } from './attention';
import { createMockMoodleApi } from '../dev-mock';

it('counts only this course, excludes submitted and orphaned work, and limits the next deadline to seven days', async () => {
  const overview = await createMockMoodleApi().overview();
  const course = overview.courses[0]!;
  const template = overview.upcoming[0]!;
  const now = Date.parse('2026-11-06T04:00:00Z');
  const deadline = (id: string, days: number, extra = {}) => ({...template,id,courseId:course.id,dueAt:new Date(now+days*86400000).toISOString(),submitted:false,...extra});
  const deadlines = [deadline('overdue',-1),deadline('submitted',-1,{submitted:true}),deadline('orphaned',-1,{orphaned:true}),deadline('another',-1,{courseId:'another'}),deadline('next',1),deadline('later',8)];
  const notifications = overview.summaries!.flatMap(summary => summary.notifications);
  const attention = courseAttention(course.id,deadlines,notifications,now);
  expect(attention.overdue).toBe(1);
  expect(attention.latestOverdueAt).toBe(now-86400000);
  expect(attention.unread).toBe(notifications.filter(item => item.courseId===course.id && !item.read).length);
  expect(attention.next?.id).toBe('next');
  expect(courseAttention(course.id,[deadline('later',8)],[],now)).toEqual({overdue:0,unread:0,next:undefined,latestOverdueAt:null});
});
