import { z } from 'zod';

export const localeSchema = z.enum(['en', 'ja', 'zh-Hant']);
export const subscribeRequestSchema = z.object({
  email: z.string().trim().max(254).email().transform(value => value.toLowerCase()),
  locale: localeSchema,
  source: z.literal('onboarding'),
  consent: z.literal(true),
  app_version: z.string().min(1).max(64).regex(/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/),
}).strict();
export const tokenSchema = z.string().min(1).max(512);
export const deleteRequestSchema = z.object({ token: tokenSchema }).strict();
export const acceptedResponseSchema = z.object({ status: z.literal('accepted') }).strict();
export const okResponseSchema = z.object({ status: z.literal('ok') }).strict();
export const errorResponseSchema = z.object({ error: z.enum(['invalid_request', 'forbidden', 'not_found', 'unavailable']) }).strict();
export type SubscribeRequest = z.input<typeof subscribeRequestSchema>;
export type AcceptedResponse = z.infer<typeof acceptedResponseSchema>;
