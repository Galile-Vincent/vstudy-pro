/**
 * Regression coverage for moodle perf.
 * Owned by main/moodle.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { it, expect } from 'vitest';
import { createServer, request as httpsRequest, Agent } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../db';
import { MoodleRepository } from './repository';
import { MoodleService } from './service';
import { account, fixture } from './fixtures/support';
import type { SecretStore } from '../services/secrets';

it.skipIf(!process.env.MOODLE_PERF_OUTPUT)('benchmarks cold sync and the home detail fan-out over local TLS', async () => {
  const directory = mkdtempSync(join(tmpdir(),'moodle-perf-'));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-subj','/CN=localhost','-days','1'],{stdio:'ignore'});
  const rtt = Number(process.env.MOODLE_PERF_RTT ?? 120);
  const courses = Array.from({length:47},(_,i) => ({id:101+i,fullname:`Course ${i}`,shortname:`C${i}`,startdate:Math.floor(Date.now()/1000)-86400,enddate:i < 6 ? 0 : Math.floor(Date.now()/1000)-30*86400}));
  const counts: Record<string,number> = {};
  let bytes = 0;
  const server = createServer({key:readFileSync(join(directory,'key.pem')),cert:readFileSync(join(directory,'cert.pem'))},(req,res) => {
    let body = '';
    req.on('data',chunk => { body += chunk; });
    req.on('end',() => {
      const args = new URLSearchParams(body), name = args.get('wsfunction')!;
      counts[name] = (counts[name] ?? 0)+1;
      let value = fixture[name];
      if (name === 'core_webservice_get_site_info') value = {...fixture[name] as object,functions:[...Object.keys(fixture),'core_enrol_get_enrolled_users','mod_forum_get_forums_by_courses'].filter(n => n !== 'core_course_get_enrolled_courses_by_timeline_classification').map(name => ({name}))};
      if (name === 'core_enrol_get_users_courses') value = courses;
      if (name === 'core_course_get_contents') value = Array.from({length:16},(_,section) => ({id:section+1,section,name:`Week ${section}`,modules:Array.from({length:8},(_,m) => ({id:section*8+m+1,name:`Resource ${m}`,modname:'page',url:'https://ilearning.cycu.edu.tw/mod/page/view.php?id=1',description:'<p>Learning material</p>'.repeat(30),contents:[]}))}));
      if (name === 'mod_assign_get_assignments') value = {courses:[{id:Number(args.get('courseids[0]')),assignments:Array.from({length:8},(_,i) => ({id:200+i,name:`Homework ${i}`,duedate:Math.floor(Date.now()/1000)+86400,cmid:300+i}))}]};
      if (name === 'core_enrol_get_enrolled_users') value = [{id:1,fullname:'Teacher',roles:[{shortname:'editingteacher'}]}];
      if (name === 'mod_forum_get_forums_by_courses') value = [];
      const payload = JSON.stringify(value ?? {errorcode:'functionnotavailable'});
      bytes += Buffer.byteLength(payload);
      setTimeout(() => {res.setHeader('Content-Type','application/json');res.end(payload);},rtt+5);
    });
  });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No TLS port');
  const agent = new Agent({keepAlive:true,maxSockets:6,rejectUnauthorized:false});
  const transport: typeof fetch = async (_url,options) => new Promise((resolve,reject) => {
    const req = httpsRequest({hostname:'127.0.0.1',port:address.port,path:'/webservice/rest/server.php',method:'POST',agent,rejectUnauthorized:false},res => {
      const chunks: Buffer[] = [];
      res.on('data',chunk => chunks.push(chunk));
      res.on('end',() => resolve(new Response(Buffer.concat(chunks),{status:res.statusCode!})));
    });
    req.on('error',reject);req.end(String(options?.body));
  });
  try {
    for (let run=0;run<5;run++) {
      for (const name of Object.keys(counts)) delete counts[name];
      bytes=0;
      const store=openStore(':memory:'), repo=new MoodleRepository(store.db);
      repo.saveAccount(account);
      const secrets={getInMainOnly:async () => 'test-token',set:async () => {},delete:() => {}} as unknown as SecretStore;
      const service=new MoodleService(repo,secrets,{login:async () => {throw new Error('unused');}},transport);
      const started=performance.now();
      let listMs=0;
      const timer=setInterval(() => {if (!listMs && repo.overview().courses.length) listMs=performance.now()-started;},5);
      const result=await service.sync(account.id);
      const syncMs=performance.now()-started;
      const rows=repo.overview().courses;
      expect(rows).toHaveLength(47);expect(result.errors).toEqual([]);
      const opened=performance.now();
      const detail=await service.course(rows[0]!.id);
      const contentMs=performance.now()-opened;
      expect(detail.sections).toHaveLength(16);
      const homeStarted=performance.now();
      if (process.env.MOODLE_PERF_HOME_FANOUT === '1') await Promise.all(rows.map(row => service.course(row.id)));
      const homeMs=performance.now()-homeStarted;
      clearInterval(timer);
      await service.dispose();
      appendFileSync(process.env.MOODLE_PERF_OUTPUT!,JSON.stringify({run,rtt,syncMs,listMs,contentMs,homeMs,calls:Object.values(counts).reduce((a,b)=>a+b,0),bytes,counts})+'\n');
      store.close();
    }
  } finally {agent.destroy();await new Promise<void>(resolve => server.close(() => resolve()));rmSync(directory,{recursive:true,force:true});}
},300000);
