import {expect,it} from 'vitest';
import {copyAnswer} from './copy-answer';
import type {DocumentCitation} from '../shared';
it('copies page markers and leaves forged citations inert', () => {
 const citations=[{id:'s260',page:5,title:'Section'}] as DocumentCitation[];
 expect(copyAnswer('Fact [[cite:s260]]. Forged [[cite:s999]].',citations)).toBe('Fact p. 5. Forged [[cite:s999]].');
});
