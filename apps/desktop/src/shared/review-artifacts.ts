/** Persistent generation payload contracts shared with restore validation. */
import { z } from 'zod';
const id=z.string().uuid(), text=z.string().min(1).max(240), hash=z.string().regex(/^[a-f0-9]{64}$/), at=z.string().datetime();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const parsed=new Date(value);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;});
const zone=z.string().min(1).max(100).refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}});
export const studyScopeSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('units'),unitIds:z.array(id).min(1).max(100)}).strict(),
 z.object({kind:z.literal('documents'),documentIds:z.array(id).min(1).max(100)}).strict(),
 z.object({kind:z.literal('concepts'),conceptKeys:z.array(text).min(1).max(100)}).strict(),
 z.object({kind:z.literal('dates'),fromDate:date,toDate:date,timeZone:zone}).strict(),
 z.object({kind:z.literal('weak')}).strict(),
]);
export const studySourceSnapshotSchema=z.object({documentId:id,version:z.enum(['original','ai']),excerptHash:hash}).strict();
export const EXAM_COURSE_ID = '00000000-0000-4000-8000-000000000026';
export const examConfigSchema=z.object({
 prompt:z.string().trim().max(4000),
 counts:z.object({mcq:z.number().int().min(0).max(40),multi_select:z.number().int().min(0).max(40),calculation:z.number().int().min(0).max(40),cloze:z.number().int().min(0).max(40),true_false:z.number().int().min(0).max(40)}).strict().refine(v=>{const n=Object.values(v).reduce((a,b)=>a+b,0);return n>0&&n<=40;}),
 difficulty:z.enum(['easy','medium','hard']),
}).strict();
export const studyResolvedScopeSchema=z.object({
 sourceTitles:z.record(id,text).refine(v=>Object.keys(v).length<=8).optional(),
 exam:examConfigSchema.optional(),
 size:z.enum(['short','standard','long']).optional(),
 unitIds:z.array(id).max(100),documentIds:z.array(id).max(100),conceptKeys:z.array(text).max(100),
 from:at.nullable(),to:at.nullable(),timeZone:zone,sources:z.array(studySourceSnapshotSchema).max(100),
 assumptions:z.array(z.string().min(1).max(500)).max(50),
}).strict().refine(value=>(value.from===null)===(value.to===null)&&(value.from===null||value.from<value.to!));
const source=z.object({documentId:id,version:z.enum(['original','ai']),excerptHash:hash,quote:z.string().min(1).max(2000)}).strict();
const metadata={unitId:id.nullable().optional(),bloom:z.enum(['remember_understand','apply','analyze_evaluate']).optional(),difficulty:z.enum(['easy','medium','hard']).optional(),nextStep:z.string().max(500).optional(),optionRationales:z.array(z.string().min(1).max(1000)).max(6).optional(),misconceptions:z.array(z.object({option:z.number().int().min(0).max(5),id:text.nullable(),inferred:z.boolean()}).strict()).max(6).optional()};
const common={...metadata,id:text,conceptKey:text,stem:z.string().min(1).max(2000),explanation:z.string().max(4000),source};
export const studyTestItemSchema=z.discriminatedUnion('type',[
 z.object({...common,type:z.literal('mcq'),options:z.array(z.string().min(1).max(1000)).min(2).max(6),answer:z.number().int().min(0).max(5)}).strict(),
 z.object({...common,type:z.literal('cloze'),answer:z.string().min(1).max(240),alternatives:z.array(text).max(10)}).strict(),
 z.object({...common,type:z.literal('true_false'),answer:z.boolean()}).strict(),
 z.object({...common,type:z.literal('multi_select'),options:z.array(z.string().min(1).max(1000)).min(2).max(6),answer:z.array(z.number().int().min(0).max(5)).min(1).max(6).refine(a=>new Set(a).size===a.length)}).strict(),
 z.object({...common,type:z.literal('calculation'),answer:z.number().finite(),tolerance:z.number().finite().min(0).max(1000000),unit:z.string().max(80)}).strict(),
]);
export const studyTestSchema=z.object({version:z.literal(1),items:z.array(studyTestItemSchema).min(1).max(100),excludedStemHashes:z.array(hash).max(1000).optional(),warnings:z.array(z.string().max(500)).max(100).optional(),validationNotice:z.string().max(200).optional()}).strict().superRefine((value,ctx)=>{
 if(new Set(value.items.map(item=>item.id)).size!==value.items.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Duplicate item ids'});
 for(const item of value.items)if((item.type==='mcq'||item.type==='multi_select')&&(Array.isArray(item.answer)?item.answer.some(a=>a>=item.options.length):item.answer>=item.options.length))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Answer is outside options'});
});
export const studyAnswersSchema=z.record(text,z.union([z.string().max(2000),z.number().int().min(0).max(5),z.boolean(),z.array(z.number().int().min(0).max(5)).max(6),z.null()])).refine(value=>Object.keys(value).length<=100);
export type StudyResolvedScope=z.infer<typeof studyResolvedScopeSchema>;
export type StudyTest=z.infer<typeof studyTestSchema>;


/** Runtime answers and restored answers must obey the same item-specific contract. */
export function isStudyAnswer(item: StudyTest['items'][number], answer: unknown): boolean {
 if(answer===null)return true;
 if(item.type==='multi_select')return Array.isArray(answer)&&answer.length<=6&&new Set(answer).size===answer.length&&answer.every(a=>typeof a==='number'&&Number.isInteger(a)&&a>=0&&a<item.options.length);
 if(item.type==='mcq')return typeof answer==='number'&&Number.isInteger(answer)&&answer>=0&&answer<item.options.length;
 if(item.type==='true_false')return typeof answer==='boolean';
 return typeof answer==='string'&&answer.length<=2000;
}
