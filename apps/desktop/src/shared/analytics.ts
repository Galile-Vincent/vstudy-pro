import { z } from 'zod';

export const acquisitionSource = z.enum(['friend_classmate','instagram','threads','x','youtube','github','search_engine','teacher_school','other','prefer_not_to_say']);
export const onboarding = z.object({acquisition_source:acquisitionSource,email_provided:z.boolean(),updates_opted_in:z.boolean(),duration_ms:z.number().int().min(0).max(86_400_000)}).strict();
export const analyticsState = z.object({enabled:z.boolean(),onboarding_completed:z.boolean(),onboarding:onboarding.nullable(),installation_id_present:z.boolean(),acquisition_source:acquisitionSource.nullable(),deletion_pending:z.boolean()});
export const rendererEvents = ['onboarding_started','onboarding_skipped','settings_opened','screen_viewed','theme_changed','language_changed'] as const;
export const analyticsContract = {
  'analytics:getState':{request:z.object({}).strict(),response:analyticsState},
  'analytics:setConsent':{request:z.object({enabled:z.boolean()}).strict(),response:analyticsState},
  'analytics:completeOnboarding':{request:onboarding,response:analyticsState},
  'analytics:track':{request:z.object({event:z.string().max(80),properties:z.record(z.unknown()).default({}),event_id:z.string().uuid().optional()}).strict(),response:z.object({ok:z.literal(true)})},
  'analytics:requestDeletion':{request:z.object({}).strict(),response:z.object({pending:z.literal(true),installation_id:z.string().uuid(),method:z.literal('contact'),contact_url:z.string().url(),instructions:z.string()})},
} as const;
export type Onboarding = z.infer<typeof onboarding>;

export type AnalyticsState = z.infer<typeof analyticsState>;
export type AcquisitionSource = z.infer<typeof acquisitionSource>;
