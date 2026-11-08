import { z } from 'zod';

export const subscriptionWindowSchema = z.object({
  label: z.enum(['5h', 'weekly']),
  usedPercent: z.number().finite().min(0).max(100),
  resetsAt: z.string().datetime().nullable(),
});
export const subscriptionUsageSchema = z.object({
  provider: z.enum(['claude', 'codex']),
  status: z.enum(['ready', 'stale', 'not-signed-in', 'unsupported', 'unavailable']),
  windows: z.array(subscriptionWindowSchema),
  fetchedAt: z.string().datetime().nullable(),
  nextRefreshAt: z.string().datetime(),
});
export type SubscriptionWindow = z.infer<typeof subscriptionWindowSchema>;
export type SubscriptionUsage = z.infer<typeof subscriptionUsageSchema>;
