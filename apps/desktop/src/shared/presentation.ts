import { z } from 'zod';
export const presentationSchema = z.object({
  title: z.string().min(1).max(200),
  columns: z.array(z.string().min(1).max(100)).min(1).max(8),
  rows: z.array(z.array(z.string().max(1000)).max(8)).max(30),
}).strict().refine(value => value.rows.every(row => row.length === value.columns.length), 'Each row must match the column count');
export const presentationTool = {
  name: 'present', description: 'Present a concise comparison or summary table grounded in the current document. Text cells only; no actions, links, or code execution.',
  parameters: { type: 'object', properties: { title: {type:'string',maxLength:200}, columns:{type:'array',items:{type:'string',maxLength:100},minItems:1,maxItems:8}, rows:{type:'array',maxItems:30,items:{type:'array',maxItems:8,items:{type:'string',maxLength:1000}}} },required:['title','columns','rows'],additionalProperties:false },
};
