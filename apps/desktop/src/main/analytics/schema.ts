import { z } from 'zod';
import { onboarding } from '../../shared/analytics';

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const id = z.string().uuid();
export const safeLabel = z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/).refine(s => !/[a-zA-Z0-9]{32,}|\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(s)).refine(s => !/(?:@|https?:|file:|sk[-_]|ph[cp]_|api[-_]?key|token|secret|\.[a-z]{2,}(?:$|:))/i.test(s));
const version = z.string().max(40).regex(/^\d+(?:\.\d+){0,3}(?:-[a-zA-Z0-9.-]{1,20})?$/);
export const errorCategory = z.enum(['timeout','auth','rate_limit','network','provider_error','other']);
const schoolId = z.enum(['cycu','ucl','warwick','unsw']).nullable();
export const deviceSchema = z.object({platform:z.enum(['macos','windows','linux']),os_version:z.string().regex(/^\d{1,3}(?:\.\d{1,5})?$/),cpu_arch:z.enum(['arm64','x64']),app_version:version,app_language:z.string().max(35).regex(/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/),memory_bucket:z.enum(['<=4','8','16','32','>32']),cpu_cores_bucket:z.enum(['<=2','4','8','16','>16']),display_size_bucket:z.enum(['small','medium','large']),display_scale_bucket:z.enum(['1','1.5','2','>2']),electron_major:count,chrome_major:count});
export const profileSchema = deviceSchema.partial().extend({acquisition_source:onboarding.shape.acquisition_source.optional(),school_id:schoolId.optional(),school_name:z.enum(['Chung Yuan Christian University','University College London','University of Warwick','UNSW Sydney']).nullable().optional(),school_source:z.enum(['moodle','unknown']).optional(),moodle_connected:z.boolean().optional()});
const ai = z.object({request_id:id,conversation_id:id.nullable(),provider:z.enum(['anthropic-api','openai-api','openai-compatible','claude-cli','codex-cli','agy-cli']),model:safeLabel.nullable(),reasoning_effort:safeLabel.nullable(),integration_type:z.enum(['api','cli','other']),ai_feature:z.enum(['chat','explain_selection','ask_document','summarize','generate_quiz','other']),context_source:z.enum(['direct_chat','document','selected_text','quiz','other'])});
const timing = {active_ms:count,idle_ms:count,background_ms:count};
const empty = z.object({});
export const eventSchemas = {
  app_first_opened:z.object({app_version:version}),app_opened:deviceSchema,
  app_close_requested:z.object({close_reason:z.enum(['quit'])}),app_session_started:empty,
  app_session_ended:z.object({...timing,elapsed_ms:count}),app_focused:empty,app_unfocused:empty,app_minimized:empty,
  app_activity_summary:z.object({...timing,window_ms:count}),app_updated:z.object({from_version:version,to_version:version}),
  app_performance_sample:z.object({startup_ms:count}),app_error:z.object({error_category:errorCategory,feature:z.enum(['app','chat','moodle'])}),app_crashed:z.object({crash_category:z.enum(['renderer','child_process'])}),
  ai_request_started:ai,ai_request_completed:ai.extend({input_tokens:count.nullable(),output_tokens:count.nullable(),cached_input_tokens:count.nullable(),reasoning_tokens:count.nullable(),total_tokens:count.nullable(),token_usage_source:z.enum(['provider_reported','derived','unavailable']),latency_ms:count,time_to_first_token_ms:count.nullable(),request_status:z.literal('success')}),
  ai_request_failed:ai.extend({error_category:errorCategory,latency_ms:count,request_status:z.literal('failed')}),ai_request_cancelled:ai.extend({latency_ms:count,request_status:z.literal('cancelled')}),
  question_asked:z.object({question_category:z.enum(['concept_explanation','summarization','exam_practice','unknown']),subject_category:z.literal('unknown'),question_source:z.enum(['typed','selected_document_text','document_chat','generated_quiz','follow_up','other']),question_length:count,conversation_turn:count.min(1),is_follow_up:z.boolean(),has_document_context:z.boolean()}),
  conversation_started:z.object({conversation_id:id,ai_feature:z.literal('chat')}),conversation_cleared:empty,conversation_continued:z.object({conversation_turn:count.min(1),is_follow_up:z.literal(true)}),question_regenerated:empty,
  moodle_connection_started:z.object({connection_method:z.enum(['password','browser','discover'])}),moodle_connection_succeeded:z.object({school_id:schoolId}),moodle_connection_failed:z.object({error_category:errorCategory}),moodle_disconnected:empty,
  onboarding_started:z.object({onboarding_version:count}),onboarding_skipped:z.object({onboarding_version:count}),onboarding_completed:onboarding,
  settings_opened:z.object({settings_section:z.enum(['general','privacy','ai','moodle','storage','appearance','usage'])}),screen_viewed:z.object({screen_name:z.enum(['library','document','chat','planner','moodle','settings'])}),theme_changed:z.object({theme:z.enum(['light','dark','system'])}),language_changed:z.object({app_language:deviceSchema.shape.app_language}),
  $identify:profileSchema,
} satisfies Record<string,z.ZodTypeAny>;
export type AnalyticsEvent = keyof typeof eventSchemas;
export function sanitizeEvent(event: string, properties: unknown): Record<string,unknown> | null {
  if (!Object.hasOwn(eventSchemas,event)) return null;
  const parsed = eventSchemas[event as AnalyticsEvent].safeParse(properties);
  return parsed.success ? parsed.data : null;
}

const standardProperties = z.object({event_id:id,session_id:id,app_version:deviceSchema.shape.app_version,platform:deviceSchema.shape.platform,school_id:schoolId,$geoip_disable:z.literal(true),$process_person_profile:z.literal(true)});
const queuedEnvelope = z.object({event:z.string().max(80),uuid:id,distinct_id:id,timestamp:z.string().datetime(),properties:z.record(z.unknown())});
export function sanitizeQueuedEvent(input:unknown) {
  const parsed=queuedEnvelope.safeParse(input);
  if (!parsed.success) return null;
  const envelope=parsed.data;
  const standard=standardProperties.safeParse(envelope.properties);
  const clean=sanitizeEvent(envelope.event,envelope.event === '$identify' ? envelope.properties.$set : envelope.properties);
  if (!standard.success || !clean || standard.data.event_id !== envelope.uuid) return null;
  return {...envelope,properties:{...(envelope.event === '$identify' ? {$set:clean} : clean),...standard.data}};
}
