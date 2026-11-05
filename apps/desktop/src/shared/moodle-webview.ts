/** The app-owned Moodle pane contract. Remote pages never receive this bridge or account credentials. */
import { z } from 'zod';
import { documentIdSchema } from './domain';

const id = z.string().uuid();
const url = z.string().url().max(8192);
export const webviewTargetSchema = z.discriminatedUnion('kind', [
  z.object({kind:z.literal('page'), url}).strict(),
  z.object({kind:z.literal('file'), fileId:id}).strict(),
]);
export type WebviewTarget = z.infer<typeof webviewTargetSchema>;
export const webviewThemeSchema = z.object({
  dark:z.boolean(), background:z.string().regex(/^#[0-9a-f]{6}$/i),
  foreground:z.string().regex(/^#[0-9a-f]{6}$/i), accent:z.string().regex(/^#[0-9a-f]{6}$/i),
}).strict();
export type WebviewTheme = z.infer<typeof webviewThemeSchema>;
export const webviewBoundsSchema = z.object({
  x:z.number().int().min(0).max(20000), y:z.number().int().min(0).max(20000),
  width:z.number().int().min(0).max(20000), height:z.number().int().min(0).max(20000),
}).strict();
export type WebviewBounds = z.infer<typeof webviewBoundsSchema>;
export const webviewErrorSchema = z.enum(['offline','timeout','blocked','certificate','session-expired','unavailable','file-unsupported','load-failed']);
export type WebviewError = z.infer<typeof webviewErrorSchema>;
export const webviewStateSchema = z.object({
  id, status:z.enum(['connecting','loading','ready','error','closed']),
  url:z.string(), title:z.string().max(300), secure:z.boolean(),
  canGoBack:z.boolean(), canGoForward:z.boolean(), zoom:z.number().min(0.5).max(2),
  error:webviewErrorSchema.nullable(), retryAt:z.number().nullable(), documentId:documentIdSchema.nullable(),
}).strict();
export type WebviewState = z.infer<typeof webviewStateSchema>;
export const webviewActionSchema = z.enum(['back','forward','reload','stop','reconnect','external','copy','close','focus','zoom-in','zoom-out','zoom-reset']);
export type WebviewAction = z.infer<typeof webviewActionSchema>;
export const moodleWebviewContract = {
  'moodle:webview-open': {request:z.object({accountId:id,target:webviewTargetSchema}).strict(),response:webviewStateSchema},
  'moodle:webview-state': {request:z.object({id}).strict(),response:webviewStateSchema},
  'moodle:webview-layout': {request:z.object({id,bounds:webviewBoundsSchema,theme:webviewThemeSchema,visible:z.boolean()}).strict(),response:z.object({ok:z.literal(true)}).strict()},
  'moodle:webview-action': {request:z.object({id,action:webviewActionSchema}).strict(),response:webviewStateSchema},
} as const;
