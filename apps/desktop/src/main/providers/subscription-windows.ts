import { z } from 'zod';
import type { SubscriptionWindow } from '../../shared/subscription-usage';

const percent = z.number().finite().min(0).max(100);
const epoch = z.number().int().nonnegative().max(8_640_000_000_000);
const codexWindow = z.object({ usedPercent: percent, windowDurationMins: z.number().positive().nullable().optional(), resetsAt: epoch.nullable().optional() });
export function parseCodexWindows(value: unknown): SubscriptionWindow[] {
  const { rateLimits } = z.object({ rateLimits: z.object({ primary: codexWindow.nullable().optional(), secondary: codexWindow.nullable().optional() }) }).parse(value);
  return [rateLimits.primary, rateLimits.secondary].flatMap(window => {
    if (!window || ![300, 10080].includes(window.windowDurationMins ?? 0)) return [];
    return [{ label: window.windowDurationMins === 300 ? '5h' as const : 'weekly' as const, usedPercent: window.usedPercent, resetsAt: window.resetsAt == null ? null : new Date(window.resetsAt * 1000).toISOString() }];
  });
}
const claudeWindow = z.object({ utilization: percent, resets_at: z.string().datetime({ offset: true }).nullable().optional() });
export function parseClaudeWindows(value: unknown): SubscriptionWindow[] {
  const wire = z.object({ five_hour: claudeWindow.nullable().optional(), seven_day: claudeWindow.nullable().optional() }).parse(value);
  return (['five_hour', 'seven_day'] as const).flatMap(key => {
    const window = wire[key];
    return window ? [{ label: key === 'five_hour' ? '5h' as const : 'weekly' as const, usedPercent: window.utilization, resetsAt: window.resets_at ? new Date(window.resets_at).toISOString() : null }] : [];
  });
}
