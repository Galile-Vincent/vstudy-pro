/** Read whitelisted calendar, grade, quiz and public-name fields through the scheduled school transport. @packageDocumentation */
import type { BackendContext } from './backend-context';
import type { BackendHandlers, BackendServices } from './backend-types';
import { attemptsWire, eventsWire, gradesWire, noWarnings, participantsWire, quizzesWire, timestamp } from './backend-wire';
import { fail } from './backend-errors';

async function courseQuizzes(context:BackendContext, services:BackendServices, courseId:string) {
  const course = context.course(courseId).course;
  const response = await services.remote.call(context, 'mod_quiz_get_quizzes_by_courses', {'courseids[0]':String(course.remoteId)}, quizzesWire);
  noWarnings(response);
  return response.quizzes.filter(row => row.course === course.remoteId);
}
const quizMetadata = (context:BackendContext, row:typeof quizzesWire._output.quizzes[number]) => ({id:row.id, name:context.text(row.name, 300), opensAt:timestamp(row.timeopen), closesAt:timestamp(row.timeclose), timeLimitSeconds:row.timelimit ?? null, allowedAttempts:row.attempts ?? null});

export function remoteReadHandlers(services:BackendServices): Pick<BackendHandlers, 'get_calendar' | 'get_grades' | 'list_quizzes' | 'get_quiz_info' | 'get_participants_summary'> {
  return {
    get_calendar:async (context, args) => {
      const courses = context.courses();
      const response = await services.remote.call(context, 'core_calendar_get_calendar_upcoming_view', {courseid:'0', categoryid:'0'}, eventsWire);
      noWarnings(response);
      const items = response.events.flatMap(row => {
        const course = courses.find(course => course.remoteId === (row.courseid ?? row.course?.id));
        if (!course) return [];
        return [{id:row.id, courseId:course.id, title:context.text(row.name, 300), startsAt:timestamp(row.timestart ?? row.timedue ?? row.timesort), durationSeconds:row.timeduration ?? 0}];
      });
      return services.pages.page(items, services.pages.binding('get_calendar', context.accountId, args), args);
    },
    get_grades:async (context, args) => {
      const detail = context.course(args.courseId);
      if (detail.grades.length) return services.pages.page(detail.grades.map(row => ({name:context.text(row.name, 300), grade:row.grade ? context.text(row.grade, 100) : null, max:row.max, percentage:row.percentage, gradedAt:row.gradedAt})), services.pages.binding('get_grades', context.accountId, args), args);
      const response = await services.remote.call(context, 'gradereport_user_get_grade_items', {courseid:String(detail.course.remoteId), userid:String(context.account().remoteUserId)}, gradesWire);
      noWarnings(response);
      if (response.usergrades.some(row => row.userid !== undefined && row.userid !== context.account().remoteUserId)) fail('DENIED');
      return services.pages.page(response.usergrades.flatMap(user => user.gradeitems.map(row => ({id:row.id, name:context.text(row.itemname ?? '', 300), grade:context.text(row.gradeformatted ?? '', 100), max:row.grademax ?? null, percentage:context.text(row.percentageformatted ?? '', 100), gradedAt:timestamp(row.gradedategraded)}))), services.pages.binding('get_grades', context.accountId, args), args);
    },
    list_quizzes:async (context, args) => services.pages.page((await courseQuizzes(context, services, args.courseId)).map(quiz => quizMetadata(context, quiz)), services.pages.binding('list_quizzes', context.accountId, args), args),
    get_quiz_info:async (context, args) => {
      const quiz = (await courseQuizzes(context, services, args.courseId)).find(row => row.id === args.quizId);
      if (!quiz) fail('DENIED');
      const response = await services.remote.call(context, 'mod_quiz_get_user_attempts', {quizid:String(args.quizId), userid:String(context.account().remoteUserId), status:'all', includepreviews:'0'}, attemptsWire);
      noWarnings(response);
      if (response.attempts.some(row => row.quiz !== args.quizId || row.userid !== context.account().remoteUserId)) fail('DENIED');
      const page = services.pages.page(response.attempts.map(row => ({id:row.id, state:context.text(row.state, 40), attempt:row.attempt ?? null, startedAt:timestamp(row.timestart), finishedAt:timestamp(row.timefinish), grade:row.sumgrades ?? null})), services.pages.binding('get_quiz_info', context.accountId, args), args);
      return {...page, content:{quiz:quizMetadata(context, quiz), ...page.content}};
    },
    get_participants_summary:async (context, args) => {
      const course = context.course(args.courseId).course;
      const binding = services.pages.binding('get_participants_summary', context.accountId, args);
      const offset = services.pages.offset(binding, args.cursor);
      const rows = await services.remote.call(context, 'core_enrol_get_enrolled_users', {courseid:String(course.remoteId), 'options[0][name]':'limitfrom', 'options[0][value]':String(offset), 'options[1][name]':'limitnumber', 'options[1][value]':String(args.limit + 1), 'options[2][name]':'userfields', 'options[2][value]':'fullname'}, participantsWire);
      const items = rows.slice(0, args.limit).map(row => ({name:context.text(row.fullname, 200)}));
      return {content:{items}, nextCursor:rows.length > args.limit ? services.pages.next(binding, offset + items.length) : null};
    },
  };
}
