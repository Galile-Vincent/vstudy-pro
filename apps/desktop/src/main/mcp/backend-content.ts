/** Populate never-opened course panels through advertised, account-scoped read APIs. @packageDocumentation */
import type { BackendContext } from './backend-context';
import type { BackendServices } from './backend-types';
import { contentsWire, parseCourseContents } from '../moodle/contents';

export async function ensureCourseContents(context: BackendContext, services: BackendServices, courseId: string): Promise<void> {
  const course = context.course(courseId).course;
  if (context.repository.detailCache(courseId)) return;
  const response = await services.remote.call(context, 'core_course_get_contents', {courseid: String(course.remoteId)}, contentsWire);
  context.recheck();
  const parsed = parseCourseContents(response, course, new Date(services.clock()));
  context.repository.saveDetail(courseId, {sections: parsed.sections}, parsed.files, new Date(services.clock()).toISOString());
}
