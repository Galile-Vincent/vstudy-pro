/** Verify conservative evidence and deterministic course matching. @packageDocumentation */
import { describe, expect, it } from 'vitest';
import { conceptKey, matchConcept, normalizeText } from './concept-match';
import { classify } from './classify';
import { buildEpisodes } from './episodes';
import { computeMastery, type MasteryObservation } from './mastery';
import { isEligibleSource, type EligibleSource } from './eligibility';

const now = Date.parse('2026-11-06T12:00:00Z');
const obs = (at:string, changes:Partial<MasteryObservation> = {}):MasteryObservation => ({id:at,jobId:at,occurredAt:at,signal:'confused',errorType:'gap',confidence:1,evidenceKind:'quote',resolved:false,...changes});
describe('mastery decision 5', () => {
  it.each([
    ['plain question', [obs('2026-11-05T01:00:00Z',{signal:'asked',errorType:'none'})], 'candidate'],
    ['same episode', [obs('2026-11-05T01:00:00Z'),obs('2026-11-05T02:00:00Z')], 'candidate'],
    ['same day separated', [obs('2026-11-05T01:00:00Z'),obs('2026-11-05T08:00:00Z')], 'watching'],
    ['different days', [obs('2026-11-05T01:00:00Z'),obs('2026-11-06T01:00:00Z')], 'needs_review'],
    ['misconception', [obs('2026-11-05T01:00:00Z',{errorType:'misconception'})], 'needs_review'],
    ['direct preference', [obs('2026-11-05T01:00:00Z',{signal:'gave_up',errorType:'none'})], 'candidate'],
    ['gave up with wrong attempt', [obs('2026-11-05T01:00:00Z',{signal:'gave_up',wrongAttempt:true})], 'needs_review'],
    ['resolved latest episode', [obs('2026-11-05T01:00:00Z',{errorType:'misconception'}),obs('2026-11-06T01:00:00Z',{signal:'resolved',resolved:true,errorType:'none'})], 'watching'],
  ] as const)('%s', (_label, observations, state) => {
    expect(computeMastery(observations,{now,timeZone:'UTC'}).state).toBe(state);
  });
  it('keeps dismissal and understood suppression until new negative evidence', () => {
    const observations = [obs('2026-11-05T01:00:00Z',{errorType:'misconception'})];
    expect(computeMastery(observations,{now,userState:'dismissed'}).state).toBe('dismissed');
    expect(computeMastery(observations,{now,understoodAt:'2026-11-06T00:00:00Z'}).state).toBe('watching');
  });
  it('halves paraphrase weights without changing evidence provenance', () => {
    const a = obs('2026-11-05T01:00:00Z',{errorType:'misconception'});
    expect(computeMastery([{...a,evidenceKind:'paraphrase'}],{now}).negative).toBe(computeMastery([a],{now}).negative / 2);
  });
});
it('groups by adjacent interaction with exact six-hour boundary and local day changes', () => {
  const rows = ['2026-11-05T15:59:00Z','2026-11-05T16:01:00Z','2026-11-05T22:01:00Z'].map(at=>obs(at));
  expect(buildEpisodes(rows,'Asia/Taipei')).toHaveLength(3);
  expect(buildEpisodes([...rows].reverse(),'Asia/Taipei')).toEqual(buildEpisodes(rows,'Asia/Taipei'));
});
it.each([['ＡＢＣ  計算','abc 計算'],['微積分','微積分'],['日本語の導関数','日本語の導関数']])('normalizes %s without losing CJK', (input,want) => {
  expect(conceptKey(input)).toBe(want);
});
it('matches aliases and headings on normalized keys', () => {
  expect(normalizeText('Ａ\n B')).toBe('a b');
  expect(matchConcept('全微分',[{key:'differential',label:'Differential',aliases:['全微分']}])?.key).toBe('differential');
});
const courses = [{id:'a',title:'Calculus',aliases:['微積分']},{id:'b',title:'Algorithms',aliases:['計組']}];
it.each([
  [{scopeCourseId:'a',documentCourseIds:['b'],text:'計組'},'a','scope'],
  [{documentCourseIds:['b'],text:'微積分'},'b','document'],
  [{text:'請問微積分怎麼算'},'a','alias'],
  [{text:'help',modelSuggestion:{courseId:'a',confidence:0.8}},'a','model'],
  [{text:'help',modelSuggestion:{courseId:'a',confidence:0.49}},null,null],
  [{text:'微積分與計組'},null,null],
  [{text:'help',manualOverride:{courseId:'b'}},'b','manual'],
] as const)('uses the classification ladder %#', (input,id,method) => {
  expect(classify({...input,courses})).toMatchObject({courseId:id,method});
});
it('marks tentative model assignments as ineligible until confirmed', () => {
  expect(classify({courses,text:'help',modelSuggestion:{courseId:'a',confidence:0.6}})).toMatchObject({confirmed:false,eligibleForMastery:false});
});
const source:EligibleSource = {
  conversation:{id:'c',deletedAt:null,documentId:null},
  document:null,
  user:{id:'u',conversationId:'c',role:'user',supersededBy:null,parts:[{type:'text',text:'question'}]},
  assistant:{id:'a',conversationId:'c',role:'assistant',supersededBy:null,parts:[{type:'text',text:'answer',status:'complete'}]},
  link:{courseId:'course',revision:1,excludeFromMemory:false,confirmed:true,confidence:1},
  courseId:'course',assignmentRevision:1,
};
it('requires live complete same-conversation evidence and current assignment', () => {
  expect(isEligibleSource(source)).toBe(true);
  for (const changed of [
    {...source,assignmentRevision:0}, {...source,conversation:{...source.conversation,deletedAt:'today'}},
    {...source,user:{...source.user,conversationId:'other'}},
    {...source,assistant:{...source.assistant,parts:[{type:'text',text:'answer',status:'aborted'}]}},
    {...source,user:{...source.user,parts:[{type:'text',text:'q',contextExcluded:true}]}},
    {...source,link:{...source.link,excludeFromMemory:true}},
  ]) expect(isEligibleSource(changed)).toBe(false);
});
