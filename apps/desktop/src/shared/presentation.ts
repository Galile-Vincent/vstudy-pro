/**
 * Limit generated presentations to validated read-only tables.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
import { z } from 'zod';
/** Only read-only structured tables are supported. Arbitrary HTML and executable tool output reject. */
export const presentationSchema = z.object({
  title: z.string().min(1).max(200),
  columns: z.array(z.string().min(1).max(100)).min(1).max(8),
  rows: z.array(z.array(z.string().max(1000)).max(8)).max(30),
}).strict().refine(value => value.rows.every(row => row.length === value.columns.length), 'Each row must match the column count');
export const presentationTool = {
  name: 'present', description: 'Present a concise comparison or summary table grounded in the current document. Text cells only; no actions, links, or code execution.',
  parameters: { type: 'object', properties: { title: {type:'string',maxLength:200}, columns:{type:'array',items:{type:'string',maxLength:100},minItems:1,maxItems:8}, rows:{type:'array',maxItems:30,items:{type:'array',maxItems:8,items:{type:'string',maxLength:1000}}} },required:['title','columns','rows'],additionalProperties:false },
};
