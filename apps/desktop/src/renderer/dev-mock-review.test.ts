import { expect, it } from 'vitest';
import { createMockBridge } from './dev-mock';
it('returns an iterable AI tool inventory so the browser shell can mount', async () => {
  expect(await createMockBridge().invoke('ai-cli:list', {})).toEqual([]);
});
