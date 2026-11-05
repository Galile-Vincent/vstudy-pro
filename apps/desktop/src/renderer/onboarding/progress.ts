/** Profile-local learning progress. Never stores credentials or document contents. */
import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { documentIdSchema } from '../../shared/domain';

export const steps = ['welcome', 'language', 'appearance', 'goal', 'ai', 'start'] as const;
export const goals = ['school', 'documents', 'sample'] as const;
const progressSchema = z.object({
  version: z.literal(1),
  documentId: documentIdSchema.optional(),
  step: z.enum(steps),
  goal: z.enum(goals),
  status: z.enum(['active', 'paused', 'completed']),
  done: z.array(z.enum(['setup', 'document', 'walkthrough', 'help'])),
  dismissed: z.array(z.enum(['workspace', 'courses'])),
});
export type LearningProgress = z.infer<typeof progressSchema>;
const storageKey = 'vstudy-onboarding-v1';
const initial: LearningProgress = { version: 1, step: 'welcome', goal: 'sample', status: 'active', done: [], dismissed: [] };
let cached: LearningProgress | undefined;
export function getLearningProgress(): LearningProgress {
  if (cached) return cached;
  try { cached = progressSchema.parse(JSON.parse(localStorage.getItem(storageKey) ?? 'null')); }
  catch { cached = { ...initial, done: [], dismissed: [] }; }
  return cached;
}
const listeners = new Set<() => void>();
/** Saves before notifying React so a failed write cannot pretend to survive restart. */
export function saveProgress(patch: Partial<LearningProgress>) {
  const next = progressSchema.parse({ ...getLearningProgress(), ...patch });
  localStorage.setItem(storageKey, JSON.stringify(next));
  cached = next;
  listeners.forEach(listener => listener());
  return next;
}
export function markLearned(item: LearningProgress['done'][number]) {
  const current = getLearningProgress();
  if (!current.done.includes(item)) saveProgress({ done: [...current.done, item] });
}
export function useLearningProgress() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getLearningProgress);
}
