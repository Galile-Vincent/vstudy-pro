/** Narrow app-only controls. Hosted pages never receive the preload bridge. */
import { z } from 'zod';
import { webviewBoundsSchema } from './moodle-webview';
export const webChatProviderSchema = z.enum(['gemini', 'chatgpt', 'claude']);
export const webChatClearedChannel='web-chat:cleared';
export type WebChatProvider = z.infer<typeof webChatProviderSchema>;
export const webChatStateSchema = z.object({status:z.enum(['loading','ready','error','resource-limit']),generation:z.number().int().nonnegative(),url:z.string().max(8192),title:z.string().max(1000),canGoBack:z.boolean(),canGoForward:z.boolean()}).strict();
export type WebChatState = z.infer<typeof webChatStateSchema>;
const provider = webChatProviderSchema;
const identity = {provider,tabId:z.string().uuid(),slotId:z.enum(['page','workspace']).default('page')};
const ack = z.object({ok:z.literal(true)}).strict();
export const webChatContract = {
  'web-chat:hide': {request:z.object({...identity,generation:z.number().int().nonnegative()}).strict(),response:ack},
  'web-chat:sync': {request:z.object({tabIds:z.array(z.string().uuid()).max(30)}).strict(),response:z.object({tabs:z.array(z.object({tabId:z.string().uuid(),status:z.enum(['loading','ready','error','discarded','resource-limit'])}).strict())}).strict()},
  'web-chat:open': {request:z.object({...identity,url:z.string().max(8192).optional()}).strict(),response:webChatStateSchema},
  'web-chat:state': {request:z.object({...identity}).strict(),response:webChatStateSchema},
  'web-chat:layout': {request:z.object({...identity,bounds:webviewBoundsSchema,visible:z.boolean(),generation:z.number().int().nonnegative(),active:z.boolean().optional(),radius:z.number().int().min(0).max(32).optional()}).strict(),response:ack},
  'web-chat:action': {request:z.object({...identity,action:z.enum(['back','forward','reload','home','focus','external','discard'])}).strict(),response:webChatStateSchema},
  'web-chat:clear': {request:z.object({...identity}).strict(),response:ack},
} as const;
