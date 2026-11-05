/** The client cache whitelist excludes credential-bearing and mutating calls. */
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { openStore } from '../db';
import { MoodleClient } from '../moodle/client';
import { responseCache } from './index';
it('shares validated read requests while keeping private site info, config and mutations out of SQLite',async()=>{
  const store=openStore(':memory:');
  try {
    store.db.prepare('INSERT INTO moodle_accounts VALUES(?,?,?,?)').run('account','https://school.example',1,'{}');
    const request=vi.fn<typeof fetch>(async(_url,options)=>{
      const name=new URLSearchParams(String(options?.body)).get('wsfunction');
      return Response.json(name==='core_enrol_get_users_courses' ? 'courses' : {userprivateaccesskey:'private',settings:[{name:'token',value:'private'}]});
    });
    const client=new MoodleClient('https://school.example','request-token',request);client.setCache(responseCache(store.db),'account');
    expect(await Promise.all(Array.from({length:10},()=>client.call('core_enrol_get_users_courses',{},z.string())))).toEqual(Array(10).fill('courses'));
    expect(request).toHaveBeenCalledTimes(1);
    for(const name of ['core_webservice_get_site_info','tool_mobile_get_config','core_message_mark_notification_read']){
      await client.call(name,{},z.unknown());await client.call(name,{},z.unknown());
    }
    expect(request).toHaveBeenCalledTimes(7);
    const rows=store.db.prepare('SELECT data FROM moodle_response_cache').all();expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('private');expect(JSON.stringify(rows)).not.toContain('request-token');
  } finally {store.close();}
});
