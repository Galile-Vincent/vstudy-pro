/** Read full Moodle page content only by an advertised course API and exact module membership. @packageDocumentation */
import { z } from 'zod';
import type { BackendContext } from './backend-context';
import type { BackendServices } from './backend-types';
import { integer, noWarnings, warnings } from './backend-wire';
import { fail, McpBackendError } from './backend-errors';
import { contentText } from './backend-page';
import { rewriteReferences } from './backend-references';
import { sanitizeCourseHtml } from '../moodle/contents';

export const pagesWire = z.object({pages:z.array(z.object({id:integer, course:integer, coursemodule:integer, content:z.string(), name:z.string().optional()})).max(10_000), warnings:warnings.optional()});

export async function cacheCoursePages(context:BackendContext, services:BackendServices, courseId:string): Promise<Map<string, string>> {
  const course = context.course(courseId).course;
  const response = await services.remote.call(context, 'mod_page_get_pages_by_courses', {'courseids[0]':String(course.remoteId)}, pagesWire);
  noWarnings(response);
  context.recheck();
  const detail = context.course(courseId);
  const contents = new Map<string, string>();
  const sections = detail.sections.map(section => ({...section, modules:section.modules.map(module => {
    if (!section.accessible || !module.accessible || module.kind !== 'page') return module;
    const page = response.pages.find(row => row.course === course.remoteId && row.coursemodule === module.cmid);
    if (!page) return module;
    const text = contentText(rewriteReferences(context, courseId, page.content), 1_000_000);
    contents.set(module.id, text);
    return {...module, descriptionHtml:sanitizeCourseHtml(text)};
  })}));
  context.repository.saveDetail(courseId, {sections}, undefined, new Date(services.clock()).toISOString());
  context.provenance.syncedAt = new Date(services.clock()).toISOString();
  return contents;
}

export async function pageContent(context:BackendContext, services:BackendServices, courseId:string, moduleId:string): Promise<string> {
  const module = context.module(courseId, moduleId);
  if (module.kind !== 'page' || !services.remote.supports(context, 'mod_page_get_pages_by_courses')) return module.descriptionHtml ?? '';
  try {
    const text = (await cacheCoursePages(context, services, courseId)).get(moduleId);
    if (text === undefined) fail('DENIED');
    return text;
  } catch (error) {
    if (error instanceof McpBackendError && ['DISCONNECTED', 'SESSION_REQUIRED'].includes(error.code) && module.descriptionHtml) return module.descriptionHtml;
    throw error;
  }
}
