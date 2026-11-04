import { describe, it, expect, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { MoodleClient, passwordToken, plainText } from './client';
import { verifyCallback } from './callback';
import { schools } from './schools';
import { account, fixtureFetch } from './fixtures/support';

describe('Moodle response boundary',() => {
  it('maps the fixture responses into the shared contract',async () => {
    const request = fixtureFetch();
    const client = new MoodleClient(schools[0]!.host,'secret-token',request);
    expect(await client.siteInfo()).toEqual({userid:42,fullname:'Student Example',siteurl:'https://ilearning.cycu.edu.tw',advancedfeatures:[]});
    const courses = await client.courses(account);
    expect(courses[0]).toMatchObject({fullName:'Algorithms',shortName:'CS & Math',progress:42.5,favourite:true,endAt:null});
    expect(await client.assignments(account.id,courses)).toMatchObject([{title:'Homework 1',kind:'assignment',dueAt:'2026-11-07T00:00:00.000Z'}]);
    expect(await client.events(account.id,courses)).toMatchObject([{title:'Class event',kind:'event',submitted:false},{title:'Quiz & review',kind:'quiz',submitted:true}]);
    expect(await client.notifications(account,courses)).toMatchObject([{remoteId:501,value:{subject:'Prepare',body:'Read chapter <2>',read:false,courseId:courses[0]!.id}}]);
    expect(await client.grades(courses[0]!,42)).toMatchObject([{remoteKey:'601',value:{grade:'8',max:10,percentage:80}}]);
    expect(await client.files(courses[0]!)).toMatchObject([{value:{name:'lecture.pdf',section:'Week 1',documentId:null,size:123}}]);
    expect(String(request.mock.calls[0]![0])).not.toContain('secret-token');
    expect(String(request.mock.calls[0]![1]?.body)).toContain('wstoken=secret-token');
    expect(request.mock.calls[0]![1]?.redirect).toBe('error');
  });
  it('uses course, calendar and read-status notification fallbacks',async () => {
    const unsupported = {errorcode:'functionnotavailable'};
    const request = fixtureFetch({'core_enrol_get_users_courses':unsupported,'core_calendar_get_action_events_by_timesort':unsupported});
    const base = request.getMockImplementation()!;
    request.mockImplementation(async (target,options) => {
      const params = new URLSearchParams(String(options?.body));
      if (params.get('wsfunction') === 'core_message_get_messages' && params.get('read') === '2') return Response.json(unsupported);
      return base(target,options);
    });
    const client = new MoodleClient(schools[0]!.host,'token',request);
    const courses = await client.courses(account);
    expect(courses[0]!.shortName).toBe('CS');
    expect(await client.events(account.id,courses)).toMatchObject([{title:'Class event',kind:'event'}]);
    expect(await client.notifications(account,courses)).toHaveLength(1);
    expect(request.mock.calls.map(call => String(call[1]?.body))).toEqual(expect.arrayContaining([expect.stringContaining('read=0'),expect.stringContaining('read=1')]));
  });
  it('accepts Moodle numeric strings while rejecting nonnumeric fields',async () => {
    const client = new MoodleClient(schools[0]!.host,'token',fixtureFetch({'core_enrol_get_users_courses':[{id:'101',fullname:'Course',shortname:'CS',progress:'42.5',isfavourite:'0'}]}));
    expect(await client.courses(account)).toMatchObject([{remoteId:101,progress:42.5,favourite:false}]);
    await expect(new MoodleClient(schools[0]!.host,'token',fixtureFetch({'core_webservice_get_site_info':{userid:'NaN',fullname:'User'}})).siteInfo()).rejects.toThrow('service');
  });
  it('rejects HTTP-200 auth errors and malformed payloads without leaking server text',async () => {
    const request = fixtureFetch({'core_webservice_get_site_info':{errorcode:'invalidtoken',message:'secret-token'}});
    await expect(new MoodleClient(schools[0]!.host,'secret-token',request).siteInfo()).rejects.toMatchObject({kind:'auth',message:'Moodle auth error'});
    await expect(new MoodleClient(schools[0]!.host,'token',fixtureFetch({'core_webservice_get_site_info':{userid:'bad'}})).siteInfo()).rejects.toThrow('Moodle service error');
  });
  it('posts credentials only to the token endpoint',async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({token:'token'}));
    expect(await passwordToken('https://school.example','name','password',request)).toEqual({token:'token'});
    expect(request.mock.calls[0]![0]).toBe('https://school.example/login/token.php');
    expect(String(request.mock.calls[0]![1]?.body)).toBe('username=name&password=password&service=moodle_mobile_app');
  });
  it('strips multilang markers, HTML and script contents',() => {
    expect(plainText('{mlang en}<p>Hello&nbsp; world</p>{mlang}<style>bad</style>')).toBe('Hello world');
  });
});
describe('SSO callback',() => {
  it('accepts only the expected site and passport signature',() => {
    const site = schools[0]!.host, passport = randomUUID();
    const signature = createHash('md5').update(site + passport).digest('hex');
    const callback = `vstudymoodle://token=${Buffer.from(`${signature}:::token:::private`).toString('base64')}`;
    expect(verifyCallback(callback,site,passport)).toEqual({token:'token',privateToken:'private'});
    expect(() => verifyCallback(callback,site,'other')).toThrow('Invalid Moodle callback');
    expect(() => verifyCallback(callback,'https://other.example',passport)).toThrow();
    expect(verifyCallback(callback.replace('vstudymoodle:','cycuilearning:'),site,passport)).toEqual({token:'token',privateToken:'private'});
    expect(() => verifyCallback('vstudymoodle://token=garbage',site,passport)).toThrow();
  });

});

it('accepts nullable optional Moodle fields',async () => {
  const client = new MoodleClient(schools[0]!.host,'token',fixtureFetch({
    core_enrol_get_users_courses:[{id:101,fullname:'Course',shortname:'CS',startdate:null}],
    core_message_get_messages:{messages:[{id:1,timecreated:1700000000,timeread:null,fullmessage:null}]},
    core_course_get_contents:[{id:1,name:null,modules:[{id:2,name:'Module',contents:[{type:'file',filename:'a.pdf',fileurl:'https://ilearning.cycu.edu.tw/pluginfile.php/1/a.pdf'}]}]}],
  }));
  const courses = await client.courses(account);
  expect(courses[0]!.startAt).toBe(null);
  expect((await client.notifications(account,courses))[0]!.value.read).toBe(false);
  expect((await client.files(courses[0]!))[0]!.value.section).toBe('');
});

it('accepts all four Swift callback site variants',() => {
  for (const site of ['https://school.example','https://school.example/','http://school.example','http://school.example/']) {
    const signature = createHash('md5').update(site + 'passport').digest('hex');
    expect(verifyCallback(`vstudymoodle://token=${Buffer.from(`${signature}:::token`).toString('base64')}`,'https://school.example','passport')).toEqual({token:'token'});
  }
});
it('uses submission and attempt status rather than actionability',async () => {
  const client = new MoodleClient(schools[0]!.host,'token',fixtureFetch({
    mod_assign_get_submission_status:{lastattempt:{submission:{status:'submitted'}}},
    core_calendar_get_action_events_by_timesort:{events:[{id:401,name:'Quiz',courseid:101,timesort:1794096000,modulename:'quiz',instance:55,action:{actionable:false}}]},
    mod_quiz_get_user_attempts:{attempts:[{state:'inprogress'}]},
  }));
  const courses = await client.courses(account);
  expect((await client.assignments(account.id,courses))[0]!.submitted).toBe(true);
  expect((await client.events(account.id,courses)).find(item => item.kind === 'quiz')!.submitted).toBe(false);
});
it('keeps an unknown submission status when the check fails',async () => {
  const client = new MoodleClient(schools[0]!.host,'token',fixtureFetch({mod_assign_get_submission_status:{errorcode:'functionnotavailable'}}));
  expect((await client.assignments(account.id,await client.courses(account)))[0]!.submitted).toBe(null);
});
it('resolves assignment calendar event submission status when no assignment list is available',async () => {
  const client = new MoodleClient(schools[0]!.host,'token',fixtureFetch({
    core_calendar_get_action_events_by_timesort:{events:[{id:401,name:'Assignment',courseid:101,timesort:1794096000,modulename:'assign',instance:201,action:{actionable:false}}]},
    mod_assign_get_submission_status:{lastattempt:{submission:{status:'submitted'}}},
  }));
  const events = await client.events(account.id,await client.courses(account));
  expect(events.find(item => item.kind === 'assignment')!.submitted).toBe(true);
});
it('classifies only exact error codes at each call boundary',async () => {
  for (const code of ['requireloginerror','nopermissiontoviewgrades','invalidparameter']) {
    const client = new MoodleClient(schools[0]!.host,'token',fixtureFetch({core_webservice_get_site_info:{errorcode:code,message:'invalid token function is not available'}}));
    await expect(client.siteInfo()).rejects.toMatchObject({kind:code === 'requireloginerror' ? 'auth' : 'service'});
  }
});
it('fetches ordinary calendar events alongside action events',async () => {
  const client = new MoodleClient(schools[0]!.host,'token',fixtureFetch());
  expect((await client.events(account.id,await client.courses(account))).map(item => item.title)).toEqual(['Class event','Quiz & review']);
});
it('requests a fourteen-day action window and loads historical assignments on demand',async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-04T00:00:00Z'));
  try {
    const request = fixtureFetch(); const client = new MoodleClient(schools[0]!.host,'token',request);
    const courses = await client.courses(account); await client.events(account.id,courses);
    const params = new URLSearchParams(String(request.mock.calls.find(call => String(call[1]?.body).includes('wsfunction=core_calendar_get_action_events_by_timesort'))![1]?.body));
    expect(params.get('timesortfrom')).toBe('1792540800');
    expect(params.get('limittononsuspendedevents')).toBe('1');
    request.mockClear();
    expect(await client.assignments(account.id,[{...courses[0]!,endAt:'2020-01-01T00:00:00.000Z'}])).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});

it('uses timeline lastid rather than the final event ID',async () => {
  const request = fixtureFetch(); const base = request.getMockImplementation()!;
  request.mockImplementation(async (target,options) => {
    const params = new URLSearchParams(String(options?.body));
    if (params.get('wsfunction') === 'core_calendar_get_action_events_by_timesort') return Response.json(params.has('aftereventid') ? {events:[],lastid:900} : {events:Array.from({length:50},(_,index) => ({id:index+1,name:'Event',courseid:101,timesort:1794096000})),lastid:900});
    return base(target,options);
  });
  const client = new MoodleClient(account.siteUrl,'token',request);
  expect((await client.events(account.id,await client.courses(account))).length).toBe(51);
  expect(request.mock.calls.filter(call => String(call[1]?.body).includes('aftereventid')).map(call => new URLSearchParams(String(call[1]?.body)).get('aftereventid'))).toEqual(['900']);
});
it('uses popup notifications only after message notifications are unsupported',async () => {
  const request = fixtureFetch({core_message_mark_notification_read:{},core_message_get_messages:{errorcode:'functionnotavailable'},message_popup_get_popup_notifications:{notifications:[{id:501,subject:'Popup',timecreated:1794096000}]}});
  const client = new MoodleClient(account.siteUrl,'token',request);
  expect(await client.notifications(account,[])).toMatchObject([{remoteId:501,value:{subject:'Popup',source:'popup',read:false}}]);
  await client.markRead(501);
  expect(new URLSearchParams(String(request.mock.calls.at(-1)?.[1]?.body)).get('wsfunction')).toBe('core_message_mark_notification_read');
  const primary = fixtureFetch();
  await new MoodleClient(account.siteUrl,'token',primary).notifications(account,[]);
  expect(primary.mock.calls.map(call => new URLSearchParams(String(call[1]?.body)).get('wsfunction'))).toEqual(['core_message_get_messages']);
});

it('paginates popup rows with offset and limit while keeping duplicate notification IDs separate from message fetches',async () => {
  const request = fixtureFetch({core_message_get_messages:{errorcode:'functionnotavailable'}}), base = request.getMockImplementation()!;
  request.mockImplementation(async (target,options) => {
    const params = new URLSearchParams(String(options?.body));
    if (params.get('wsfunction') === 'message_popup_get_popup_notifications') return Response.json({notifications:params.get('offset') === '0' ? Array.from({length:100},(_,index) => ({id:index+1,subject:'Popup',timecreated:1794096000})) : [{id:1,subject:'Duplicate popup',timecreated:1794096000}]});
    return base(target,options);
  });
  const records = await new MoodleClient(account.siteUrl,'token',request).notifications(account,[]);
  expect(records.length).toBe(100);
  expect(records[0]?.value).toMatchObject({subject:'Duplicate popup',source:'popup'});
  expect(request.mock.calls.filter(call => String(call[1]?.body).includes('wsfunction=message_popup_get_popup_notifications')).map(call => {
    const params = new URLSearchParams(String(call[1]?.body));return {offset:params.get('offset'),limit:params.get('limit'),newestfirst:params.get('newestfirst')};
  })).toEqual([{offset:'0',limit:'100',newestfirst:'1'},{offset:'100',limit:'100',newestfirst:'1'}]);
});

describe('rich course data',() => {
 it('pages and deduplicates timeline buckets and prefers server classification',async () => {
  const request = vi.fn<typeof fetch>(async (_url,options) => {
   const params = new URLSearchParams(String(options?.body));
   if (params.get('wsfunction') === 'core_enrol_get_users_courses') return Response.json([{id:1,fullname:'1151未來課(CS)[X]',shortname:'1151_X',startdate:0,enddate:0}]);
   const classification = params.get('classification');
   if (classification !== 'past') return Response.json({courses:[],nextoffset:0});
   return Response.json({courses:params.get('offset') === '0' ? [{id:1,fullname:'1151未來課(CS)[X]',shortname:'1151_X',hidden:1,isfavourite:1}] : [{id:1,fullname:'1151未來課(CS)[X]',shortname:'1151_X',hidden:1,isfavourite:1},{id:2,fullname:'Second',shortname:'S'}],nextoffset:2});
  });
  const client = new MoodleClient(account.siteUrl,'token',request);
  client.setFunctions(['core_enrol_get_users_courses','core_course_get_enrolled_courses_by_timeline_classification']);
  expect((await client.courses(account)).map(course => ({remoteId:course.remoteId,startAt:course.startAt,endAt:course.endAt,favourite:course.favourite,lifecycle:course.identity.lifecycle,source:course.identity.lifecycleSource,hidden:course.identity.hidden}))).toEqual([
   {remoteId:1,startAt:null,endAt:null,favourite:true,lifecycle:'past',source:'server',hidden:true},
   {remoteId:2,startAt:null,endAt:null,favourite:false,lifecycle:'past',source:'server',hidden:false},
  ]);
 });
 it('requests filtered app-language data and retries an older server without lang',async () => {
  const request = vi.fn<typeof fetch>(async (_url,options) => {
   const params = new URLSearchParams(String(options?.body));
   return Response.json(params.has('moodlewssettinglang') ? {errorcode:'invalidparameter',message:'Unexpected moodlewssettinglang parameter'} : {userid:42,fullname:'Student'});
  });
  const client = new MoodleClient(account.siteUrl,'token',request); client.setLanguage('ja');
  expect(await client.siteInfo()).toEqual({userid:42,fullname:'Student',advancedfeatures:[]});
  expect(request.mock.calls.map(call => { const p = new URLSearchParams(String(call[1]?.body)); return [p.get('moodlewssettingfilter'),p.get('moodlewssettinglang')]; })).toEqual([['1','ja'],['1',null]]);
 });
 it('deduplicates teachers and prefers editingteacher over teacher and students',async () => {
  const request = fixtureFetch({'core_completion_get_activities_completion_status':{statuses:[{cmid:8,state:2,tracking:1}]},'core_enrol_get_enrolled_users':[{id:1,fullname:'123 王老師',roles:[{shortname:'editingteacher'}]},{id:1,fullname:'123 王老師',roles:[{shortname:'editingteacher'}]},{id:2,fullname:'Teacher',roles:[{shortname:'teacher'}]},{id:3,fullname:'Student',roles:[{shortname:'student'}]}]});
  const client = new MoodleClient(account.siteUrl,'token',request);
  const course = (await client.courses(account))[0]!;
  expect(await client.teachers(course)).toEqual([{zh:'王老師',en:null}]);
  expect(await client.completion(course,42)).toEqual([{cmid:8,state:2,tracking:1}]);
 });
 it('finds news forums, falls back to paginated discussions, sanitizes and fetches missing post bodies',async () => {
  const request = fixtureFetch({
   mod_forum_get_forums_by_courses:[{id:1,type:'general',name:'Chat'},{id:2,type:'news',name:'News'}],
   mod_forum_get_forum_discussions:{errorcode:'functionnotavailable'},
   mod_forum_get_forum_discussions_paginated:{discussions:[{id:100,discussion:20,name:'New',created:1730000000,userfullname:'123 Teacher'},{id:101,discussion:19,name:'Old',created:1720000000,message:'<p onclick="evil()">Old</p>'},{id:102,discussion:20,name:'Duplicate',created:1730000000}]},
   mod_forum_get_discussion_posts:{posts:[{id:100,parent:0,message:'<script>bad</script><p>Body<img src="https://site/?token=secret"></p>'}]},
  });
  const client = new MoodleClient(account.siteUrl,'token',request);
  const course = (await client.courses(account))[0]!;
  expect((await client.announcements(course)).map(row => ({subject:row.subject,author:row.author,body:row.bodyHtml,url:row.url}))).toEqual([
   {subject:'New',author:'Teacher',body:'<p>Body</p>',url:'https://ilearning.cycu.edu.tw/mod/forum/discuss.php?d=20'},
   {subject:'Old',author:'',body:'<p>Old</p>',url:'https://ilearning.cycu.edu.tw/mod/forum/discuss.php?d=19'},
  ]);
 });
});

it('maps quiz due dates and finished attempts to module extras without inventing zero dates',async () => {
  const client = new MoodleClient(account.siteUrl,'token',fixtureFetch({mod_quiz_get_quizzes_by_courses:{quizzes:[{id:1,name:'Quiz',coursemodule:22,timeclose:1730000000},{id:2,name:'Undated',coursemodule:23,timeclose:0}]},mod_quiz_get_user_attempts:{attempts:[{state:'finished'}]}}));
  const course = (await client.courses(account))[0]!;
  expect(await client.quizDeadlines(course)).toMatchObject([{title:'Quiz',dueAt:'2024-10-27T03:33:20.000Z',submitted:true,url:'https://ilearning.cycu.edu.tw/mod/quiz/view.php?id=22'}]);
  expect((await client.quizDeadlines(course)).length).toBe(1);
});
