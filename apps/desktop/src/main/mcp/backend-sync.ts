/** Refresh course caches through explicit read calls only, with a sixty-second account cooldown. @packageDocumentation */
import { z } from 'zod';
import type { BackendHandlers, BackendServices } from './backend-types';
import { integer, numeric, assignmentsWire, eventsWire, noWarnings, quizzesWire, timestamp } from './backend-wire';
import { fail } from './backend-errors';
import { contentsWire, parseCourseContents, sanitizeCourseHtml } from '../moodle/contents';
import { remoteId } from '../moodle/remote-id';
import { parseCourseIdentity, courseLifecycle } from '../moodle/identity';
import { normalizeSiteUrl } from '../moodle/site-url';
import { plainText } from '../moodle/client';
import type { MoodleCourse, MoodleDeadline } from '../../shared/moodle';
import { cacheCoursePages } from './backend-pages';

const coursesWire = z.array(z.object({id:integer, fullname:z.string(), shortname:z.string(), summary:z.string().nullish(), startdate:integer.nullish(), enddate:integer.nullish(), progress:numeric.nullish(), format:z.string().nullish()})).max(1000);
const infoWire = z.object({userid:integer, siteurl:z.string(), functions:z.array(z.object({name:z.string()})).optional(), release:z.string().optional(), version:z.string().optional()});

export function syncHandler(services:BackendServices): BackendHandlers['sync_now'] {
  const lastAttempt = new Map<string, number>();
  return async context => {
    const account = context.account();
    const now = services.clock();
    const previousAttempt = lastAttempt.get(account.id);
    if (previousAttempt !== undefined && now - previousAttempt < 60_000) fail('RATE_LIMITED');
    services.remote.require(context, ['core_webservice_get_site_info', 'core_course_get_contents']);
    const listing = services.remote.supports(context, 'core_enrol_get_users_courses') ? 'core_enrol_get_users_courses' : 'core_course_get_enrolled_courses_by_timeline_classification';
    services.remote.require(context, [listing]);
    lastAttempt.set(account.id, now);
    const info = await services.remote.call(context, 'core_webservice_get_site_info', {}, infoWire);
    if (info.userid !== account.remoteUserId || normalizeSiteUrl(info.siteurl) !== account.siteUrl) fail('DENIED');
    if (!info.functions) fail('UNSUPPORTED');
    context.recheck();
    const oldCapabilities = context.repository.capabilities(account.id);
    context.repository.saveCapabilities(account.id, {...oldCapabilities, functions:info.functions.map(row => row.name), release:info.release, version:info.version, advancedfeatures:oldCapabilities?.advancedfeatures ?? [], mobileConfig:oldCapabilities?.mobileConfig ?? {}});
    const rows = listing === 'core_enrol_get_users_courses'
      ? await services.remote.call(context, listing, {userid:String(account.remoteUserId)}, coursesWire)
      : await (async () => {
        const rows = new Map<number, typeof coursesWire._output[number]>();
        let offset = 0;
        for (let page = 0; page < 10; page++) {
          const response = await services.remote.call(context, listing, {classification:'all', limit:'100', offset:String(offset)}, z.object({courses:coursesWire, nextoffset:integer.optional()}));
          response.courses.forEach(row => rows.set(row.id, row));
          if (!response.nextoffset || response.nextoffset <= offset) return [...rows.values()];
          offset = response.nextoffset;
        }
        fail('UNSUPPORTED');
      })();
    const courses:MoodleCourse[] = rows.filter(row => row.id > 0).map(row => {
      const identity = parseCourseIdentity(row.fullname, row.shortname, row.progress != null);
      const startAt = timestamp(row.startdate), endAt = timestamp(row.enddate);
      Object.assign(identity, courseLifecycle({startAt, endAt, term:identity.term}));
      identity.summaryHtml = sanitizeCourseHtml(row.summary);
      identity.format = row.format ?? null;
      return {id:remoteId(account.id, 'course', row.id), accountId:account.id, remoteId:row.id, fullName:plainText(row.fullname), shortName:plainText(row.shortname), imageUrl:null, progress:row.progress == null ? null : Math.min(100, Math.max(0, row.progress)), startAt, endAt, favourite:false, identity};
    });
    const deadlines:MoodleDeadline[] = [];
    for (const course of courses) {
      const contents = await services.remote.call(context, 'core_course_get_contents', {courseid:String(course.remoteId)}, contentsWire);
      const parsed = parseCourseContents(contents, course);
      const old = context.repository.overview(account.id).courses.some(row => row.id === course.id) ? context.course(course.id) : null;
      const due = new Map((old?.deadlines ?? []).map(row => [row.id, row]));
      if (services.remote.supports(context, 'mod_assign_get_assignments')) {
        const result = await services.remote.call(context, 'mod_assign_get_assignments', {'courseids[0]':String(course.remoteId)}, assignmentsWire);
        noWarnings(result);
        for (const row of result.courses.filter(row => row.id === course.remoteId).flatMap(row => row.assignments).filter(row => row.course === course.remoteId)) {
          const dueAt = timestamp(row.duedate);
          if (dueAt) due.set(remoteId(account.id, 'assignment', row.id), {id:remoteId(account.id, 'assignment', row.id), courseId:course.id, title:plainText(row.name), kind:'assignment', dueAt, url:null, submitted:null});
        }
      }
      if (services.remote.supports(context, 'mod_quiz_get_quizzes_by_courses')) {
        const result = await services.remote.call(context, 'mod_quiz_get_quizzes_by_courses', {'courseids[0]':String(course.remoteId)}, quizzesWire);
        noWarnings(result);
        for (const row of result.quizzes.filter(row => row.course === course.remoteId)) {
          const dueAt = timestamp(row.timeclose);
          if (dueAt) due.set(remoteId(account.id, 'quiz', row.id), {id:remoteId(account.id, 'quiz', row.id), courseId:course.id, title:plainText(row.name), kind:'quiz', dueAt, url:null, submitted:null});
        }
      }
      context.recheck();
      context.repository.apply(account.id, {courses:[course], deadlines:[...due.values()], notifications:[], grades:old ? context.repository.gradeRecords(course.id) : [], files:parsed.files}, course.id);
      context.repository.saveDetail(course.id, {sections:parsed.sections}, parsed.files, new Date(services.clock()).toISOString());
      if (parsed.sections.some(section => section.modules.some(module => module.kind === 'page')) && services.remote.supports(context, 'mod_page_get_pages_by_courses')) await cacheCoursePages(context, services, course.id);
      deadlines.push(...due.values());
    }
    if (services.remote.supports(context, 'core_calendar_get_calendar_upcoming_view')) {
      const result = await services.remote.call(context, 'core_calendar_get_calendar_upcoming_view', {courseid:'0', categoryid:'0'}, eventsWire);
      noWarnings(result);
      for (const row of result.events) {
        const course = courses.find(course => course.remoteId === (row.courseid ?? row.course?.id));
        const dueAt = timestamp(row.timedue ?? row.timesort ?? row.timestart);
        if (course && dueAt) deadlines.push({id:remoteId(account.id, 'event', row.id), courseId:course.id, title:plainText(row.name), kind:'event', dueAt, url:null, submitted:null});
      }
    }
    context.recheck();
    context.repository.apply(account.id, {courses, deadlines, notifications:context.repository.notificationRecords(account.id).filter(row => row.value.courseId === null || courses.some(course => course.id === row.value.courseId)), grades:courses.flatMap(course => context.repository.gradeRecords(course.id)), files:courses.flatMap(course => context.repository.fileRecords(course.id))});
    context.provenance.syncedAt = new Date(services.clock()).toISOString();
    return {content:{synced:true, courseCount:courses.length, syncedAt:context.provenance.syncedAt}};
  };
}
