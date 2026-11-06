import { z } from 'zod';
// Copied from analytics-newsletter 7fffbca5 apps/newsletter/src/contract.ts.
export const newsletterEmail = z.string().trim().max(254).email().transform(value => value.toLowerCase());
export const subscribeRequestSchema = z.object({
  email: newsletterEmail, locale: z.enum(['en', 'ja', 'zh-Hant']),
  source: z.literal('onboarding'), consent: z.literal(true),
  app_version: z.string().min(1).max(64).regex(/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/),
}).strict();
export const acceptedResponseSchema = z.object({ status: z.literal('accepted') }).strict();
export const newsletterContract = {
  'newsletter:getConfig': { request: z.object({}).strict(), response: z.object({ available: z.boolean() }) },
  'newsletter:subscribe': { request: subscribeRequestSchema.omit({ app_version: true }), response: z.object({ accepted: z.boolean() }) },
} as const;
