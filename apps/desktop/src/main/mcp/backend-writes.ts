/** Guard the exact approved Moodle effects and fail closed on graded completion or unsupported submissions. @packageDocumentation */
import { z } from 'zod';
import type { BackendContext } from './backend-context';
import type { BackendHandlers, BackendServices } from './backend-types';
import type { ToolArguments } from '../../shared/mcp';
import { fail } from './backend-errors';
import { assignmentsWire, cmWire, flag, integer, noWarnings, submissionWire, warnings } from './backend-wire';
import { discussionPosts } from './backend-forums';

const manualKinds = new Set(['resource', 'folder', 'url', 'page', 'label']);
export function completionCandidate(context:BackendContext, courseId:string, moduleId:string): void {
  const module = context.module(courseId, moduleId);
  if (!manualKinds.has(module.kind) || module.kind !== module.modname) fail('ACADEMIC_INTEGRITY');
}

async function currentModule(context:BackendContext, services:BackendServices, courseId:string, moduleId:string) {
  const course = context.course(courseId).course;
  const module = context.module(courseId, moduleId);
  const response = await services.remote.call(context, 'core_course_get_course_module', {cmid:String(module.cmid)}, cmWire);
  noWarnings(response);
  const cm = response.cm;
  if (cm.id !== module.cmid || cm.course !== course.remoteId) fail('DENIED');
  if (cm.visible === false) fail('DENIED');
  return cm;
}

async function checkAssignment(context:BackendContext, services:BackendServices, args:ToolArguments<'submit_assignment'>) {
  const course = context.course(args.courseId).course;
  const module = context.module(args.courseId, args.moduleId);
  if (module.kind !== 'assign' || module.modname !== 'assign') fail('DENIED');
  const cm = await currentModule(context, services, args.courseId, args.moduleId);
  if (cm.modname !== 'assign' || cm.instance !== args.assignmentId) fail('DENIED');
  const response = await services.remote.call(context, 'mod_assign_get_assignments', {'courseids[0]':String(course.remoteId)}, assignmentsWire);
  noWarnings(response);
  const assignment = response.courses.filter(row => row.id === course.remoteId).flatMap(row => row.assignments).find(row => row.id === args.assignmentId);
  if (!assignment || assignment.cmid !== module.cmid || assignment.course !== course.remoteId) fail('DENIED');
  if (assignment.requiresubmissionstatement !== false || assignment.submissionstatement?.trim()
    || assignment.teamsubmission !== false || assignment.requireallteammemberssubmit !== false
    || assignment.preventsubmissionnotingroup !== false || assignment.nosubmissions !== false
    || assignment.submissiondrafts !== true || assignment.timelimit) fail('UNSUPPORTED');
  const configs = assignment.configs;
  if (!configs) fail('UNSUPPORTED');
  const enabled = configs.filter(row => row.subtype === 'assignsubmission' && row.name === 'enabled' && row.value === '1');
  if (!enabled.some(row => row.plugin === 'onlinetext') || enabled.some(row => !['onlinetext', 'file'].includes(row.plugin))) fail('UNSUPPORTED');
  const value = (plugin:string, name:string) => configs.find(row => row.subtype === 'assignsubmission' && row.plugin === plugin && row.name === name)?.value;
  if (Number(value('file', 'minsubmissions') ?? 0) !== 0) fail('UNSUPPORTED');
  if (value('onlinetext', 'wordlimitenabled') === '1') {
    const limit = Number(value('onlinetext', 'wordlimit'));
    if (!Number.isSafeInteger(limit) || limit <= 0 || args.text.trim().split(/\s+/u).length > limit) fail('UNSUPPORTED');
  }
  const status = await services.remote.call(context, 'mod_assign_get_submission_status', {assignid:String(args.assignmentId), userid:String(context.account().remoteUserId), groupid:'0'}, submissionWire);
  noWarnings(status);
  const last = status.lastattempt;
  if (!last || !last.submissionsenabled || last.locked || !last.canedit || last.caneditowner === false || !last.cansubmit || last.teamsubmission !== undefined || last.submission?.status === 'submitted') fail('UNSUPPORTED');
  if (last.submission?.userid !== undefined && last.submission.userid !== context.account().remoteUserId) fail('DENIED');
}

export function writeHandlers(services:BackendServices): Pick<BackendHandlers, 'mark_module_complete' | 'post_forum_reply' | 'submit_assignment'> {
  return {
    mark_module_complete:async (context, args) => {
      completionCandidate(context, args.courseId, args.moduleId);
      services.remote.require(context, ['core_course_get_course_module', 'core_completion_update_activity_completion_status_manually']);
      const cm = await currentModule(context, services, args.courseId, args.moduleId);
      if (!manualKinds.has(cm.modname) || cm.modname !== context.module(args.courseId, args.moduleId).modname || cm.completion !== 1 || cm.completiongradeitemnumber !== null || cm.completionpassgrade !== false
        || cm.completionview === true || cm.grade !== undefined && cm.grade !== 0 || cm.gradepass !== undefined && cm.gradepass !== 0
        || cm.score !== undefined && cm.score !== 0 || cm.advancedgrading?.length) fail('ACADEMIC_INTEGRITY');
      const allowedCompletionFields = new Set(['completion', 'completiongradeitemnumber', 'completionpassgrade', 'completionview', 'completionexpected']);
      const allowedGradeFields = new Set(['grade', 'gradepass', 'gradecat', 'advancedgrading', 'completiongradeitemnumber', 'completionpassgrade']);
      if (Object.keys(cm).some(key => /^completion/i.test(key) && !allowedCompletionFields.has(key) || /grade|graded|score/i.test(key) && !allowedGradeFields.has(key) && key !== 'score')) fail('ACADEMIC_INTEGRITY');
      context.recheck();
      const response = await services.remote.call(context, 'core_completion_update_activity_completion_status_manually', {cmid:String(cm.id), completed:'1'}, z.object({status:flag, warnings:warnings.optional()}));
      noWarnings(response);
      if (!response.status) fail('UNSUPPORTED');
      return {content:{completed:true, moduleId:args.moduleId}};
    },
    post_forum_reply:async (context, args) => {
      services.remote.require(context, ['mod_forum_add_discussion_post', 'mod_forum_get_forums_by_courses', 'mod_forum_get_discussion_posts']);
      const posts = await discussionPosts(context, services, args.courseId, args.discussionId);
      if (!posts.some(post => post.id === args.postId)) fail('DENIED');
      const response = await services.remote.call(context, 'mod_forum_add_discussion_post', {postid:String(args.postId), subject:args.subject, message:args.message, messageformat:'2', 'options[0][name]':'discussionsubscribe', 'options[0][value]':'0'}, z.object({postid:integer, warnings:warnings.optional()}));
      noWarnings(response);
      return {content:{posted:true, discussionId:args.discussionId, postId:response.postid}};
    },
    submit_assignment:async (context, args) => {
      if (args.studentOwned !== true) fail('ACADEMIC_INTEGRITY');
      services.remote.require(context, ['core_course_get_course_module', 'mod_assign_get_assignments', 'mod_assign_get_submission_status', 'mod_assign_save_submission', 'mod_assign_submit_for_grading']);
      await checkAssignment(context, services, args);
      const saved = await services.remote.call(context, 'mod_assign_save_submission', {assignmentid:String(args.assignmentId), 'plugindata[onlinetext_editor][text]':args.text, 'plugindata[onlinetext_editor][format]':'2', 'plugindata[onlinetext_editor][itemid]':'0'}, warnings);
      context.recheck();
      noWarnings(saved);
      await checkAssignment(context, services, args);
      context.recheck();
      const submitted = await services.remote.call(context, 'mod_assign_submit_for_grading', {assignmentid:String(args.assignmentId), acceptsubmissionstatement:'0'}, warnings);
      noWarnings(submitted);
      return {content:{submitted:true, assignmentId:args.assignmentId, moduleId:args.moduleId}};
    },
  };
}
