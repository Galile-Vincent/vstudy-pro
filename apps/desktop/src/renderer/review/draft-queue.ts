export type Answer = string | number | boolean | number[] | null;
type Send = (itemId: string, answer: Answer, seq: number) => Promise<unknown>;

const DRAFT_DELAY_MS = 500;
const DRAFT_RETRY_MS = 3000;

/** Writes the latest answer per question, in order; an older write can never replace a newer capture. */
export class DraftQueue {
 private readonly pending = new Map<string, { seq: number; answer: Answer }>();
 private readonly seqs = new Map<string, number>();
 private readonly listeners = new Set<(failed: boolean) => void>();
 private running: Promise<void> | null = null;
 private timer: ReturnType<typeof setTimeout> | undefined;
 failed = false;

 constructor(private readonly send: Send) {}

 seed(itemId: string, seq: number) { this.seqs.set(itemId, Math.max(this.seqs.get(itemId) ?? 0, seq)); }

 set(itemId: string, answer: Answer) {
  const seq = (this.seqs.get(itemId) ?? 0) + 1;
  this.seqs.set(itemId, seq);
  this.pending.set(itemId, { seq, answer });
  this.schedule(DRAFT_DELAY_MS);
 }

 drop(itemId: string) { this.pending.delete(itemId); }

 subscribe(listener: (failed: boolean) => void) {
  this.listeners.add(listener);
  return () => { this.listeners.delete(listener); };
 }

 flush(): Promise<void> {
  clearTimeout(this.timer); this.timer = undefined;
  return this.running ??= this.pump();
 }

 private schedule(ms: number) {
  clearTimeout(this.timer);
  this.timer = setTimeout(() => { void this.flush(); }, ms);
 }

 private async pump() {
  const failedIds = new Set<string>();
  for (;;) {
   const next = [...this.pending].find(([itemId]) => !failedIds.has(itemId));
   if (!next) break;
   const [itemId, { seq, answer }] = next;
   try {
    await this.send(itemId, answer, seq);
    if (this.pending.get(itemId)?.seq === seq) this.pending.delete(itemId);
   } catch {
    if (this.pending.get(itemId)?.seq === seq) failedIds.add(itemId);
   }
  }
  this.running = null;
  this.setFailed(failedIds.size > 0);
  if (failedIds.size && this.timer === undefined) this.schedule(DRAFT_RETRY_MS);
 }

 private setFailed(failed: boolean) {
  this.failed = failed;
  for (const listener of this.listeners) listener(failed);
 }
}
