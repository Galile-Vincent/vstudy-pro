export type Answer = string | number | boolean | number[] | null;
type Send = (itemId: string, answer: Answer, seq: number) => Promise<unknown>;

const DRAFT_THROTTLE_MS = 50;
const DRAFT_RETRY_MS = 3000;

/** Writes the latest answer per question, in order; an older write can never replace a newer capture. */
class DraftQueue {
 private readonly pending = new Map<string, { seq: number; answer: Answer }>();
 private readonly seqs = new Map<string, number>();
 private readonly listeners = new Set<(failed: boolean) => void>();
 private running: Promise<void> | null = null;
 private timer: ReturnType<typeof setTimeout> | undefined;
 private lastSent = 0;
 private retryUntil = 0;
 failed = false;

 constructor(private readonly send: Send, private readonly onIdle: () => void) {}

 seed(itemId: string, seq: number) { this.seqs.set(itemId, Math.max(this.seqs.get(itemId) ?? 0, seq)); }

 set(itemId: string, answer: Answer) {
  const seq = (this.seqs.get(itemId) ?? 0) + 1;
  this.seqs.set(itemId, seq);
  this.pending.set(itemId, { seq, answer });
  if (this.running) return;
  const wait = this.lastSent + DRAFT_THROTTLE_MS - Date.now();
  if (wait <= 0) void this.flush(); else this.schedule(wait);
 }

 drop(itemId: string) { this.pending.delete(itemId); this.settleIfIdle(); }

 answers(): Record<string, Answer> {
  return Object.fromEntries([...this.pending].map(([itemId, { answer }]) => [itemId, answer]));
 }

 subscribe(listener: (failed: boolean) => void) {
  this.listeners.add(listener);
  return () => { this.listeners.delete(listener); this.settleIfIdle(); };
 }

 flush(allowanceMs = 0): Promise<void> {
  this.retryUntil = Math.max(this.retryUntil, Date.now() + allowanceMs);
  clearTimeout(this.timer); this.timer = undefined;
  if (!this.running) {
   this.running = Promise.resolve().then(() => this.pump()).finally(() => {
    this.running = null;
    this.settleIfIdle();
   });
  }
  return this.running;
 }

 private schedule(ms: number) {
  clearTimeout(this.timer);
  this.timer = setTimeout(() => { void this.flush(); }, ms);
 }

 private async pump() {
  const failedIds = new Map<string, number>();
  for (;;) {
   const next = [...this.pending].find(([itemId, entry]) => failedIds.get(itemId) !== entry.seq);
   if (!next) {
    const remaining = this.retryUntil - Date.now();
    if (!this.pending.size || remaining <= 0) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(100, remaining)));
    if (Date.now() >= this.retryUntil) break;
    failedIds.clear();
    continue;
   }
   const [itemId, { seq, answer }] = next;
   this.lastSent = Date.now();
   try {
    await this.send(itemId, answer, seq);
    if (this.pending.get(itemId)?.seq === seq) this.pending.delete(itemId);
   } catch {
    if (this.pending.get(itemId)?.seq === seq) failedIds.set(itemId, seq);
   }
  }
  this.setFailed(failedIds.size > 0);
  if (failedIds.size && this.timer === undefined) this.schedule(DRAFT_RETRY_MS);
  this.settleIfIdle();
 }

 private settleIfIdle() {
  if (!this.pending.size && !this.running && !this.listeners.size) { clearTimeout(this.timer); this.timer = undefined; this.onIdle(); }
 }

 private setFailed(failed: boolean) {
  this.failed = failed;
  for (const listener of this.listeners) listener(failed);
 }
}

const queues = new Map<string, DraftQueue>();

/** One queue per attempt, shared by every player of it and kept alive until its writes are saved. */
export function draftQueue(attemptId: string, send: Send): DraftQueue {
 let queue = queues.get(attemptId);
 if (!queue) {
  const created: DraftQueue = new DraftQueue(send, () => { if (queues.get(attemptId) === created) queues.delete(attemptId); });
  queue = created; queues.set(attemptId, queue);
 }
 return queue;
}

export type { DraftQueue };
export function resetDraftQueues() { queues.clear(); }

/** Writes every pending draft now; main waits for this before it closes the database. */
export async function flushDraftQueues(): Promise<'clean' | 'pending'> {
 const snapshot = [...queues.values()];
 let timer: ReturnType<typeof setTimeout> | undefined;
 try {
  await Promise.race([
   Promise.all(snapshot.map(queue => queue.flush(1800))),
   new Promise(resolve => { timer = setTimeout(resolve, 1800); }),
  ]);
  return snapshot.some(queue => Object.keys(queue.answers()).length) ? 'pending' : 'clean';
 } finally { clearTimeout(timer); }
}
