import { describe, it, expect, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { MoodleClient, passwordToken, plainText } from './client';
import { verifyCallback } from './callback';
import { allowsLoginNavigation, schools } from './schools';
import { account, fixtureFetch } from './fixtures/support';

describe('Moodle response boundary',() => {
  it('maps the fixture responses into the shared contract',async () => {
    const request = fixtureFetch();
    const client = new MoodleClient(schools[0]!.host,'secret-token',request);
    expect(await client.siteInfo()).toEqual({userid:42,fullname:'Student Example'});
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
    expect(await passwordToken('https://school.example','name','password',request)).toBe('token');
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
    expect(verifyCallback(callback,site,passport)).toBe('token');
    expect(() => verifyCallback(callback,site,'other')).toThrow('Invalid Moodle callback');
    expect(() => verifyCallback(callback,'https://other.example',passport)).toThrow();
    expect(() => verifyCallback(callback.replace('vstudymoodle:','evil:'),site,passport)).toThrow();
    expect(() => verifyCallback('vstudymoodle://token=garbage',site,passport)).toThrow();
  });
  it('restricts navigation to exact configured HTTPS hosts',() => {
    for (const url of ['https://ilearning.cycu.edu.tw/login','https://login.microsoftonline.com/common']) expect(allowsLoginNavigation(schools[0]!,url)).toBe(true);
    for (const url of ['http://ilearning.cycu.edu.tw','https://ilearning.cycu.edu.tw.evil.example','https://login.microsoftonline.com@evil.example','https://evil.example','file:///etc/passwd','https://ilearning.cycu.edu.tw:444']) expect(allowsLoginNavigation(schools[0]!,url)).toBe(false);
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
    expect(verifyCallback(`vstudymoodle://token=${Buffer.from(`${signature}:::token`).toString('base64')}`,'https://school.example','passport')).toBe('token');
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
it('keeps an assignment visible when submission status is unavailable',async () => {
  const client = new MoodleClient(schools[0]!.host,'token',fixtureFetch({mod_assign_get_submission_status:{errorcode:'requireloginerror'}}));
  expect((await client.assignments(account.id,await client.courses(account)))[0]!.submitted).toBe(false);
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
