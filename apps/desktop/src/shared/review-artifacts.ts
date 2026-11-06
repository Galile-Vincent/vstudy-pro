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
export const studyResolvedScopeSchema=z.object({
 unitIds:z.array(id).max(100),documentIds:z.array(id).max(100),conceptKeys:z.array(text).max(100),
 from:at.nullable(),to:at.nullable(),timeZone:zone,sources:z.array(studySourceSnapshotSchema).max(100),
 assumptions:z.array(z.string().min(1).max(500)).max(50),
}).strict().refine(value=>(value.from===null)===(value.to===null)&&(value.from===null||value.from<value.to!));
const source=z.object({documentId:id,version:z.enum(['original','ai']),excerptHash:hash,quote:z.string().min(1).max(2000)}).strict();
const common={id:text,conceptKey:text,stem:z.string().min(1).max(2000),explanation:z.string().max(4000),source};
export const studyTestItemSchema=z.discriminatedUnion('type',[
 z.object({...common,type:z.literal('mcq'),options:z.array(z.string().min(1).max(1000)).min(2).max(6),answer:z.number().int().min(0).max(5)}).strict(),
 z.object({...common,type:z.literal('cloze'),answer:z.string().min(1).max(240),alternatives:z.array(text).max(10)}).strict(),
 z.object({...common,type:z.literal('true_false'),answer:z.boolean()}).strict(),
]);
export const studyTestSchema=z.object({version:z.literal(1),items:z.array(studyTestItemSchema).min(1).max(100)}).strict().superRefine((value,ctx)=>{
 if(new Set(value.items.map(item=>item.id)).size!==value.items.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Duplicate item ids'});
 for(const item of value.items)if(item.type==='mcq'&&item.answer>=item.options.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Answer is outside options'});
});
export const studyAnswersSchema=z.record(text,z.union([z.string().max(2000),z.number().int().min(0).max(5),z.boolean(),z.null()])).refine(value=>Object.keys(value).length<=100);
export type StudyResolvedScope=z.infer<typeof studyResolvedScopeSchema>;
export type StudyTest=z.infer<typeof studyTestSchema>;
