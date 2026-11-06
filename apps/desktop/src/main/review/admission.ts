/** Review-only budget reservations. Foreground chat and AI parse have separate gates. */
import { randomUUID } from 'node:crypto';
import type { Price, Usage, UsageRecord, UsageSummary } from '../../shared/domain';
import type { ProviderAdapter, ProviderRequest } from '../providers';
import { priceUsage } from '../pricing';
import type { Admission, ReviewEstimate } from './admission-port';

export type ReviewPurpose = 'extraction' | 'generation';
export interface ReviewCall {
  purpose: ReviewPurpose;
  request: ProviderRequest;
  adapter: ProviderAdapter;
  outputTokens?: number;
  maxOutputBytes?: number;
}
interface AdmissionStore {
  settings: { get(): { priceOverrides: Record<string, Price>; monthlyBudgetUsd?: number | undefined; monthlyTokenBudget?: number | undefined } };
  usage: { summary(period:'month'): UsageSummary; record(record:UsageRecord): unknown };
}
export class ReviewBudgetError extends Error {
  readonly errorCode = 'budget';
  constructor() { super('Review budget unavailable or exhausted'); }
}

/** Share one instance between extraction and generation; each retry is a new execute call. */
export class ReviewAdmission implements Admission {
  private suspended = false;
  private disposed = false;
  private readonly idleWaiters = new Set<() => void>();
  suspend(): void { this.suspended = true; }
  resume(): void { if (!this.disposed) this.suspended = false; }
  async waitForIdle(): Promise<void> {
    if (this.reservations.size) await new Promise<void>(resolve => this.idleWaiters.add(resolve));
  }
  dispose(): void { this.disposed = true; this.suspend(); }
  private reservations = new Map<string, ReviewEstimate>();
  constructor(private readonly store: AdmissionStore) {}

  get inFlight() {
    const result = {calls:0,inputTokens:0,outputTokens:0,costUsd:0};
    for (const usage of this.reservations.values()) {
      result.calls++; result.inputTokens += usage.inputTokens;
      result.outputTokens += usage.outputTokens; result.costUsd += usage.costUsd ?? 0;
    }
    return result;
  }

  reserve(estimate: ReviewEstimate): string {
    if (this.suspended) throw new Error('review.suspended');
    const settings = this.store.settings.get();
    const spent = this.store.usage.summary('month'), reserved = this.inFlight;
    if (![estimate.inputTokens, estimate.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0) ||
      estimate.costUsd === undefined || !Number.isFinite(estimate.costUsd) || estimate.costUsd < 0 ||
      settings.monthlyBudgetUsd !== undefined && (spent.unknownPrices > 0 || (spent.costUsd ?? 0) + reserved.costUsd + estimate.costUsd > settings.monthlyBudgetUsd) ||
      settings.monthlyTokenBudget !== undefined && spent.inputTokens + spent.outputTokens + reserved.inputTokens + reserved.outputTokens + estimate.inputTokens + estimate.outputTokens > settings.monthlyTokenBudget)
      throw new ReviewBudgetError();
    const handle = randomUUID();
    this.reservations.set(handle, estimate);
    return handle;
  }
  settle(handle: string): void {
    this.reservations.delete(handle);
    if (!this.reservations.size) {
      for (const resolve of this.idleWaiters) resolve();
      this.idleWaiters.clear();
    }
  }

  async execute(call:ReviewCall, signal:AbortSignal):Promise<string> {
    signal.throwIfAborted();
    const {request,adapter} = call;
    const outputTokens = call.outputTokens ?? 2048;
    const maxOutputBytes = call.maxOutputBytes ?? 64 * 1024;
    if (!Number.isSafeInteger(outputTokens) || outputTokens < 1 || outputTokens > 32768 ||
        !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 256 * 1024)
      throw new Error('Invalid review output bound');
    const settings = this.store.settings.get();
    // UTF-8 bytes are deliberately conservative for CJK and punctuation-heavy JSON.
    const estimate = priceUsage(request.modelId, {
      inputTokens:Buffer.byteLength(request.prompt) + Buffer.byteLength(request.systemPrompt ?? ''),
      outputTokens, costSource:'estimated',
    },settings.priceOverrides);
    const token = this.reserve({...estimate,costUsd:estimate.costUsd});
    let usage:Usage | undefined, output = '', outputBytes = 0, done = false;
    // No await may separate this reservation from dispatch.
    try {
      for await (const event of adapter.stream({...request,allowPresentation:false,maxOutputTokens:outputTokens,
        onUsageSnapshot:value => { usage = value; }},signal)) {
        signal.throwIfAborted();
        if (event.type === 'usage') usage = event.usage;
        if (event.type === 'text-delta' || event.type === 'reasoning-delta') {
          outputBytes += Buffer.byteLength(event.text);
          if (outputBytes > maxOutputBytes) throw new Error('Review output exceeds bound');
          if (event.type === 'text-delta') output += event.text;
        }
        if (event.type === 'error' || event.type === 'tool-call') throw new Error('Invalid review provider response');
        if (event.type === 'done') done = true;
      }
      signal.throwIfAborted();
      if (!done) throw new Error('Incomplete review provider response');
      return output;
    } finally {
      try {
        // No usage metadata field exists in the persisted schema, so purpose stays main-local.
        // Missing usage on a failed call consumes its reservation rather than making retries free.
        const measured = priceUsage(request.modelId,usage ?? (done ? {
          inputTokens:estimate.inputTokens,outputTokens:Math.ceil(outputBytes / 3),costSource:'estimated',
        } : estimate),settings.priceOverrides);
        this.store.usage.record({...measured,id:randomUUID(),createdAt:new Date().toISOString(),
          providerId:request.providerId,modelId:request.modelId,kind:'chat',
          conversationId:request.conversationId,...(request.scope === 'document' ? {documentId:request.documentId} : {}),aborted:signal.aborted});
      } finally { this.settle(token); }
    }
  }
}

const admissions = new WeakMap<AdmissionStore, ReviewAdmission>();
export function getReviewAdmission(store:AdmissionStore):ReviewAdmission {
  let admission = admissions.get(store);
  if (!admission) { admission = new ReviewAdmission(store); admissions.set(store,admission); }
  return admission;
}
