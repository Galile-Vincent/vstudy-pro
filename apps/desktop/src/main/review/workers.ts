/** suspend must synchronously reject new work, fence commits and abort active calls.
 * waitForIdle settles all producers; resume admits new work only after every hold clears. */
export interface ReviewWorker {
    suspend(): void;
    resume(): void;
    waitForIdle(): Promise<void>;
    dispose(): void | Promise<void>;
}
/** An empty registry is intentionally inert, including when a store is opened for restore. */
export class ReviewWorkerRegistry {
    private readonly workers = new Set<ReviewWorker>();
    private readonly holds = new Set<string>();
    private disposed = false;
    register(worker: ReviewWorker): () => void { if (this.disposed)
        throw new Error('Review workers disposed'); if (this.holds.size)
        worker.suspend(); this.workers.add(worker); return () => this.workers.delete(worker); }
    suspend(reason = 'maintenance'): void { const active = this.holds.size > 0; this.holds.add(reason); if (!active)
        for (const worker of this.workers)
            worker.suspend(); }
    resume(reason = 'maintenance'): void { if (!this.holds.delete(reason) || this.holds.size || this.disposed)
        return; for (const worker of this.workers)
        worker.resume(); }
    async waitForIdle(): Promise<void> { await Promise.all([...this.workers].map(worker => worker.waitForIdle())); }
    async dispose(): Promise<void> { if (this.disposed)
        return; this.suspend('dispose'); this.disposed = true; await this.waitForIdle(); await Promise.all([...this.workers].map(worker => worker.dispose())); this.workers.clear(); }
}
export const reviewWorkers = new ReviewWorkerRegistry();
