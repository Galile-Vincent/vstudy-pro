export interface ReviewEstimate {
    inputTokens: number;
    outputTokens: number;
    costUsd: number | undefined;
}
export interface Admission {
    reserve(estimate: ReviewEstimate): string;
    settle(handle: string, actual: ReviewEstimate): void;
}
/** Test seam only. Production uses W2's shared admission service. */
export class FakeAdmission implements Admission {
    readonly pending = new Map<string, ReviewEstimate>();
    readonly settled: ReviewEstimate[] = [];
    reserve(estimate: ReviewEstimate): string { if (estimate.costUsd === undefined)
        throw new Error('review.budget_unknown'); const handle = crypto.randomUUID(); this.pending.set(handle, estimate); return handle; }
    settle(handle: string, actual: ReviewEstimate): void { if (!this.pending.delete(handle))
        return; this.settled.push(actual); }
}
let shared: Admission | undefined;
/** W2 installs its process-wide review gate during normal service startup. */
export function installReviewAdmission(admission: Admission): void { shared = admission; }
export const reviewAdmission: Admission = { reserve(estimate) { if (estimate.costUsd === undefined)
        throw new Error('review.budget_unknown'); if (!shared)
        throw new Error('review.admission_unavailable'); return shared.reserve(estimate); }, settle(handle, actual) { if (!shared)
        throw new Error('review.admission_unavailable'); shared.settle(handle, actual); } };
