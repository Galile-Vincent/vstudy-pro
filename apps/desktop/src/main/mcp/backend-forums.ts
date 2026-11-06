/** Establish course, forum, discussion and parent-post membership before any post read or approved reply. @packageDocumentation */
import type { BackendContext } from './backend-context';
import type { BackendServices, BackendHandlers } from './backend-types';
import { discussionsWire, forumsWire, postsWire, timestamp, noWarnings } from './backend-wire';
import { fail } from './backend-errors';

export async function courseForums(context:BackendContext, services:BackendServices, courseId:string) {
  const course = context.course(courseId).course;
  const forums = await services.remote.call(context, 'mod_forum_get_forums_by_courses', {'courseids[0]':String(course.remoteId)}, forumsWire);
  return forums.filter(row => row.course === course.remoteId);
}

export async function forumDiscussions(context:BackendContext, services:BackendServices, forumId:number, find?:number) {
  const name = services.remote.supports(context, 'mod_forum_get_forum_discussions') ? 'mod_forum_get_forum_discussions' : 'mod_forum_get_forum_discussions_paginated';
  services.remote.require(context, [name]);
  const result = new Map<number, typeof discussionsWire._output.discussions[number]>();
  for (let page = 0; page < 20; page++) {
    const response = await services.remote.call(context, name, {forumid:String(forumId), page:String(page), perpage:'100', ...(name.endsWith('_paginated') ? {sortby:'created', sortdirection:'DESC'} : {sortorder:'1'})}, discussionsWire);
    noWarnings(response);
    let added = 0;
    for (const row of response.discussions) {
      if (row.forum !== undefined && row.forum !== forumId || row.forumid !== undefined && row.forumid !== forumId) fail('DENIED');
      const id = row.discussion ?? row.id;
      if (!result.has(id)) { result.set(id, row); added++; }
    }
    if (find !== undefined && result.has(find)) return result;
    if (response.discussions.length < 100 || !added) return result;
  }
  fail('UNSUPPORTED');
}

export async function discussionPosts(context:BackendContext, services:BackendServices, courseId:string, discussionId:number) {
  services.remote.require(context, ['mod_forum_get_forums_by_courses', 'mod_forum_get_discussion_posts']);
  const forums = await courseForums(context, services, courseId);
  if (forums.length > 100) fail('UNSUPPORTED');
  let found = false;
  for (const forum of forums) {
    const discussions = await forumDiscussions(context, services, forum.id, discussionId);
    if (discussions.has(discussionId)) { found = true; break; }
  }
  if (!found) fail('DENIED');
  const response = await services.remote.call(context, 'mod_forum_get_discussion_posts', {discussionid:String(discussionId), sortby:'created', sortdirection:'ASC'}, postsWire);
  noWarnings(response);
  if (response.posts.some(row => row.discussion !== undefined && row.discussion !== discussionId || row.discussionid !== undefined && row.discussionid !== discussionId)) fail('DENIED');
  return response.posts.filter(row => !row.isdeleted && !row.isprivatereply);
}

export function forumHandlers(services:BackendServices): Pick<BackendHandlers, 'list_forums' | 'get_discussion'> {
  return {
    list_forums:async (context, args) => {
      const forums = await courseForums(context, services, args.courseId);
      const items:{kind:string; id:number; forumId?:number; name:string; author?:string; createdAt?:string | null}[] = [];
      if (forums.length > 100) fail('UNSUPPORTED');
      for (const forum of forums) {
        items.push({kind:'forum', id:forum.id, name:context.text(forum.name, 300)});
        for (const [id, row] of await forumDiscussions(context, services, forum.id)) items.push({kind:'discussion', id, forumId:forum.id, name:context.text(row.name ?? row.subject ?? '', 300), author:context.text(row.userfullname ?? '', 200), createdAt:timestamp(row.created ?? row.timecreated ?? row.timemodified)});
        if (items.length > 10_000) fail('UNSUPPORTED');
      }
      return services.pages.page(items, services.pages.binding('list_forums', context.accountId, args), args);
    },
    get_discussion:async (context, args) => {
      const posts = await discussionPosts(context, services, args.courseId, args.discussionId);
      return services.pages.page(posts.map(row => ({id:row.id, discussionId:args.discussionId, parentId:row.parentid ?? row.parent ?? null, subject:context.text(row.subject ?? '', 300), author:context.text(row.author?.fullname ?? row.userfullname ?? '', 200), createdAt:timestamp(row.timecreated ?? row.created), text:context.text(row.message, 6000)})), services.pages.binding('get_discussion', context.accountId, args), args);
    },
  };
}
