import { expect, it } from 'vitest';
import { validateTest, type Excerpt } from './test-validate';
const source: Excerpt = { documentId: '10000000-0000-4000-8000-000000000001', version: 'original', excerptHash: 'a'.repeat(64), text: 'A supported statement.' };
const citation = {documentId: source.documentId, version: source.version, excerptHash: source.excerptHash, quote: source.text};
const mcq = (id: string, answer = 0) => ({ id, conceptKey:'a', type:'mcq' as const, stem:`Question ${id}`, answer, options:['one', 'two', 'six', 'ten'], explanation:'Reason', source:citation });
const tf = (id: string, answer = true) => ({ id, conceptKey:'a', type:'true_false' as const, stem:`Statement ${id}`, answer, explanation:'Reason', source:citation });
it('rejects unique longest keys, non-four-option choices and answer shortcuts', () => {
  for (const item of [{...mcq('q'), options:['longer', 'short', 'small', 'brief']}, {...mcq('q'), options:['one','two','six']}, {...mcq('q'), options:['都對','two','six','ten']}]) expect(validateTest({version:1,items:[item]},[source]).items).toHaveLength(0);
});
it('rejects items from known assignment excerpts', () => expect(validateTest({version:1,items:[mcq('q')]},[{...source,kind:'assignment'}]).items).toHaveLength(0));
it('returns only overflowing answer positions for retry within the planned whole test', () => {
  const result = validateTest({version:1,items:[mcq('q4'),mcq('q5',1)]},[source],[],{acceptedItems:[mcq('q1'),mcq('q2'),mcq('q3')],plannedMcqCount:8,plannedTrueFalseCount:0});
  expect(result.items.map(i=>i.id)).toEqual(['q5']);
  expect(result.warnings.join()).toContain('answer-position');
});
it('returns only overflowing true/false answers for retry', () => {
  const result = validateTest({version:1,items:[tf('q3'),tf('q4',false)]},[source],[],{acceptedItems:[tf('q1'),tf('q2')],plannedMcqCount:0,plannedTrueFalseCount:4});
  expect(result.items.map(i=>i.id)).toEqual(['q4']);
  expect(result.warnings.join()).toContain('true/false');
});
it('keeps citation-only validation free of quiz balance rules', () => expect(validateTest({version:1,items:Array.from({length:8},(_,i)=>tf(String(i)))},[source]).items).toHaveLength(8));
