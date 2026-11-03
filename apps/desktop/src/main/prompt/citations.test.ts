import { expect,it } from 'vitest';
import { citationCatalog,citedReferences } from './citations';
import type { Document } from '../../shared';
const id='00000000-0000-4000-8000-000000000001' as Document['id'];
it('derives real section/page positions and rejects invented citation IDs', () => {
 const markdown='<!-- page 2 -->\n# Study\nA fact.\n\n## Detail\nAnother fact.';
 expect(citationCatalog(id,markdown)).toEqual([
  {id:'s16',documentId:id,offset:16,title:'Study',page:2,quote:'# Study\nA fact.\n\n## Detail\nAnother fact.'},
  {id:'s33',documentId:id,offset:33,title:'Detail',page:2,quote:'## Detail\nAnother fact.'},
 ]);
 expect(citedReferences('A [[cite:s16]]; fabricated [[cite:s999]]',citationCatalog(id,markdown)).map(c => c.id)).toEqual(['s16']);
});
it('ignores headings inside fences and gives unheaded documents a real root reference', () => {
 expect(citationCatalog(id,'```\n# not a section\n```').map(c => ({id:c.id,title:c.title,offset:c.offset}))).toEqual([{id:'s0',title:'Document',offset:0}]);
});
