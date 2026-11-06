import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { ReviewRepository } from './repository';
import { eligibleSourceSql, eligibleExchangeSql } from './eligibility';
import { classify } from './classify';
import { conceptKey } from './concept-match';
import { buildThreadSnapshot } from './thread-snapshot';
import { buildEpisodes } from './episodes';
import type { guardExtraction } from './extract-schema';
export const EXTRACTOR_VERSION='memory-v1';
export const MEMORY_QUEUE_LIMIT=100;
export type MemoryResult=ReturnType<typeof guardExtraction>;
export interface MemoryJob {id:string;attemptToken:string;assistantMessageId:string;conversationId:string;courseId:string|null;assignmentRevision:number}
const joins=`JOIN conversations c ON c.id=j.conversationId JOIN messages u ON u.id=j.userMessageId JOIN messages a ON a.id=j.assistantMessageId LEFT JOIN documents d ON d.id=c.documentId LEFT JOIN study_chat_links l ON l.conversationId=c.id`;
export class MemoryRepository {
 readonly review:ReviewRepository;
 constructor(readonly db:DatabaseSync,private readonly clock=Date.now){this.review=new ReviewRepository(db,clock);}
 private now(){return new Date(this.clock()).toISOString();}
 private atomic<T>(fn:()=>T):T {this.db.exec('SAVEPOINT memory_write');try{const value=fn();if(value===false)this.db.exec('ROLLBACK TO memory_write');this.db.exec('RELEASE memory_write');return value;}catch(error){this.db.exec('ROLLBACK TO memory_write; RELEASE memory_write');throw error;}}
 enqueue(assistantId:string):void {
  if(!this.review.getPrefs().memoryEnabled)return;
  if(Number(this.db.prepare("SELECT count(*) n FROM study_jobs WHERE status IN ('pending','running')").get()!.n)>=MEMORY_QUEUE_LIMIT)return;
  this.db.prepare(`INSERT INTO study_jobs(id,conversationId,userMessageId,assistantMessageId,extractorVersion,status,courseId,assignmentRevision,occurredAt,createdAt,updatedAt)
   SELECT ?,a.conversationId,u.id,a.id,?,'pending',l.courseId,coalesce(l.revision,0),u.createdAt,?,? FROM messages a JOIN messages u ON u.id=a.parentMessageId JOIN conversations c ON c.id=a.conversationId LEFT JOIN study_chat_links l ON l.conversationId=c.id LEFT JOIN documents d ON d.id=c.documentId
   WHERE a.id=? AND (${eligibleExchangeSql}) AND a.role='assistant' AND u.role='user' AND u.conversationId=c.id AND a.supersededBy IS NULL AND u.supersededBy IS NULL AND c.deletedAt IS NULL AND coalesce(l.excludeFromMemory,0)=0
   AND EXISTS(SELECT 1 FROM json_each(a.parts) WHERE json_extract(value,'$.type')='text' AND length(trim(json_extract(value,'$.text')))>0)
   AND NOT EXISTS(SELECT 1 FROM json_each(a.parts) WHERE (json_extract(value,'$.status') IS NOT NULL AND json_extract(value,'$.status')!='complete') OR json_type(value,'$.error') IS NOT NULL)
   ON CONFLICT(assistantMessageId,extractorVersion) DO NOTHING`).run(randomUUID(),EXTRACTOR_VERSION,this.now(),this.now(),assistantId);
 }
 recover():void {
  this.db.prepare("UPDATE study_jobs SET status=CASE WHEN attempts<3 THEN 'pending' ELSE 'failed' END,attemptToken=NULL,errorCode='interrupted',updatedAt=? WHERE status='running'").run(this.now());
  if(!this.review.getPrefs().memoryEnabled)return;
  // Recovery is deliberately recent and bounded; it never initiates calls itself.
  const rows=this.db.prepare(`SELECT a.id FROM messages a JOIN conversations c ON c.id=a.conversationId WHERE a.role='assistant' AND a.parentMessageId IS NOT NULL AND c.deletedAt IS NULL AND a.createdAt>=? AND NOT EXISTS(SELECT 1 FROM study_jobs j WHERE j.assistantMessageId=a.id AND j.extractorVersion=?) ORDER BY a.createdAt DESC,a.id DESC LIMIT 100`).all(new Date(this.clock()-7*86400000).toISOString(),EXTRACTOR_VERSION);
  for(const row of rows)this.enqueue(String(row.id));
 }
 exchangeContext(job:MemoryJob){
  const source=this.db.prepare('SELECT j.occurredAt,a.createdAt,c.providerId,c.modelId FROM study_jobs j JOIN messages a ON a.id=j.assistantMessageId JOIN conversations c ON c.id=j.conversationId WHERE j.id=?').get(job.id);
  if(!source)throw new Error('Source unavailable');
  return {startedAt:String(source.occurredAt),endedAt:String(source.createdAt),providerId:source.providerId,modelId:String(source.modelId)};
 }
 candidates(){return this.review.listCourses({limit:100}).items;}
 claim():MemoryJob|null {
  if(!this.review.getPrefs().memoryEnabled)return null;
  return this.atomic(()=>{
   const rows=this.db.prepare("SELECT * FROM study_jobs WHERE status='pending' AND errorCode IS NOT 'budget' AND attempts<3 ORDER BY createdAt,id LIMIT 100").all();
   for(const row of rows){
    if(!this.db.prepare(`SELECT j.id FROM study_jobs j ${joins} WHERE j.id=? AND (${eligibleExchangeSql}) AND coalesce(l.excludeFromMemory,0)=0 AND coalesce(l.revision,0)=j.assignmentRevision`).get(String(row.id))){this.db.prepare("UPDATE study_jobs SET status='cancelled',errorCode='ineligible',updatedAt=? WHERE id=?").run(this.now(),String(row.id));continue;}
    const token=randomUUID();this.db.prepare("UPDATE study_jobs SET status='running',attemptToken=?,attempts=attempts+1,updatedAt=? WHERE id=? AND status='pending'").run(token,this.now(),String(row.id));
    return {id:String(row.id),attemptToken:token,assistantMessageId:String(row.assistantMessageId),conversationId:String(row.conversationId),courseId:row.courseId as string|null,assignmentRevision:Number(row.assignmentRevision)};
   }
   return null;
  });
 }
 classify(job:MemoryJob,text:string,modelSuggestion?:{courseId:string|null;confidence:number}) {
  const c=this.db.prepare('SELECT * FROM conversations WHERE id=?').get(job.conversationId);if(!c)return null;
  const link=this.db.prepare('SELECT * FROM study_chat_links WHERE conversationId=?').get(job.conversationId);
  const courses=this.candidates();
  return classify({courses,text,scopeCourseId:link?.courseId as string|null ?? (c.courseId ? courses.find(x=>x.moodleCourseId===c.courseId)?.id??null:null),documentCourseIds:c.documentId?this.db.prepare('SELECT courseId FROM study_course_documents WHERE documentId=? LIMIT 100').all(String(c.documentId)).map(x=>String(x.courseId)):[],...(link?.method==='manual'?{manualOverride:{courseId:link.courseId as string|null}}:{}),...(modelSuggestion?{modelSuggestion}: {})});
 }
 commit(id:string,token:string,result:MemoryResult):boolean {
  return this.atomic(()=>{
   if(!this.review.getPrefs().memoryEnabled)return false;
   const job=this.db.prepare("SELECT * FROM study_jobs WHERE id=? AND attemptToken=? AND status='running'").get(id,token);if(!job)return false;
   const jobView={...job,id,attemptToken:token,conversationId:String(job.conversationId),assistantMessageId:String(job.assistantMessageId),courseId:job.courseId as string|null,assignmentRevision:Number(job.assignmentRevision)};
   const choice=this.classify(jobView,buildThreadSnapshot(this.db,jobView.assistantMessageId).messages.filter(m=>m.role==='user').map(m=>m.text).join('\n'),{courseId:result.courseId,confidence:result.confidence});
   const link=this.db.prepare('SELECT * FROM study_chat_links WHERE conversationId=?').get(String(job.conversationId));
   if((Number(link?.revision??0)!==Number(job.assignmentRevision)) || link?.excludeFromMemory===1)return false;
   const courseId=link?.courseId as string|null ?? choice?.courseId ?? null;
   if(!link && courseId)this.db.prepare('INSERT INTO study_chat_links(conversationId,courseId,method,confidence,confirmed,excludeFromMemory,revision,updatedAt) VALUES(?,?,?,?,?,0,0,?)').run(String(job.conversationId),courseId,choice?.method??'model',choice?.confidence??0,Number(choice?.confirmed??false),this.now());
   this.db.prepare('UPDATE study_jobs SET courseId=? WHERE id=? AND attemptToken=?').run(courseId,id,token);
   const eligibility=courseId===null?`${eligibleExchangeSql} AND coalesce(l.excludeFromMemory,0)=0 AND coalesce(l.revision,0)=j.assignmentRevision`:eligibleSourceSql;
   if(!this.db.prepare(`SELECT j.id FROM study_jobs j ${joins} WHERE j.id=? AND (${eligibility})`).get(id))return false;
   const seen=new Set<string>();
   for(const observation of result.observations){
    if(result.courseId!==courseId)continue;
    const key=observation.conceptKey??observation.proposedLabel!;if(seen.has(key))continue;seen.add(key);
    this.db.prepare(`INSERT INTO study_observations(id,jobId,courseId,unitId,conceptKey,proposedLabel,errorType,signal,evidenceQuote,evidenceKind,weaknessNote,confidence,resolved,wrongAttempt,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(),id,courseId,observation.unitId,observation.conceptKey,observation.proposedLabel,observation.errorType,observation.signal,observation.evidenceQuote,observation.evidenceKind,observation.weaknessNote,observation.confidence,Number(observation.resolved),Number(observation.wrongAttempt),this.now());
   }
   this.db.prepare("UPDATE study_jobs SET status='succeeded',questionSummary=?,attemptToken=NULL,errorCode=NULL,updatedAt=? WHERE id=? AND attemptToken=?").run(result.questionSummary,this.now(),id,token);
   if(courseId)this.promote(courseId);return true;
  });
 }
 private promote(courseId:string){
  const rows=this.db.prepare(`SELECT o.proposedLabel,j.occurredAt FROM study_observations o JOIN study_jobs j ON j.id=o.jobId ${joins} WHERE o.courseId=? AND o.proposedLabel IS NOT NULL AND (${eligibleSourceSql}) ORDER BY j.occurredAt DESC LIMIT 200`).all(courseId);
  const groups=new Map<string,{label:string;times:{id:string;occurredAt:string}[]}>();for(const row of rows){const key=conceptKey(String(row.proposedLabel));const group=groups.get(key)??{label:String(row.proposedLabel),times:[]};group.times.push({id:randomUUID(),occurredAt:String(row.occurredAt)});groups.set(key,group);}
  for(const [key,group] of groups)if(buildEpisodes(group.times,this.review.getPrefs().timeZone).length>=2){this.db.prepare("INSERT INTO study_concepts(id,courseId,key,label,source,userState,createdAt) VALUES(?,?,?,?,'promoted','none',?) ON CONFLICT DO NOTHING").run(randomUUID(),courseId,key,group.label,this.now());this.db.prepare('UPDATE OR IGNORE study_observations SET conceptKey=?,proposedLabel=NULL WHERE courseId=? AND proposedLabel=?').run(key,courseId,group.label);}
 }
 settle(job:MemoryJob,errorCode:string):void {this.db.prepare("UPDATE study_jobs SET status=?,errorCode=?,attemptToken=NULL,updatedAt=? WHERE id=? AND attemptToken=? AND status='running'").run(errorCode==='budget'||errorCode==='interrupted'?'pending':'failed',errorCode,this.now(),job.id,job.attemptToken);}
 retry(id:string):void {if(!this.review.getPrefs().memoryEnabled)throw new Error('Study memory disabled');if(Number(this.db.prepare("SELECT count(*) n FROM study_jobs WHERE status IN ('pending','running')").get()!.n)>=MEMORY_QUEUE_LIMIT)throw new Error('Study queue full');this.db.prepare("UPDATE study_jobs SET status='pending',attemptToken=NULL,attempts=0,errorCode=NULL,updatedAt=? WHERE id=? AND status IN ('failed','pending')").run(this.now(),id);}
}
