/** Read news forums for courses never opened in the UI, retaining bounded inert offline copies. @packageDocumentation */
import type { MoodleAnnouncement } from '../../shared/moodle-course';
import type { BackendContext } from './backend-context';
import type { BackendServices } from './backend-types';
import { courseForums, forumDiscussions } from './backend-forums';
import { fail, McpBackendError } from './backend-errors';
import { noWarnings, postsWire, timestamp } from './backend-wire';
import { rewriteReferences } from './backend-references';
import { remoteId } from '../moodle/remote-id';
import { sanitizeCourseHtml } from '../moodle/contents';

export async function courseAnnouncements(context: BackendContext, services: BackendServices, courseId: string) {
  const cached = context.course(courseId).announcements;
  const hasCache = context.repository.hasCoursePanelCache(courseId, 'announcements');
  try {
    const forums = (await courseForums(context, services, courseId)).filter(forum => forum.type === 'news' || /公告|最新消息|announcement|news/i.test(context.text(forum.name)));
    if (forums.length > 10) fail('UNSUPPORTED');
    const rows = new Map<string, {id: string; subject: string; author: string; createdAt: string | null; text: string}>();
    for (const forum of forums) {
      for (const [id, discussion] of await forumDiscussions(context, services, forum.id)) {
        let message = discussion.message;
        let author = discussion.userfullname;
        let created = discussion.created ?? discussion.timecreated ?? discussion.timemodified;
        if (message === undefined) {
          const response = await services.remote.call(context, 'mod_forum_get_discussion_posts', {discussionid: String(id), sortby: 'created', sortdirection: 'ASC'}, postsWire);
          noWarnings(response);
          if (response.posts.some(post => post.discussion !== undefined && post.discussion !== id || post.discussionid !== undefined && post.discussionid !== id)) fail('DENIED');
          const root = response.posts.find(post => (post.parentid ?? post.parent) === 0 && !post.isdeleted && !post.isprivatereply);
          if (!root) fail('UNSUPPORTED');
          message = root.message;
          author ??= root.author?.fullname ?? root.userfullname;
          created ??= root.timecreated ?? root.created ?? undefined;
        }
        const key = remoteId(context.account().id, 'announcement', id);
        rows.set(key, {id: key, subject: context.text(discussion.subject ?? discussion.name ?? '', 300), author: context.text(author ?? '', 200), createdAt: timestamp(created), text: context.text(rewriteReferences(context, courseId, message), 6000)});
        if (rows.size > 10_000) fail('UNSUPPORTED');
      }
    }
    context.recheck();
    const result = [...rows.values()].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.id.localeCompare(b.id));
    const announcements: MoodleAnnouncement[] = result.flatMap(row => row.createdAt ? [{id: row.id, subject: row.subject, author: row.author, createdAt: row.createdAt, bodyHtml: sanitizeCourseHtml(row.text) ?? '', url: null}] : []);
    if (announcements.length === result.length) context.repository.saveDetail(courseId, {announcements}, undefined, new Date(services.clock()).toISOString());
    return result;
  } catch (error) {
    if (error instanceof McpBackendError && ['DISCONNECTED', 'SESSION_REQUIRED', 'UNSUPPORTED'].includes(error.code) && hasCache) {
      context.recheck();
      context.provenance.syncedAt = context.repository.detailCache(courseId)?.refreshedAt ?? null;
      return cached.map(row => ({id: row.id, subject: context.text(row.subject, 300), author: context.text(row.author, 200), createdAt: row.createdAt, text: context.text(row.bodyHtml, 6000)}));
    }
    throw error;
  }
}
