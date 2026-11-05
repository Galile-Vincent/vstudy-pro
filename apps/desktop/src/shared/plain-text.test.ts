/**
 * Regression coverage for plain-text.
 * Owned by shared.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import {expect,it} from 'vitest';
import {plainText} from './plain-text';
import type {DocumentCitation} from './domain';
it('projects markdown and citations into readable text', () => {
  expect(plainText('**通信** and [link](https://example.com) `code` [[cite:s12]] [[cite:s99]]', [{id:'s12',page:5,title:'p. 5'} as DocumentCitation])).toBe('通信 and link code p. 5');
});
