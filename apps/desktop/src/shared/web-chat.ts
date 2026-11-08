/** Narrow app-only controls. Hosted pages never receive the preload bridge. */
import { z } from 'zod';
import { webviewBoundsSchema } from './moodle-webview';
export const webChatProviderSchema = z.enum(['gemini', 'chatgpt', 'claude']);
export type WebChatProvider = z.infer<typeof webChatProviderSchema>;
export const webChatStateSchema = z.object({status:z.enum(['loading','ready','error']),canGoBack:z.boolean(),canGoForward:z.boolean()}).strict();
export type WebChatState = z.infer<typeof webChatStateSchema>;
const provider = webChatProviderSchema;
const ack = z.object({ok:z.literal(true)}).strict();
export const webChatContract = {
  'web-chat:open': {request:z.object({provider}).strict(),response:webChatStateSchema},
  'web-chat:state': {request:z.object({provider}).strict(),response:webChatStateSchema},
  'web-chat:layout': {request:z.object({provider,bounds:webviewBoundsSchema,visible:z.boolean(),radius:z.number().int().min(0).max(32).optional()}).strict(),response:ack},
  'web-chat:action': {request:z.object({provider,action:z.enum(['back','forward','reload','home','focus','external'])}).strict(),response:webChatStateSchema},
  'web-chat:clear': {request:z.object({provider}).strict(),response:ack},
} as const;
