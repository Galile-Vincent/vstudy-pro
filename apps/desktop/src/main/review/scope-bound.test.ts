import { expect, it } from 'vitest';
import { resolveScope } from './scope';
import { studyResolvedScopeSchema } from '../../shared/review-artifacts';
const id = '00000000-0000-4000-8000-000000000001';
for (const count of [101, 120]) {
  for (const kind of ['weak', 'units', 'documents', 'dates'] as const) {
    it(`bounds ${kind} with ${count} concepts`, () => {
      const scope = kind === 'units' ? { kind, unitIds: [id] }
        : kind === 'documents' ? { kind, documentIds: [id] }
        : kind === 'dates' ? { kind, fromDate: '2026-11-01', toDate: '2026-11-03', timeZone: 'UTC' }
        : { kind };
      const result = resolveScope(scope, {
        units: [{ id, startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-02T00:00:00Z', documentIds: [id] }],
        documents: [id], observations: [],
        concepts: Array.from({ length: count }, (_, i) => ({ key: `k${i}`, unitId: id, weak: true })),
      });
      expect(result.snapshot.conceptKeys).toHaveLength(100);
      expect(result.snapshot).toMatchObject({ totalConcepts: count, omittedConcepts: count - 100 });
      expect(studyResolvedScopeSchema.safeParse(result.snapshot).success).toBe(true);
    });
  }
}
