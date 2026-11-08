/**
 * Define validated webview targets, appearance, bounds, actions, and state events.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
/** The app-owned Moodle pane contract. Remote pages never receive this bridge or account credentials. */
import { z } from 'zod';
import { documentIdSchema } from './domain';

export const nativeCheckpointSchema=z.object({accountId:z.string().uuid(),requestedUrl:z.string().max(8192).transform(value=>publicWebviewUrl(value)),url:z.string().max(8192).transform(value=>publicWebviewUrl(value)),zoom:z.number().min(.5).max(2),scrollTop:z.number().finite().min(0).max(10000000)}).strict();
const id = z.string().uuid();
const url = z.string().url().max(8192);
/** Identify an account-owned Moodle target without accepting renderer credentials. */
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
/** Bound content-view geometry before native window operations. */
export const webviewBoundsSchema = z.object({
  x:z.number().int().min(0).max(20000), y:z.number().int().min(0).max(20000),
  width:z.number().int().min(0).max(20000), height:z.number().int().min(0).max(20000),
}).strict();
export type WebviewBounds = z.infer<typeof webviewBoundsSchema>;
export const webviewErrorSchema = z.enum(['resource-limit','offline','timeout','blocked','certificate','session-expired','unavailable','file-unsupported','load-failed']);
export type WebviewError = z.infer<typeof webviewErrorSchema>;
/** Public view lifecycle and recovery state without account tokens or cookie data. */
export const webviewStateSchema = z.object({
  scrollTop:z.number().min(0).max(10000000).default(0), id, generation:z.number().int().nonnegative().default(0), status:z.enum(['connecting','loading','ready','error','closed','discarded']),
  url:z.string(), title:z.string().max(300), secure:z.boolean(),
  canGoBack:z.boolean(), canGoForward:z.boolean(), zoom:z.number().min(0.5).max(2),
  error:webviewErrorSchema.nullable(), retryAt:z.number().nullable(), documentId:documentIdSchema.nullable(), importedDocumentId:documentIdSchema.nullable().default(null),
}).strict();
export type WebviewState = z.infer<typeof webviewStateSchema>;
export const webviewActionSchema = z.enum(['ack-document','discard','back','forward','reload','stop','reconnect','external','copy','close','focus','zoom-in','zoom-out','zoom-reset']);
export type WebviewAction = z.infer<typeof webviewActionSchema>;
export const moodleWebviewContract = {
  'moodle:webview-sync': {request:z.object({tabIds:z.array(id).max(30)}).strict(),response:z.object({ok:z.literal(true),tabs:z.array(z.object({tabId:id,status:z.enum(['live','loading','discarded','error'])}).strict()).max(30)}).strict()},
  'moodle:webview-hide': {request:z.object({tabId:id,generation:z.number().int().nonnegative()}).strict(),response:z.object({ok:z.literal(true)}).strict()},
  'moodle:webview-open': {request:z.object({tabId:id,accountId:id,target:webviewTargetSchema,checkpoint:nativeCheckpointSchema.optional(),importedDocumentId:documentIdSchema.optional()}).strict(),response:webviewStateSchema},
  'moodle:webview-state': {request:z.object({id,tabId:id}).strict(),response:webviewStateSchema},
  'moodle:webview-layout': {request:z.object({id,tabId:id,generation:z.number().int().nonnegative(),bounds:webviewBoundsSchema,theme:webviewThemeSchema,visible:z.boolean()}).strict(),response:z.object({ok:z.literal(true)}).strict()},
  'moodle:webview-action': {request:z.object({id,tabId:id,action:webviewActionSchema}).strict(),response:webviewStateSchema},
} as const;

export function publicWebviewUrl(input:string):string {
  try {
    const url=new URL(input);
    url.username='';url.password='';url.hash='';
    for(const key of [...url.searchParams.keys()]) if(/token|key|pass|auth|secret|session|redirect|urltogo|return|target/i.test(key)) url.searchParams.delete(key);
    return ['https:','http:'].includes(url.protocol) ? url.href : '';
  } catch {return '';}
}
