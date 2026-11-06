import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {moodleSectionSchema} from '../../shared/moodle-course';
import {conceptKey} from './concept-match';

/** Refresh the study projection from normalized, account-scoped Moodle identities. */
export function syncMoodleStudyUnits(db:DatabaseSync,moodleCourseId:string,now=new Date().toISOString()):void {
 // Moodle-only migration fixtures can predate the study schema.
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='study_courses'").get())return;
 const course=db.prepare('SELECT id FROM study_courses WHERE moodleCourseId=?').get(moodleCourseId);
 if(!course)return;
 const cached=db.prepare('SELECT data FROM moodle_course_details WHERE courseId=?').get(moodleCourseId);
 if(!cached)return;
 const sections=moodleSectionSchema.array().parse(JSON.parse(String(cached.data)).sections??[]).slice(0,500);
 const courseId=String(course.id);
 db.exec('SAVEPOINT study_moodle_sync');
 try {
  // Only Moodle edges are rebuilt; document pseudo-units retain their own mapping.
  db.prepare("DELETE FROM study_document_units WHERE courseId=? AND unitId IN (SELECT id FROM study_units WHERE courseId=? AND kind='moodle')").run(courseId,courseId);
  for(const section of sections){
   const next=sections.filter(s=>s.number>section.number&&s.weekStart).sort((a,b)=>a.number-b.number)[0];
   const title=section.name.trim().slice(0,240)||'Section';
   db.prepare("INSERT INTO study_units(id,courseId,kind,ordinal,title,sourceKey,sourceSectionId,startsAt,endsAt) VALUES(?,?,'moodle',?,?,?,?,?,?) ON CONFLICT(courseId,kind,sourceKey) DO UPDATE SET ordinal=excluded.ordinal,title=excluded.title,startsAt=excluded.startsAt,endsAt=excluded.endsAt").run(randomUUID(),courseId,section.number,title,section.id,section.id,section.weekStart,next?.weekStart??(section.weekStart?new Date(Date.parse(section.weekStart)+7*86400000).toISOString():null));
   const unitId=String(db.prepare("SELECT id FROM study_units WHERE courseId=? AND kind='moodle' AND sourceKey=?").get(courseId,section.id)!.id);
   const key=conceptKey(section.name);
   if(key)db.prepare("INSERT INTO study_concepts(id,courseId,key,label,source,unitId,userState,createdAt) VALUES(?,?,?,?,'heading',?,'none',?) ON CONFLICT(courseId,key) DO NOTHING").run(randomUUID(),courseId,key,title,unitId,now);
   for(const fileId of new Set(section.modules.flatMap(module=>module.fileIds))){
    const file=db.prepare('SELECT f.documentId FROM moodle_files f JOIN documents d ON d.id=f.documentId WHERE f.id=? AND f.courseId=? AND d.deletedAt IS NULL').get(fileId,moodleCourseId);
    if(!file)continue;
    const documentId=String(file.documentId);
    db.prepare('INSERT INTO study_course_documents(courseId,documentId,attachedAt) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(courseId,documentId,now);
    db.prepare('INSERT INTO study_document_units(courseId,documentId,unitId) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(courseId,documentId,unitId);
   }
  }
  db.exec('RELEASE study_moodle_sync');
 }catch(error){db.exec('ROLLBACK TO study_moodle_sync; RELEASE study_moodle_sync');throw error;}
}
