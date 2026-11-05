/**
 * Map Moodle course wire data into sanitized, bounded course content.
 * Owned by main/moodle.
 * Credentials and authenticated transports stay in main; renderer results use shared schemas.
 * @packageDocumentation
 */
import { z } from 'zod';
import type { MoodleCourse, MoodleFile } from '../../shared/moodle';
import type { MoodleCompletion, MoodleModuleKind, MoodleSection } from '../../shared/moodle-course';
import { log } from '../logging';
import { issueDiagnostics, responseShape } from './diagnostics';
import { moodleSectionSchema } from '../../shared/moodle-course';
import { identityText } from './identity';
import { remoteId } from './remote-id';

/** Accept absolute HTTPS URLs without credentials and strip token or sesskey query parameters. */
export function safeUrl(value?: string | null): string | null {
  try {
    const parsed = new URL(value ?? '');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    for (const key of [...parsed.searchParams.keys()]) if (/token|sesskey/i.test(key)) parsed.searchParams.delete(key);
    return parsed.href;
  } catch { return null; }
}
/** Remove active content and unsafe links before course HTML crosses the process boundary. */
export function sanitizeCourseHtml(value?: string | null): string | null {
  if (!value) return null;
  const allowed = new Set(['p','br','div','span','strong','b','em','i','u','ul','ol','li','h1','h2','h3','h4','blockquote','pre','code','table','thead','tbody','tr','th','td','hr']);
  return value.replace(/<(script|style|iframe|form|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<\/?([a-z][\w:-]*)\b[^>]*>/gi,(tag, name: string) => allowed.has(name.toLowerCase()) ? `<${tag.startsWith('</') ? '/' : ''}${name.toLowerCase()}>` : '').replace(/<(?!\/?[a-z][\w]*>)/gi,'&lt;');
}
const number = z.union([z.number(),z.string().regex(/^-?\d+(?:\.\d+)?$/)]).transform(Number).pipe(z.number().finite().int());
const visible = z.union([z.boolean(),z.number(),z.string()]).nullish();
const fileWire = z.object({type:z.string(),filename:z.string(),fileurl:z.string().nullish(),filesize:number.pipe(z.number().nonnegative()).nullish(),mimetype:z.string().nullish(),timemodified:number.nullish()}).passthrough();
const moduleWire = z.object({id:number.pipe(z.number().positive()),name:z.string(),modname:z.string().nullish().transform(value => value ?? 'other'),description:z.string().nullish(),url:z.string().nullish(),visible,uservisible:visible,instance:number.nullish(),customdata:z.string().nullish(),contents:z.array(fileWire).nullish(),completiondata:z.object({state:number.nullish(),tracking:number.nullish()}).passthrough().nullish()}).passthrough();
const sectionWire = z.object({id:number.pipe(z.number().positive()),name:z.string().nullish(),section:number.pipe(z.number().nonnegative()).nullish(),summary:z.string().nullish(),visible,uservisible:visible,highlighted:visible,current:visible,component:z.string().nullish(),itemid:number.nullish(),modules:z.array(z.unknown()).nullish()}).passthrough();
/** Validate the complete contents response before mapping any section. */
export function parseContentsWire(raw: unknown[], diagnostic: (issues:z.ZodIssue[],path:(string|number)[],raw:unknown)=>void) {
  return raw.flatMap((row,index) => {
    const section = sectionWire.safeParse(row);
    if (!section.success) { diagnostic(section.error.issues,['sections',index],row); return []; }
    const modules = (section.data.modules ?? []).flatMap((row,moduleIndex) => {
      const module = moduleWire.safeParse(row);
      if (!module.success) { diagnostic(module.error.issues,['sections',index,'modules',moduleIndex],row); return []; }
      return [module.data];
    });
    return [{...section.data,modules}];
  });
}
export const contentsWire = z.array(z.unknown()).transform(raw => parseContentsWire(raw,(issues,path,row) => log({phase:'moodle-call',function:'core_course_get_contents',diagnostic:{kind:'validation',issues:issueDiagnostics(issues,path),shape:responseShape(row)}})));
const isVisible = (value: unknown) => value !== false && value !== 0 && value !== '0';
const isTrue = (value: unknown) => value === true || value === 1 || value === '1';
/** Normalize Moodle completion fields to a stable application state. */
export function completionState(state: number | null | undefined, tracking = 1): MoodleCompletion {
  if (!tracking || state == null) return 'none';
  return ({0:'incomplete',1:'complete',2:'pass',3:'fail'} as const)[state as 0|1|2|3] ?? 'none';
}
/** Map validated contents into normalized sections while preserving locked and hidden states. */
export function parseCourseContents(raw: z.infer<typeof contentsWire>, course: MoodleCourse, now = new Date()) {
  const files: {url:string;value:MoodleFile}[] = [];
  const seen = new Set<number>();
  const numbers = raw.filter(section => (section.section ?? 0) > 0).map(section => section.section!).sort((a,b) => a-b);
  const sequential = numbers.every((number,index) => number === index+1);
  const serverCurrent = raw.some(section => isTrue(section.highlighted) || isTrue(section.current));
  const sections: MoodleSection[] = raw.filter(section => section.id > 0).map((section,index) => {
    const sectionNumber = section.section ?? index;
    const weekStart = course.identity.format === 'weeks' && sequential && course.startAt && sectionNumber > 0 ? new Date(Date.parse(course.startAt) + (sectionNumber - 1) * 7 * 86400000).toISOString() : null;
    return {id:remoteId(course.accountId,'section',`${course.remoteId}:${section.id}`),number:sectionNumber,name:identityText(section.name ?? ''),summaryHtml:sanitizeCourseHtml(section.summary),accessible:isVisible(section.visible) && isVisible(section.uservisible),current:isTrue(section.highlighted) || isTrue(section.current) || Boolean(!serverCurrent && weekStart && now.getTime() >= Date.parse(weekStart) && now.getTime() < Date.parse(weekStart) + 7 * 86400000),weekStart,modules:section.modules.filter(module => module.id > 0 && !seen.has(module.id) && Boolean(seen.add(module.id))).map(module => {
      const attachments = (module.contents ?? []).flatMap(file => {
        const url = safeUrl(file.fileurl);
        return file.type === 'file' && url ? [{url,value:{id:remoteId(course.accountId,'file',`${module.id}:${url}`),courseId:course.id,section:identityText(section.name ?? ''),module:identityText(module.name),name:identityText(file.filename),mime:file.mimetype ?? 'application/octet-stream',size:file.filesize ?? 0,modifiedAt:file.timemodified && file.timemodified > 0 ? new Date(file.timemodified * 1000).toISOString() : null,documentId:null}}] : [];
      });
      files.push(...attachments);
      const known = new Set(['resource','folder','url','page','label','forum','assign','quiz','subsection']);
      const kind: MoodleModuleKind = known.has(module.modname) ? module.modname as MoodleModuleKind : module.modname === 'h5pactivity' ? 'h5p' : /video/.test(module.modname) ? 'video' : 'other';
      return {id:remoteId(course.accountId,'module',module.id),cmid:module.id,kind,modname:module.modname,name:identityText(module.name),descriptionHtml:sanitizeCourseHtml(module.description),url:safeUrl(module.url),accessible:isVisible(module.visible) && isVisible(module.uservisible),completion:completionState(module.completiondata?.state,module.completiondata?.tracking ?? 1),dueAt:null,submitted:null,fileIds:attachments.map(file => file.value.id)};
    })};
  });
  const delegatedIds = new Set<string>();
  for (const parent of sections) {
    if (delegatedIds.has(parent.id)) continue;
    const modules = [...parent.modules];
    for (const module of modules) {
      if (module.kind !== 'subsection') continue;
      const wire = raw.flatMap(section => section.modules).find(row => row.id === module.cmid)!;
      let targetId: number | undefined, targetNumber: number | undefined;
      try {
        const data = z.object({sectionid:z.coerce.number().optional(),section:z.coerce.number().optional()}).parse(JSON.parse(wire.customdata ?? '{}'));
        targetId = data.sectionid; targetNumber = data.section;
      } catch { /* Old subsection plugins expose only the name. */ }
      if (wire.url) {
        try { const parsed = new URL(wire.url); targetId ??= Number(parsed.searchParams.get('sectionid')) || undefined; targetNumber ??= Number(parsed.searchParams.get('section')) || undefined; } catch { /* A malformed module URL cannot identify a subsection. */ }
      }
      const candidates = raw.filter(section => section.id > 0 && !delegatedIds.has(remoteId(course.accountId,'section',`${course.remoteId}:${section.id}`)) && sections.findIndex(row => row.id === remoteId(course.accountId,'section',`${course.remoteId}:${section.id}`)) > sections.indexOf(parent));
      const childWire = candidates.find(section => section.id === targetId) ?? candidates.find(section => targetNumber != null && section.section === targetNumber) ?? candidates.find(section => section.component === 'mod_subsection' && section.itemid === wire.instance) ?? candidates.find(section => identityText(section.name ?? '').toLowerCase() === module.name.toLowerCase());
      const child = childWire && sections.find(row => row.id === remoteId(course.accountId,'section',`${course.remoteId}:${childWire.id}`));
      if (child) { parent.modules.splice(parent.modules.indexOf(module)+1,0,...child.modules.map(module => ({...module,accessible:child.accessible && module.accessible}))); delegatedIds.add(child.id); }
    }
  }
  const merged = sections.filter(section => !delegatedIds.has(section.id));
  const mergedNumbers = merged.filter(section => section.number > 0).map(section => section.number).sort((a,b) => a-b);
  if (!mergedNumbers.every((number,index) => number === index+1)) {
    for (const section of merged) {
      section.weekStart = null;
      if (!serverCurrent) section.current = false;
    }
  }
  return {sections:merged.map(section => moodleSectionSchema.parse(section)),files};
}
