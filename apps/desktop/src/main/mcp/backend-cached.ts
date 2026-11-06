/** Explicit cache projections exclude grades, submissions, file text and school URLs from content reads. @packageDocumentation */
import { documentIdSchema } from '../../shared/domain';
import type { MoodleCourse } from '../../shared/moodle';
import type { MoodleModule } from '../../shared/moodle-course';
import type { BackendHandlers, BackendServices } from './backend-types';
import { contentText } from './backend-page';
import { fail } from './backend-errors';
import { courseReference, moduleReference, fileReference, rewriteReferences } from './backend-references';
import { pageContent } from './backend-pages';

export const courseMetadata = (course:MoodleCourse) => ({id:course.id, accountId:course.accountId, reference:courseReference(course.accountId, course.id), name:contentText(course.fullName, 300), shortName:contentText(course.shortName, 200), startAt:course.startAt, endAt:course.endAt, lifecycle:course.identity.lifecycle});
export const moduleMetadata = (module:MoodleModule) => ({id:module.id, kind:module.kind, name:contentText(module.name, 300), accessible:module.accessible, dueAt:module.dueAt});

export function cachedHandlers(services:BackendServices): Pick<BackendHandlers, 'list_accounts' | 'list_courses' | 'get_course' | 'get_module' | 'list_deadlines' | 'list_announcements' | 'list_files' | 'read_file' | 'open_in_app'> {
  const {pages} = services;
  return {
    list_accounts:async (context, args) => pages.page(context.repository.accounts().filter(row => context.accountIds.includes(row.id)).map(row => ({id:row.id, school:contentText(row.siteName, 200), user:contentText(row.displayName, 200)})), pages.binding('list_accounts', null, {...args, accountIds:[...context.accountIds].sort()}), args),
    list_courses:async (context, args) => pages.page(context.courses().map(courseMetadata), pages.binding('list_courses', context.accountId, args), args),
    get_course:async (context, args) => {
      const {course, sections} = context.course(args.courseId);
      const items = sections.filter(section => section.accessible).flatMap(section => [
        {type:'section', id:section.id, number:section.number, name:contentText(section.name, 300), text:contentText(rewriteReferences(context, args.courseId, section.summaryHtml ?? ''), 3000)},
        ...section.modules.filter(module => module.accessible).map(module => ({type:'module', sectionId:section.id, reference:moduleReference(context.account().id, args.courseId, module.id), ...moduleMetadata(module)})),
      ]);
      const page = pages.page(items, pages.binding('get_course', context.accountId, args), args);
      return {...page, content:{course:courseMetadata(course), ...page.content}};
    },
    get_module:async (context, args) => {
      const module = context.module(args.courseId, args.moduleId);
      const text = await pageContent(context, services, args.courseId, args.moduleId);
      const page = pages.text(contentText(rewriteReferences(context, args.courseId, text), 1_000_000), pages.binding('get_module', context.accountId, args), args);
      return {...page, content:{module:{...moduleMetadata(module), reference:moduleReference(context.account().id, args.courseId, module.id)}, ...page.content}};
    },
    list_deadlines:async (context, args) => {
      const courses = args.courseId ? [context.course(args.courseId).course] : context.courses();
      const rows = courses.flatMap(course => context.course(course.id).deadlines).filter(row => !row.orphaned).sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id));
      return pages.page(rows.map(row => ({id:row.id, courseId:row.courseId, title:contentText(row.title, 300), kind:row.kind, dueAt:row.dueAt})), pages.binding('list_deadlines', context.accountId, args), args);
    },
    list_announcements:async (context, args) => pages.page(context.course(args.courseId).announcements.map(row => ({id:row.id, subject:contentText(row.subject, 300), author:contentText(row.author, 200), createdAt:row.createdAt, text:contentText(row.bodyHtml, 6000)})), pages.binding('list_announcements', context.accountId, args), args),
    list_files:async (context, args) => {
      const files = context.course(args.courseId).files.filter(file => {
        try { context.file(file.id); return true; } catch { return false; }
      });
      return pages.page(files.map(row => ({id:row.id, courseId:row.courseId, name:contentText(row.name, 300), mime:contentText(row.mime, 100), size:row.size, modifiedAt:row.modifiedAt, converted:row.documentId ? services.options.store.documents.get(documentIdSchema.parse(row.documentId))?.status === 'ready' : false})), pages.binding('list_files', context.accountId, args), args);
    },
    read_file:async (context, args) => {
      const file = context.file(args.fileId).file;
      if (!file.documentId) fail('UNSUPPORTED');
      const id = documentIdSchema.parse(file.documentId);
      const document = services.options.store.documents.get(id);
      if (!document || document.status !== 'ready') fail('UNSUPPORTED');
      const raw = await services.options.documents.read(id);
      context.recheck();
      const current = services.options.store.documents.get(id);
      if (context.file(args.fileId).file.documentId !== id || current?.status !== 'ready' || current.activeVersion !== document.activeVersion) fail('NOT_FOUND');
      const page = pages.text(contentText(rewriteReferences(context, file.courseId, raw), 8 * 1024 * 1024), pages.binding('read_file', context.accountId, args), args);
      return {...page, content:{fileId:file.id, reference:fileReference(context.account().id, file.id), ...page.content}};
    },
    open_in_app:async (context, args) => {
      context.module(args.courseId, args.moduleId);
      context.recheck();
      await services.options.openModule(context.account().id, args.courseId, args.moduleId);
      return {content:{opened:true, courseId:args.courseId, moduleId:args.moduleId}};
    },
  };
}
