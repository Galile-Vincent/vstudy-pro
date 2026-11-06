import { randomUUID } from 'node:crypto';
import type { ProviderAdapter, ProviderRequest } from '../providers';
import type { Usage } from '../../shared/domain';
import { analytics } from './service';

export function tokenProperties(usage?:Usage) {
  const known = usage?.costSource !== 'estimated' ? usage : undefined;
  const input = known?.reportedTokens ? known.reportedTokens.input : known && !known.rateLimit ? known.inputTokens : null;
  const output = known?.reportedTokens ? known.reportedTokens.output : known && !known.rateLimit ? known.outputTokens : null;
  return {input_tokens:input ?? null,output_tokens:output ?? null,cached_input_tokens:known?.cacheReadTokens ?? null,reasoning_tokens:known?.reasoningTokens ?? null,total_tokens:input != null && output != null ? input+output : null,token_usage_source:input != null || output != null ? 'provider_reported' : 'unavailable'};
}
export function requestMetadata(request:ProviderRequest) {
  const selection = request.scope !== 'general' && request.scope !== 'course' && !!request.selection;
  const mode = request.scope === 'course' ? request.materials?.mode : undefined;
  return {request_id:String(request.requestId),conversation_id:request.conversationId ?? null,provider:request.providerId,model:request.modelId,reasoning_effort:request.options?.effort ?? null,integration_type:request.providerId.endsWith('-cli') ? 'cli' : 'api',ai_feature:request.systemPrompt ? 'other' : mode === 'quiz' ? 'generate_quiz' : mode === 'summary' ? 'summarize' : selection ? 'explain_selection' : request.scope === 'general' ? 'chat' : 'ask_document',context_source:selection ? 'selected_text' : request.scope === 'general' ? 'direct_chat' : 'document'};
}
export function instrumentProvider(adapter:ProviderAdapter):ProviderAdapter {
  return {...adapter,detect:()=>adapter.detect(),listModels:()=>adapter.listModels(),...(adapter.testConnection ? {testConnection:()=>adapter.testConnection!()} : {}),async *stream(request,signal) {
    const service = analytics();
    const metadata = requestMetadata(request);
    metadata.request_id = randomUUID();
    const started = performance.now();
    let first:number|null = null;
    let usage:Usage|undefined;
    let status:'success'|'failed'|'cancelled' = 'failed';
    const epochPermitted = service?.consentRevision;
    const snapshot:ProviderRequest['onUsageSnapshot'] = (value,models) => {
      usage=value;
      if (models?.length === 1) metadata.model=models[0]!.modelId;
      request.onUsageSnapshot?.(value,models);
    };
    service?.track('ai_request_started',metadata);
    try {
      for await (const event of adapter.stream({...request,onUsageSnapshot:snapshot},signal)) {
        if (event.type === 'usage') usage=event.usage;
        if (event.type === 'text-delta' && first === null) first=Math.round(performance.now()-started);
        if (event.type === 'done') status='success';
        if (event.type === 'error') status='failed';
        yield event;
      }
    } finally {
      if (signal.aborted) status='cancelled';
      if (service?.consentRevision === epochPermitted) {
        const latency_ms=Math.round(performance.now()-started);
        if (status === 'success') service?.track('ai_request_completed',{...metadata,...tokenProperties(usage),latency_ms,time_to_first_token_ms:first,request_status:status});
        else if (status === 'cancelled') service?.track('ai_request_cancelled',{...metadata,latency_ms,request_status:status});
        else service?.track('ai_request_failed',{...metadata,latency_ms,request_status:status,error_category:'provider_error'});
      }
    }
  }};
}
