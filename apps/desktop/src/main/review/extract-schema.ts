import { z } from 'zod';
import { matchConcept } from './concept-match';
const short = z.string().trim().max(140);
const id = z.string().min(1).max(240);
const confidence = z.number().finite().min(0).max(1);
export const extractionSchema = z.object({
  schema_version: z.literal(1), exchange_id: z.string().uuid(), chat_id: z.string().uuid(),
  ts_start: z.string().datetime(), ts_end: z.string().datetime(),
  course: z.object({course_id:id.nullable(),confidence,source:z.enum(['attached','keyword','llm','user'])}).strict(),
  summary:z.object({asked:short,outcome:short}).strict(),
  question_type:z.enum(['definition','factual','procedural','conceptual_why','application','debug','exam_strategy','logistics','other']),
  concepts:z.array(z.object({
    concept_id:id.nullable(),label:z.string().trim().min(1).max(240),unit_id:id.nullable(),
    evidence:z.string().trim().max(120),
    difficulty_signal:z.enum(['none','asked_clarification','wrong_attempt','repeated_wrong','gave_up','asked_again']),
    error_type:z.enum(['none','slip','mistake','misconception','knowledge_gap','unknown']),
    misconception_text:z.string().max(240).nullable(),confidence,wrong_attempt:z.boolean().optional(),
  }).strict()).max(12),
  resolved:z.enum(['yes','partly','no','unknown']),help_level_used:z.number().int().min(0).max(4),
  student_wanted_direct:z.boolean(),tutor_mode:z.enum(['normal','socratic']),
  affect_flag:z.enum(['none','frustrated','bored','confused']),exclude_from_memory:z.boolean(),
}).strict();
export type ExtractionResult = z.infer<typeof extractionSchema>;
export interface ExtractionMessage {role:'user'|'assistant';text:string;id?:string;threadId?:string;step?:number}
export interface ExtractionConcept {id:string;courseId:string;key:string;label:string;unitId?:string|null}
export interface ExtractionContext {
  messages:readonly ExtractionMessage[];
  courses:readonly {id:string}[];
  units:readonly {id:string;courseId:string}[];
  concepts:readonly ExtractionConcept[];
}
export interface GuardedObservation {
  unitId:string|null;conceptKey:string|null;proposedLabel:string|null;
  errorType:'none'|'slip'|'mistake'|'misconception'|'gap';signal:'asked'|'confused'|'wrong'|'gave_up'|'resolved';
  evidenceQuote:string;evidenceKind:'quote'|'paraphrase';weaknessNote:string|null;
  confidence:number;resolved:boolean;wrongAttempt:boolean;
}
export interface GuardedExtraction {courseId:string|null;confidence:number;questionSummary:string;observations:GuardedObservation[]}
const normalizeEvidence = (value:string) => value.normalize('NFKC').replace(/\s+/gu,' ').trim();
const directPreference = /just (?:tell me|answer)|answer directly|i want the answer|give me (?:the )?answer|直接(?:告訴|回答)|給我答案|直接給(?:我)?答案|答案就好|教えて|答えだけ/iu;
const affirmation = /^(?:yes|yeah|ok(?:ay)?|thanks?|understood|懂了|是|好|了解|はい|わかった)[.!。！\s]*$/iu;
/** This verifies provenance and membership, not whether a student's mathematical claim is true. */
export function guardExtraction(value:unknown,context:ExtractionContext):GuardedExtraction {
  const result=extractionSchema.parse(value), courseId=result.course.course_id;
  if (courseId!==null && !context.courses.some(course=>course.id===courseId)) throw new Error('Unknown extraction course');
  const students=context.messages.filter(message=>message.role==='user').map(message=>normalizeEvidence(message.text));
  const tutors=context.messages.filter(message=>message.role==='assistant').map(message=>normalizeEvidence(message.text));
  const observations:GuardedObservation[]=[];
  const keys=new Set<string>();
  for(const concept of result.concepts){
    const known=concept.concept_id===null ? undefined : context.concepts.find(row=>row.id===concept.concept_id && row.courseId===courseId);
    if(concept.concept_id!==null && !known) throw new Error('Unknown extraction concept');
    if(concept.unit_id!==null && !context.units.some(unit=>unit.id===concept.unit_id && unit.courseId===courseId)) throw new Error('Unknown extraction unit');
    if(known?.unitId && concept.unit_id && known.unitId!==concept.unit_id) throw new Error('Extraction concept unit mismatch');
    const matched=known ?? matchConcept(concept.label,context.concepts.filter(row=>row.courseId===courseId));
    if(matched?.unitId && concept.unit_id && matched.unitId!==concept.unit_id) throw new Error('Extraction concept unit mismatch');
    const evidence=normalizeEvidence(concept.evidence);
    if(!evidence || result.exclude_from_memory || courseId===null || ['definition','factual','exam_strategy','logistics'].includes(result.question_type)) continue;
    const quoted=students.some(text=>text.includes(evidence));
    if(!quoted && tutors.some(text=>text.includes(evidence))) continue;
    const key=matched?.key ?? normalizeEvidence(concept.label).toLocaleLowerCase('en-US');
    if(keys.has(key)) continue;
    keys.add(key);
    const preference=directPreference.test(evidence);
    const substantive=quoted && !preference && !affirmation.test(evidence);
    const wrongAttempt=substantive && (concept.wrong_attempt===true || ['wrong_attempt','repeated_wrong'].includes(concept.difficulty_signal));
    let signal:GuardedObservation['signal']='asked';
    let errorType:GuardedObservation['errorType']='none';
    if(substantive){
      if(wrongAttempt && concept.difficulty_signal!=='gave_up') signal='wrong';
      else if(concept.difficulty_signal==='gave_up' && /(?:do(?:n't| not) (?:know|understand)|cannot|can't|give up|不知道|不懂|不會|放棄|わからない|分からない)/iu.test(evidence)) signal='gave_up';
      else if(concept.difficulty_signal==='asked_again') signal='confused';
      if(wrongAttempt && concept.error_type==='misconception' && !/[?？]/u.test(evidence) && result.help_level_used>0) errorType='misconception';
      else if(wrongAttempt && ['slip','mistake'].includes(concept.error_type)) errorType=concept.error_type as 'slip'|'mistake';
      else if(signal==='gave_up' && concept.error_type==='knowledge_gap') errorType='gap';
    }
    // A bare affirmation after a worked example is not a demonstration of understanding.
    const resolved=substantive && !tutors.some(text=>text.includes(evidence)) && result.resolved==='yes' && !wrongAttempt && context.messages.some((message,index)=>message.role==='assistant' && context.messages.slice(index+1).some(next=>next.role==='user' && normalizeEvidence(next.text).includes(evidence)));
    if(resolved){signal='resolved';errorType='none';}
    observations.push({unitId:concept.unit_id ?? matched?.unitId ?? null,conceptKey:matched?.key ?? null,proposedLabel:matched?null:concept.label,
      signal,errorType,evidenceQuote:concept.evidence,evidenceKind:quoted?'quote':'paraphrase',weaknessNote:errorType!=='none'?concept.misconception_text:null,
      confidence:quoted?concept.confidence:Math.min(0.5,concept.confidence),resolved,wrongAttempt});
  }
  return {courseId,confidence:result.course.confidence,questionSummary:result.summary.asked,observations};
}
