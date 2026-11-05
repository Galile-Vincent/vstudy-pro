/** Drafting preserves available work when a linked Moodle assignment has already been submitted. */
import { expect, it } from 'vitest';
import { draftStudyPlan } from './planner-draft';
import { studentContext, task, id } from '../main/planner/__fixtures__/student';
it('omits submitted-linked tasks while drafting the remaining work',()=>{
  const context=studentContext();context.deadlines[0]!.submitted=true;
  context.snapshot.tasks.push(task(),task({id:id(50),title:'Review waves',deadlineId:null}));
  const draft=draftStudyPlan(context,{title:'Today',timeZone:'UTC',dailyBudgetMinutes:120,startHour:10,endHour:15,days:1,assumptions:['Free afternoon']});
  expect(draft.action?.blocks.map(b=>b.title)).toEqual(['Review waves','Review waves']);
  expect(draft.unallocated).toEqual([]);
});
