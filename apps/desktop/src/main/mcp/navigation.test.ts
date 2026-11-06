/** Approved navigation is bounded and rechecks account, module, and URL ownership at consumption. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { openStore } from '../db';
import { MoodleRepository } from '../moodle/repository';
import { emptyCourseIdentity, type MoodleModule } from '../../shared/moodle-course';
import { createAgentNavigation } from './navigation';
const stores:ReturnType<typeof openStore>[]=[];
afterEach(()=>{for(const store of stores.splice(0))store.close();});
function fixture() {
  const store=openStore(':memory:');stores.push(store);
  const repository=new MoodleRepository(store.db);
  const account={id:randomUUID(),siteUrl:'https://school.example/moodle',siteName:'School',remoteUserId:42,displayName:'Student',status:'connected' as const,syncedAt:null};
  repository.saveAccount(account);
  const course={id:randomUUID(),accountId:account.id,remoteId:4,fullName:'Course',shortName:'C4',imageUrl:null,progress:null,startAt:null,endAt:null,favourite:false,identity:emptyCourseIdentity('Course')};
  repository.apply(account.id,{courses:[course],deadlines:[],notifications:[],grades:[],files:[]});
  const module:MoodleModule={id:randomUUID(),cmid:5,name:'Page',kind:'page',modname:'page',descriptionHtml:null,url:account.siteUrl+'/mod/page/view.php?id=5',accessible:true,completion:'none',dueAt:null,submitted:null,fileIds:[]};
  const save=(patch:Partial<MoodleModule>={})=>repository.saveDetail(course.id,{sections:[{id:randomUUID(),number:0,name:'General',summaryHtml:null,accessible:true,current:false,weekStart:null,modules:[{...module,...patch}]}]});
  save();let now=0;const restore=vi.fn();
  const navigation=createAgentNavigation(repository,restore,()=>now);
  return {navigation,repository,account,course,module,restore,save,advance:()=>{now+=60_001;}};
}
it('delivers an approved target once and restores the app',()=>{
  const f=fixture();f.navigation.openModule(f.account.id,f.course.id,f.module.id);
  expect(f.restore).toHaveBeenCalledOnce();expect(f.navigation.take()).toEqual({accountId:f.account.id,courseId:f.course.id,moduleId:f.module.id,url:f.module.url});
  expect(f.navigation.take()).toBeNull();
});
it.each(['http://school.example/moodle/mod/page/view.php?id=5','https://school.example/moodle/admin/tool/mobile/launch.php','https://school.example/moodle/mod%2Fpage/view.php?id=5','https://other.example/mod/page/view.php?id=5','https://school.example/moodle-other/page','https://school.example/moodle/mod/page/view.php?id=5&token=hidden'])('denies unsafe targets %s',url=>{
  const f=fixture();f.save({url});expect(()=>f.navigation.openModule(f.account.id,f.course.id,f.module.id)).toThrow();expect(f.navigation.take()).toBeNull();
});
it('drops queued navigation after disconnect, expiry, or explicit clearing',()=>{
  const f=fixture();f.navigation.openModule(f.account.id,f.course.id,f.module.id);f.advance();expect(f.navigation.take()).toBeNull();
  f.navigation.openModule(f.account.id,f.course.id,f.module.id);f.navigation.clear();expect(f.navigation.take()).toBeNull();
  f.navigation.openModule(f.account.id,f.course.id,f.module.id);f.repository.saveAccount({...f.account,status:'expired'});expect(f.navigation.take()).toBeNull();
});
it('denies a different account and a module that became inaccessible',()=>{
  const f=fixture();expect(()=>f.navigation.openModule(randomUUID(),f.course.id,f.module.id)).toThrow();
  f.navigation.openModule(f.account.id,f.course.id,f.module.id);f.save({accessible:false});expect(f.navigation.take()).toBeNull();
});

it('removes URL fragments before renderer delivery',()=>{
  const f=fixture();f.save({url:f.module.url+'#token=private'});f.navigation.openModule(f.account.id,f.course.id,f.module.id);expect(f.navigation.take()?.url).toBe(f.module.url);
});
