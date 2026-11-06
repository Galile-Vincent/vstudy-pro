import { describe, expect, it } from 'vitest';
import { orderCourses, type CourseOrderItem } from './moodle-course-order';

const now = Date.parse('2026-11-06T04:00:00Z'), day = 86400000;
const item = (id: string, extra: Partial<CourseOrderItem> = {}): CourseOrderItem => ({id,name:id,term:'1151',pinned:false,nextDueAt:null,latestOverdueAt:null,overdueCount:0,unreadCount:0,...extra});
const ids = (items: CourseOrderItem[], extra = {}) => orderCourses(items,{now,locale:'en',...extra}).map(course => course.id);

it('handles empty input and sorts zero attention by name without mutation', () => {
  expect(ids([])).toEqual([]);
  const input = Object.freeze([Object.freeze(item('Zulu')),Object.freeze(item('Alpha'))]);
  expect(orderCourses(input,{now,locale:'en'}).map(course => course.id)).toEqual(['Alpha','Zulu']);
  expect(input.map(course => course.id)).toEqual(['Zulu','Alpha']);
});
it('ranks upcoming, overdue only, unread only, and quiet courses, including mixed signals', () => {
  const input = [item('quiet'),item('unread',{unreadCount:999999999}),item('overdue',{overdueCount:1,latestOverdueAt:now-day*200,unreadCount:1}),item('due-later',{nextDueAt:now+day,overdueCount:9,unreadCount:9}),item('due-first',{nextDueAt:now+1})];
  expect(ids(input)).toEqual(['due-first','due-later','overdue','unread','quiet']);
});
it('includes now and exactly seven days, excludes past and outside-horizon upcoming times', () => {
  expect(ids([item('outside',{nextDueAt:now+7*day+1}),item('seven',{nextDueAt:now+7*day}),item('past',{nextDueAt:now-1}),item('now',{nextDueAt:now})])).toEqual(['now','seven','outside','past']);
});
it('orders overdue by the most recent overdue time, not the largest count', () => {
  expect(ids([item('old',{overdueCount:999,latestOverdueAt:now-200*day}),item('new',{overdueCount:1,latestOverdueAt:now-1}),item('unknown',{overdueCount:9})])).toEqual(['new','old','unknown']);
});
it('orders unread by the full count including values above 99', () => {
  expect(ids([item('lower',{unreadCount:100}),item('higher',{unreadCount:Number.MAX_SAFE_INTEGER}),item('ninety-nine',{unreadCount:99})])).toEqual(['higher','lower','ninety-nine']);
});
it('groups pins first and applies Smart within each group', () => {
  expect(ids([item('rest-due',{nextDueAt:now}),item('pinned-quiet',{pinned:true}),item('pinned-due',{pinned:true,nextDueAt:now+day})])).toEqual(['pinned-due','pinned-quiet','rest-due']);
});
describe.each([
  {nextDueAt:now+day},
  {overdueCount:2,latestOverdueAt:now-day},
  {overdueCount:2},
  {unreadCount:5},
  {},
])('ties within a Smart tier %j', extra => {
  it('uses name and then stable course id, independent of input order', () => {
    const input = [item('b',{...extra,name:'Same'}),item('a',{...extra,name:'Same'}),item('z',{...extra,name:'Alpha'})];
    expect(ids(input)).toEqual(['z','a','b']);
    expect(ids([...input].reverse())).toEqual(['z','a','b']);
  });
});
it.each(['en','zh-Hant','ja'])('uses locale-aware names with numeric segments in %s', locale => {
  const input = ['課程 10','課程 2','あ','ア','Alpha','École'].map(name => item(name));
  const compare = new Intl.Collator(locale,{numeric:true,sensitivity:'base'}).compare;
  const expected = [...input].sort((a,b) => compare(a.name,b.name) || (a.id < b.id ? -1 : 1));
  expect(orderCourses(input,{now,locale,sort:'name'})).toEqual(expected);
  expect(ids([item('Course 10'),item('Course 2')],{locale,sort:'name'})).toEqual(['Course 2','Course 10']);
});
it('uses term then name for Past and All, with optional pin grouping', () => {
  const input = [item('A',{term:'1142'}),item('Z',{term:'1151'}),item('B',{term:'1151'}),item('P',{term:'1131',pinned:true})];
  expect(ids(input,{sort:'name',groupTerms:true})).toEqual(['P','B','Z','A']);
  expect(ids(input,{sort:'name',groupTerms:true,groupPins:false})).toEqual(['B','Z','A','P']);
});
it('Name ignores attention, while keeping pins first', () => {
  expect(ids([item('Zulu',{nextDueAt:now}),item('Alpha'),item('Pinned',{pinned:true})],{sort:'name'})).toEqual(['Pinned','Alpha','Zulu']);
});
