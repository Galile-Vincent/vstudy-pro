import { expect, it } from 'vitest';
import { describeAssumption } from './review-assumptions';
it('maps the strings main emits and hides internal markers and unknown text', () => {
  expect(describeAssumption('retakeAttempt:3f2a0000-0000-4000-8000-000000000000')).toBeNull();
  expect(describeAssumption('something new')).toBeNull();
  expect(describeAssumption('Some sources omitted due to excerpt budget')).toEqual({ key: 'assumption_sources_omitted' });
  expect(describeAssumption('Source excerpt limited to first 6000 bytes: doc-1')).toEqual({ key: 'assumption_excerpt_limited', documentId: 'doc-1' });
  expect(describeAssumption('Undated units based on when you asked: u1, u2')).toEqual({ key: 'assumption_undated_units', unitIds: ['u1', 'u2'] });
  expect(describeAssumption('Based on when you asked')).toEqual({ key: 'asked_fallback' });
});
