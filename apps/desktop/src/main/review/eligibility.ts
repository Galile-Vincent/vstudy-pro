/** Shared provenance policy for reads and worker claim/commit fences. @packageDocumentation */
interface SourcePart {type:string;text?:string;status?:string;error?:string;contextExcluded?:boolean}
interface SourceMessage {id:string;conversationId:string;role:string;supersededBy:string|null;parts:readonly SourcePart[]}
export interface EligibleSource {
  conversation:{id:string;deletedAt:string|null;documentId:string|null};
  document:{id:string;deletedAt:string|null}|null;
  user:SourceMessage;assistant:SourceMessage;
  link:{courseId:string|null;revision:number;excludeFromMemory:boolean;confirmed:boolean;confidence:number};
  courseId:string|null;assignmentRevision:number;
}
function active(message:SourceMessage):boolean {
  return message.supersededBy===null && !message.parts.some(part=>part.contextExcluded===true);
}
export function isEligibleSource(source:EligibleSource):boolean {
  const {conversation:c,document:d,user:u,assistant:a,link:l} = source;
  return c.deletedAt===null && (c.documentId===null || (d?.id===c.documentId && d.deletedAt===null)) &&
    u.conversationId===c.id && a.conversationId===c.id && u.role==='user' && a.role==='assistant' &&
    active(u) && active(a) && a.parts.some(p=>p.type==='text' && !!p.text?.trim()) &&
    a.parts.every(p=>p.status===undefined || p.status==='complete') && !a.parts.some(p=>p.error!==undefined) &&
    !l.excludeFromMemory && l.courseId!==null && l.courseId===source.courseId &&
    l.revision===source.assignmentRevision;
}
/** Join aliases: j job, c conversation, d optional document, u user, a assistant, l chat link.
 * Legacy successful messages have no status; explicit error/aborted parts always fail.
 */
export const eligibleSourceSql = `
 c.deletedAt IS NULL AND (c.documentId IS NULL OR (d.id=c.documentId AND d.deletedAt IS NULL))
 AND u.conversationId=c.id AND a.conversationId=c.id AND u.role='user' AND a.role='assistant'
 AND u.supersededBy IS NULL AND a.supersededBy IS NULL
 AND NOT EXISTS(SELECT 1 FROM json_each(u.parts) p WHERE json_extract(p.value,'$.contextExcluded')=1)
 AND NOT EXISTS(SELECT 1 FROM json_each(a.parts) p WHERE json_extract(p.value,'$.contextExcluded')=1)
 AND EXISTS(SELECT 1 FROM json_each(a.parts) p WHERE json_extract(p.value,'$.type')='text' AND length(trim(json_extract(p.value,'$.text'),char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)))>0)
 AND NOT EXISTS(SELECT 1 FROM json_each(a.parts) p WHERE
   (json_extract(p.value,'$.status') IS NOT NULL AND json_extract(p.value,'$.status')!='complete')
   OR json_type(p.value,'$.error') IS NOT NULL)
 AND l.excludeFromMemory=0 AND l.courseId IS NOT NULL AND l.courseId=j.courseId
 AND l.revision=j.assignmentRevision
`;
