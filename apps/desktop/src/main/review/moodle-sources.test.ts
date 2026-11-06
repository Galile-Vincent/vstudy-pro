import {expect,it} from 'vitest';
import {randomUUID as uuid} from 'node:crypto';
import {fixture} from './regression-fixture';
import {MoodleRepository} from '../moodle/repository';
import {account} from '../moodle/fixtures/support';
import {parseCourseIdentity} from '../moodle/identity';
import {resolveScope} from './scope';
import type {MoodleSection} from '../../shared/moodle-course';
it.each(['materialize','link','sync','download','normal-link'] as const)('maps Moodle week sources during %s',mode=>{
 const f=fixture();try{
  const moodle=new MoodleRepository(f.store.db);moodle.saveAccount(account);
  const course={id:uuid(),accountId:account.id,remoteId:1,fullName:'Physics',shortName:'P',imageUrl:null,progress:null,startAt:null,endAt:null,favourite:false,identity:parseCourseIdentity('Physics','P',false)};
  const file={id:uuid(),courseId:course.id,section:'Energy',module:'Lecture',name:'text.md',mime:'text/markdown',size:1,modifiedAt:null,documentId:null};
  const files=[{url:'https://example.com/text',value:file}];
  const snapshot={courses:[course],files,deadlines:[],notifications:[],grades:[]};
  moodle.apply(account.id,snapshot);
  const section:MoodleSection={id:uuid(),number:1,name:'Energy',summaryHtml:null,accessible:true,current:false,weekStart:'2026-09-06T00:00:00.000Z',modules:[{id:uuid(),cmid:1,kind:'resource',modname:'resource',name:'Lecture',descriptionHtml:null,url:null,accessible:true,completion:'none',dueAt:null,submitted:null,fileIds:[file.id]}]};
  const next={...section,id:uuid(),number:2,name:'Next',weekStart:'2026-09-13T00:00:00.000Z',modules:[]};
  if(mode!=='sync')moodle.saveDetail(course.id,{sections:[section,next]});
  if(mode!=='download')moodle.linkFile(file.id,f.d,file);
  const study=mode==='link'?f.r.linkMoodle(f.c.id,course.id):f.r.materializeMoodleCourse(course.id);
  if(mode==='sync')moodle.saveDetail(course.id,{sections:[section,next]},files);
  if(mode==='download')moodle.linkFile(file.id,f.d,file);
  if(mode==='normal-link'){
   f.store.db.prepare("DELETE FROM study_document_units WHERE courseId=?").run(study.id);
   f.r.linkDocument(study.id,f.d);
  }
  const unit=f.r.listUnits({courseId:study.id}).items.find(u=>u.sourceKey===section.id)!;
  for(const scope of [{kind:'units' as const,unitIds:[unit.id]},{kind:'concepts' as const,conceptKeys:['energy']},{kind:'dates' as const,fromDate:'2026-09-06',toDate:'2026-09-07',timeZone:'UTC'}]){
   const result=resolveScope(scope,f.a.scopeInputs(study.id,scope));expect(result.status).toBe('resolved');expect(result.snapshot.documentIds).toContain(f.d);
  }
  expect(f.store.db.prepare('SELECT count(*) n FROM study_document_units WHERE courseId=? AND unitId=? AND documentId=?').get(study.id,unit.id,f.d)?.n).toBe(1);
 }finally{f.store.close();}
});
