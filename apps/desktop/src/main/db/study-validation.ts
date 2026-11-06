/** Side-effect-free payload checks for staged backups, including historical study rows. */
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { isStudyAnswer, studyScopeSchema, studyResolvedScopeSchema, studyTestSchema, studyAnswersSchema, type StudyTest } from '../../shared/review-artifacts';
import { studyCourseSchema, studyUnitSchema, studyConceptSchema, studyChatLinkSchema, studyPrefsSchema } from '../../shared/review';

const id=z.string().uuid(), at=z.string().datetime(), text=z.string().min(1).max(240), bit=z.union([z.literal(0),z.literal(1)]);
const nullableText=z.string().max(240).nullable();
const confidence=z.number().min(0).max(1);
const json=(value:unknown,maximum:number):unknown=>{if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>maximum)throw new Error('storage.invalid_backup');return JSON.parse(value);};
const jobSchema=z.object({id,conversationId:id,userMessageId:id,assistantMessageId:id,extractorVersion:z.string().min(1).max(120),status:z.enum(['pending','running','succeeded','failed','cancelled','skipped']),attemptToken:text.nullable(),attempts:z.number().int().nonnegative(),courseId:id.nullable(),assignmentRevision:z.number().int().nonnegative(),questionSummary:nullableText,occurredAt:at,errorCode:z.string().max(120).nullable(),createdAt:at,updatedAt:at}).strict();
const observationSchema=z.object({id,jobId:id,courseId:id,unitId:id.nullable(),conceptKey:text.nullable(),proposedLabel:text.nullable(),errorType:z.enum(['none','slip','mistake','misconception','gap']),signal:z.enum(['asked','confused','wrong','gave_up','resolved']),evidenceQuote:z.string().max(240),evidenceKind:z.enum(['quote','paraphrase']),weaknessNote:nullableText,confidence,wrongAttempt:bit,dismissed:bit,resolved:bit,createdAt:at}).strict().refine(row=>(row.conceptKey!==null)!==(row.proposedLabel!==null));
const artifactSchema=z.object({id,courseId:id,kind:z.enum(['note','test']),title:text,scopeJson:z.string(),resolvedScopeJson:z.string(),status:z.enum(['generating','ready','failed','interrupted']),idempotencyKey:text,attemptToken:text,bodyMarkdown:z.string().max(262144).nullable(),testJson:z.string().nullable(),providerId:text,modelId:text,promptVersion:text,errorCode:z.string().max(120).nullable(),createdAt:at}).strict().refine(row=>row.status==='ready'?(row.kind==='note'?row.bodyMarkdown!==null&&row.testJson===null:row.testJson!==null&&row.bodyMarkdown===null):row.bodyMarkdown===null&&row.testJson===null);
const attemptSchema=z.object({id,artifactId:id,phase:z.enum(['answering','committed','graded','confirmed']),answersJson:z.string(),startedAt:at,committedAt:at.nullable(),confirmedAt:at.nullable()}).strict().refine(row=>row.phase==='answering'?row.committedAt===null&&row.confirmedAt===null:row.committedAt!==null&&(row.phase==='confirmed'?row.confirmedAt!==null:row.confirmedAt===null));

/** Throws before a staged restore is published. Reads only; never creates services or recovers jobs. */
export function validateStudyData(db:DatabaseSync):void {
 try {
  const check=(table:string,validate:(row:Record<string,unknown>)=>unknown)=>{for(const row of db.prepare(`SELECT * FROM ${table}`).iterate())validate(row);};
  check('study_courses',row=>studyCourseSchema.parse({...row,aliases:json(row.aliases,8192)}));
  check('study_units',row=>studyUnitSchema.parse(row));
  check('study_concepts',row=>studyConceptSchema.parse(row));
  check('study_course_documents',row=>z.object({courseId:id,documentId:id,attachedAt:at}).strict().parse(row));
  check('study_document_units',row=>z.object({courseId:id,documentId:id,unitId:id}).strict().parse(row));
  check('study_chat_links',row=>{bit.parse(row.confirmed);bit.parse(row.excludeFromMemory);studyChatLinkSchema.parse({...row,confirmed:row.confirmed===1,excludeFromMemory:row.excludeFromMemory===1});});
  check('study_jobs',row=>jobSchema.parse(row));
  check('study_observations',row=>observationSchema.parse(row));
  check('study_concept_events',row=>z.object({id,conceptId:id,kind:z.enum(['understood','restored']),at}).strict().parse(row));
  const tests=new Map<string,StudyTest>();
  const courseMember=(table:'study_units'|'study_concepts',column:'id'|'key',value:string,courseId:string)=>{
   if(!db.prepare(`SELECT 1 FROM ${table} WHERE ${column}=? AND courseId=?`).get(value,courseId))throw new Error('invalid course ownership');
  };
  const documentMember=(documentId:string,courseId:string)=>{if(!db.prepare('SELECT 1 FROM study_course_documents WHERE documentId=? AND courseId=?').get(documentId,courseId))throw new Error('invalid document membership');};
  check('study_artifacts',row=>{
   const artifact=artifactSchema.parse(row); const scope=studyScopeSchema.parse(json(artifact.scopeJson,8192));
   const resolved=studyResolvedScopeSchema.parse(json(artifact.resolvedScopeJson,65536));
   // Ready artifacts retain immutable source snapshots after unlink or deletion.
   // Existing units still have to belong to this course; retries must resolve live sources anew.
   for(const unitId of [...resolved.unitIds,...(scope.kind==='units'?scope.unitIds:[])]){
    const historical=artifact.status==='ready'&&resolved.unitIds.includes(unitId)&&!db.prepare('SELECT 1 FROM study_units WHERE id=?').get(unitId);
    if(!historical)courseMember('study_units','id',unitId,artifact.courseId);
   }
   for(const key of [...resolved.conceptKeys,...(scope.kind==='concepts'?scope.conceptKeys:[])])courseMember('study_concepts','key',key,artifact.courseId);
   for(const documentId of [...resolved.documentIds,...(scope.kind==='documents'?scope.documentIds:[])]){
    const historical=artifact.status==='ready'&&resolved.sources.some(source=>source.documentId===documentId);
    if(!historical)documentMember(documentId,artifact.courseId);
   }
   for(const source of resolved.sources)if(!resolved.documentIds.includes(source.documentId))throw new Error('unresolved source');
   if(scope.kind==='dates'){
    if(scope.fromDate>=scope.toDate||Date.parse(scope.toDate)-Date.parse(scope.fromDate)>366*86400000)throw new Error('invalid dates');
    new Intl.DateTimeFormat('en',{timeZone:scope.timeZone});
   }
   if(artifact.testJson!==null){
    const test=studyTestSchema.parse(json(artifact.testJson,262144));tests.set(artifact.id,test);
    for(const item of test.items){
     courseMember('study_concepts','key',item.conceptKey,artifact.courseId);
     if(!resolved.sources.some(source=>source.documentId===item.source.documentId&&source.version===item.source.version&&source.excerptHash===item.source.excerptHash))throw new Error('invalid item source');
    }
   }
  });
  check('study_attempts',row=>{
   const attempt=attemptSchema.parse(row),answers=studyAnswersSchema.parse(json(attempt.answersJson,65536)),test=tests.get(attempt.artifactId);
   if(!test)throw new Error('invalid attempt artifact');
   if(attempt.committedAt!==null&&attempt.committedAt<attempt.startedAt||attempt.confirmedAt!==null&&attempt.confirmedAt<attempt.committedAt!)throw new Error('invalid attempt chronology');
   for(const [itemId,answer]of Object.entries(answers)){
    const item=test.items.find(item=>item.id===itemId);if(!item)throw new Error('invalid answer item');
    if(!isStudyAnswer(item,answer))throw new Error('invalid answer type');
   }
   for(const raw of db.prepare('SELECT * FROM study_attempt_items WHERE attemptId=?').all(attempt.id)){
    const item=test.items.find(item=>item.id===raw.itemId);
    if(!item||item.conceptKey!==raw.conceptKey||raw.appliedAt!==null&&attempt.phase!=='confirmed')throw new Error('invalid attempt item');
    if(raw.appliedAt!==null&&String(raw.appliedAt)<attempt.confirmedAt!)throw new Error('invalid application chronology');
   }
  });
  check('study_attempt_items',row=>z.object({attemptId:id,itemId:text,conceptKey:text,correct:bit.nullable(),selfGrade:z.enum(['correct','partial','incorrect']).nullable(),appliedAt:at.nullable(),reportedBad:bit}).strict().parse(row));
  const prefs=db.prepare("SELECT value FROM settings WHERE key='studyPrefs'").get();if(prefs)studyPrefsSchema.parse(json(prefs.value,8192));
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('invalid references');
  if(db.prepare(`SELECT j.id FROM study_jobs j JOIN messages u ON u.id=j.userMessageId JOIN messages a ON a.id=j.assistantMessageId WHERE u.role!='user' OR a.role!='assistant' OR u.conversationId!=j.conversationId OR a.conversationId!=j.conversationId LIMIT 1`).get())throw new Error('invalid sources');
  if(db.prepare(`SELECT a.id FROM study_attempts a JOIN study_artifacts f ON f.id=a.artifactId WHERE f.kind!='test' OR f.status!='ready' LIMIT 1`).get())throw new Error('invalid attempt artifact');
 } catch {throw new Error('storage.invalid_backup');}
}
