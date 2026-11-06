import { expect, it } from 'vitest';
import { createReviewMock, reviewDemoChat } from './dev-mock';

it('keeps preferences and course mutations isolated to the mock instance', () => {
  const mock = createReviewMock();
  expect(mock('review:prefs:get', {})).toMatchObject({ memoryEnabled: true });
  mock('review:prefs:set', { memoryEnabled: false });
  expect(mock('review:prefs:get', {})).toMatchObject({ memoryEnabled: false });
  const course = mock('review:courses:create', {title: 'Biology'}) as {id:string};
  mock('review:courses:archive', {courseId:course.id, archived:true});
  expect(mock('review:courses:list', {})).toMatchObject({items:[]});
  expect(mock('review:courses:list', {includeArchived:true})).toMatchObject({items:[{title:'Biology'}]});
  expect(createReviewMock()('review:courses:list', {})).toMatchObject({items:[]});
});
it('pages demo rows without duplicates and preserves excluded chat flags', () => {
  const mock = createReviewMock(true);
  const courses = mock('review:courses:list', {}) as {items:{id:string}[]};
  const first = mock('review:jobs:page', {courseId:courses.items[0]!.id, limit:1}) as {items:{id:string}[];nextCursor:unknown};
  const next = mock('review:jobs:page', {courseId:courses.items[0]!.id, limit:1,cursor:first.nextCursor}) as {items:{id:string}[]};
  expect(first.items).toHaveLength(1);
  expect(next.items).toHaveLength(1);
  expect(next.items[0]!.id).not.toBe(first.items[0]!.id);
  const inbox = mock('review:chat:inbox', {}) as {items:{conversationId:string}[]};
  mock('review:chat:exclude', {conversationId:inbox.items[0]!.conversationId,excluded:true});
  expect(mock('review:chat:inbox', {})).toMatchObject({items:[{excludeFromMemory:true}]});
});
it('erases study records and validates input instead of accepting invalid mock data', () => {
  const mock = createReviewMock(true);
  expect(() => mock('review:courses:create', {title:''})).toThrow();
  mock('review:prefs:erase', {});
  expect(mock('review:courses:list', {})).toMatchObject({items:[]});
  expect(mock('review:prefs:get', {})).toMatchObject({memoryEnabled:false});
  expect(mock('other:channel', {})).toBeUndefined();
});
it('persists concept labels, understanding and evidence edits in demo reads', () => {
  const mock=createReviewMock(true);
  const courses=mock('review:courses:list', {}) as {items:{id:string}[]};
  const courseId=courses.items[0]!.id;
  const mastery=mock('review:courses:mastery', {courseId}) as {items:{id:string}[]};
  const conceptId=mastery.items[0]!.id;
  mock('review:concepts:edit', {conceptId, changes:{label:'Water movement'}});
  mock('review:concepts:understood', {conceptId});
  expect(mock('review:courses:mastery', {courseId})).toMatchObject({items:[{label:'Water movement',mastery:{state:'watching'}}]});
  const evidence=mock('review:observations:page', {courseId}) as {items:{id:string}[]};
  mock('review:observations:delete', {observationId:evidence.items[0]!.id});
  expect(mock('review:observations:page', {courseId})).toMatchObject({items:[{id:evidence.items[1]!.id}]});
});

it('provides exact source messages for opening review evidence in History', () => {
  const chat=reviewDemoChat();
  expect(chat.conversations[0]!.scope).toBe('general');
  expect(chat.messages.some(message=>message.id==='00000000-0000-4000-8000-000000000024')).toBe(true);
});
it('validates generation contracts and reports unavailable attempts explicitly',()=>{
 const mock=createReviewMock();
 expect(mock('review:artifact:list',{courseId:'00000000-0000-4000-8000-000000000001'})).toEqual({items:[],nextCursor:null});
 expect(()=>mock('review:attempt:get',{attemptId:'00000000-0000-4000-8000-000000000001'})).toThrow('review.attempt_unavailable');
 expect(()=>mock('review:attempt:get',{attemptId:'invalid'})).toThrow();
});
