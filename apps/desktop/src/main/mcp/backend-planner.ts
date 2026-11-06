/** Filter complete planner relationships by account before reads, proposals and approved mutations. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import type { PlannerAction, PlannerSnapshot, PlannerTarget } from '../../shared/planner';
import type { ToolArguments, ToolName } from '../../shared/mcp';
import { assertPlannerAction, type PlanningContext } from '../../shared/planner-policy';
import { plannerCalendar } from '../planner/calendar';
import type { BackendContext } from './backend-context';
import type { BackendHandlers, BackendServices } from './backend-types';
import { available, fail } from './backend-errors';
import { contentText } from './backend-page';

export function plannerContext(context:BackendContext, services:BackendServices): PlanningContext {
  const all = services.planner.snapshot();
  const courses = context.courses();
  const courseIds = courses.map(row => row.id);
  const owns = (id:string | null) => id === null || courseIds.includes(id);
  const deadlines = courses.flatMap(course => context.course(course.id).deadlines).filter(row => !row.orphaned);
  const goals = all.goals.filter(row => owns(row.courseId));
  const tasks = all.tasks.filter(row => owns(row.courseId)
    && (!row.goalId || goals.some(goal => goal.id === row.goalId && goal.courseId === row.courseId))
    && (!row.deadlineId || deadlines.some(deadline => deadline.id === row.deadlineId && deadline.courseId === row.courseId)));
  const exams = all.exams.filter(row => owns(row.courseId)
    && (!row.deadlineId || deadlines.some(deadline => deadline.id === row.deadlineId && deadline.courseId === row.courseId)));
  const targetCourse = (target:PlannerTarget): string | null | undefined => (target.kind === 'task' ? tasks : target.kind === 'exam' ? exams : deadlines).find(row => row.id === target.id)?.courseId;
  const visible = (block:PlannerSnapshot['blocks'][number]) => owns(block.courseId) && (!block.target || targetCourse(block.target) === block.courseId);
  const plans = all.plans.filter(plan => {
    const blocks = all.blocks.filter(block => block.planId === plan.id);
    return blocks.length > 0 && blocks.every(visible);
  });
  const blocks = all.blocks.filter(block => visible(block) && (!block.planId || plans.some(plan => plan.id === block.planId)));
  const reminders = all.reminders.filter(row => targetCourse(row.target) !== undefined);
  return {snapshot:{tasks, exams, goals, plans, blocks, reminders}, deadlines, courseIds, documentIds:[], now:services.clock()};
}

function actionFor(name:ToolName, args:ToolArguments): PlannerAction {
  if (name === 'create_task' && 'task' in args) return {type:'create-task', task:args.task};
  if (name === 'update_task' && 'taskId' in args) return {type:'update-task', taskId:args.taskId, changes:args.changes};
  if (name === 'create_study_plan_proposal' && 'plan' in args) return {type:'make-study-plan', ...args.plan};
  if (name === 'set_reminder' && 'target' in args) return {type:'set-reminder', target:args.target, remindAt:args.remindAt, note:args.note};
  return fail('INVALID_ARGUMENT');
}

export function validateLocal(context:BackendContext, services:BackendServices, name:keyof BackendHandlers, args:Parameters<BackendHandlers[keyof BackendHandlers]>[1]): void {
  const planning = plannerContext(context, services);
  if (name === 'export_calendar' && 'selection' in args) {
    available(() => plannerCalendar(planning.snapshot, planning.deadlines, args.selection));
    return;
  }
  if (name === 'create_task' && 'task' in args) {
    context.ownsCourse(args.task.courseId);
    if (args.task.goalId && !planning.snapshot.goals.some(goal => goal.id === args.task.goalId)) fail('DENIED');
    if (args.task.deadlineId && !planning.deadlines.some(deadline => deadline.id === args.task.deadlineId)) fail('DENIED');
  } else if (name === 'update_task' && 'taskId' in args) {
    if (!planning.snapshot.tasks.some(task => task.id === args.taskId)) fail('DENIED');
    if (args.changes.courseId) context.course(args.changes.courseId);
    if (args.changes.goalId && !planning.snapshot.goals.some(goal => goal.id === args.changes.goalId)) fail('DENIED');
  } else if (name === 'create_study_plan_proposal' && 'plan' in args) {
    for (const block of args.plan.blocks) {
      context.ownsCourse(block.courseId);
      if (block.target) requireTarget(block.target, planning);
    }
  } else if (name === 'set_reminder' && 'target' in args) requireTarget(args.target, planning);
  else return;
  const action = actionFor(name, args);
  try { assertPlannerAction(action, planning); } catch { fail('INVALID_ARGUMENT'); }
}

function requireTarget(target:PlannerTarget, planning:PlanningContext): void {
  const rows = target.kind === 'task' ? planning.snapshot.tasks : target.kind === 'exam' ? planning.snapshot.exams : planning.deadlines;
  if (!rows.some(row => row.id === target.id)) fail('DENIED');
}

export function plannerHandlers(services:BackendServices): Pick<BackendHandlers, 'get_planner' | 'create_task' | 'update_task' | 'create_study_plan_proposal' | 'set_reminder' | 'export_calendar'> {
  const approve = async (context:BackendContext, action:PlannerAction) => {
    context.recheck();
    const result = services.planner.approve(randomUUID(), action);
    return {content:result};
  };
  return {
    get_planner:async (context, args) => {
      const {snapshot, deadlines} = plannerContext(context, services);
      const items = [
        ...snapshot.tasks.map(({id, title, courseId, dueAt, estimateMinutes, status, source, goalId, deadlineId}) => ({kind:'task', id, title:contentText(title, 200), courseId, dueAt, estimateMinutes, status, source, goalId, deadlineId})),
        ...snapshot.exams.map(({id, title, courseId, date, scopeTopics}) => ({kind:'exam', id, title:contentText(title, 200), courseId, date, scopeTopics:scopeTopics.map(value => contentText(value, 200))})),
        ...snapshot.goals.map(row => ({kind:'goal', ...row, title:contentText(row.title, 200)})),
        ...snapshot.plans.map(row => ({kind:'plan', ...row, title:contentText(row.title, 200), assumptions:row.assumptions.map(value => contentText(value, 300))})),
        ...snapshot.blocks.map(row => ({kind:'block', ...row, title:contentText(row.title, 200)})),
        ...snapshot.reminders.map(row => ({kind:'reminder', ...row, note:contentText(row.note, 280)})),
        ...context.repository.reminders().filter(row => !row.orphaned && deadlines.some(deadline => deadline.id === row.deadlineId)).map(row => ({kind:'moodle-reminder', id:row.id, deadlineId:row.deadlineId, remindAt:row.remindAt, note:contentText(row.note, 280), fired:row.fired})),
      ].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
      return services.pages.page(items, services.pages.binding('get_planner', context.accountId, args), args);
    },
    create_task:async (context, args) => { validateLocal(context, services, 'create_task', args); return approve(context, actionFor('create_task', args)); },
    update_task:async (context, args) => { validateLocal(context, services, 'update_task', args); return approve(context, actionFor('update_task', args)); },
    create_study_plan_proposal:async (context, args) => { validateLocal(context, services, 'create_study_plan_proposal', args); return approve(context, actionFor('create_study_plan_proposal', args)); },
    set_reminder:async (context, args) => { validateLocal(context, services, 'set_reminder', args); return approve(context, actionFor('set_reminder', args)); },
    export_calendar:async (context, args) => {
      validateLocal(context, services, 'export_calendar', args);
      return {content:await services.options.exportCalendar(args.selection)};
    },
  };
}
