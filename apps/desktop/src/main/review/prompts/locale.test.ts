import { expect, it } from 'vitest';
import { generationRequestSchema, reviewGenerateIpc } from '../../../shared/review-generate';
import { notePrompt, testPrompt } from './index';
const base = { requestId: '00000000-0000-4000-8000-000000000001', courseId: '00000000-0000-4000-8000-000000000002', kind: 'note', title: 'Notes', scope: { kind: 'weak' }, idempotencyKey: 'k', providerId: 'openai-api', modelId: 'm' };
it('accepts Japanese for generation and retry so Japanese students get Japanese notes and tests', () => {
  expect(generationRequestSchema.parse({ ...base, locale: 'ja' }).locale).toBe('ja');
  expect(reviewGenerateIpc['review:artifact:retry'].request.parse({ artifactId: base.requestId, requestId: base.requestId, locale: 'ja' }).locale).toBe('ja');
  expect(() => generationRequestSchema.parse({ ...base, locale: 'fr' })).toThrow();
});
it.each([['note', notePrompt], ['test', testPrompt]] as const)('keeps the English %s instructions and adds an explicit natural Japanese です・ます instruction', (_kind, prompt) => {
  const ja = prompt({ safe: true }, 'ja').split('\n'), en = prompt({ safe: true }, 'en').split('\n');
  expect(ja[1]).toContain('natural Japanese');
  expect(ja[1]).toContain('です・ます');
  expect(ja.filter((_line, index) => index !== 1)).toEqual(en.filter((_line, index) => index !== 1));
});
