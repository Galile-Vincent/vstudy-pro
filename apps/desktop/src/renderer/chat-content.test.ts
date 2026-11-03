import {expect,it} from 'vitest';
import {assistantContent} from './chat-content';
import type {DocumentCitation} from '../shared';
it('does not duplicate page-only source titles', () => {
 const citations=[{id:'s12',documentId:'00000000-0000-4000-8000-000000000001',offset:12,title:'p. 5',quote:'Source',page:5}] as DocumentCitation[];
 expect(assistantContent('Fact','',citations).filter(p=>p.type==='source').map(p=>p.title)).toEqual(['p. 5']);
});
