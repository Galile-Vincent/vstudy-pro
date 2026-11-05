/**
 * Regression coverage for db moodle-migration.
 * Owned by main/db.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { migrations } from './migrations';
import { MoodleRepository } from '../moodle/repository';
it('backfills an existing CYCU account and preserves linked course data',() => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const migration of migrations.filter(item => item.version <= 14)) db.exec(migration.sql);
  const account = {id:'11111111-1111-4111-a111-111111111111',schoolId:'cycu',remoteUserId:42,displayName:'Student',status:'expired',syncedAt:null};
  db.prepare('INSERT INTO moodle_accounts VALUES (?,?,?,?)').run(account.id,'cycu',42,JSON.stringify(account));
  db.prepare('INSERT INTO moodle_courses VALUES (?,?,?)').run('course',account.id,'{}');
  db.exec(migrations.find(item => item.version === 15)!.sql);
  expect(new MoodleRepository(db).accounts()).toEqual([{id:'11111111-1111-4111-a111-111111111111',siteUrl:'https://ilearning.cycu.edu.tw',siteName:'中原大學 CYCU',remoteUserId:42,displayName:'Student',status:'expired',syncedAt:null}]);
  expect(db.prepare('SELECT accountId FROM moodle_courses').get()).toEqual({accountId:'11111111-1111-4111-a111-111111111111'});
  db.close();
});

it('migrates old stored courses and persists parsed identity with a cascading detail cache',() => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const migration of migrations.filter(item => item.version <= 16)) db.exec(migration.sql);
  const accountId = '11111111-1111-4111-a111-111111111111';
  const courseId = '22222222-2222-4222-a222-222222222222';
  const account = {id:accountId,siteUrl:'https://ilearning.cycu.edu.tw',siteName:'CYCU',remoteUserId:42,displayName:'Student',status:'connected',syncedAt:null};
  db.prepare('INSERT INTO moodle_accounts VALUES (?,?,?,?)').run(accountId,account.siteUrl,42,JSON.stringify(account));
  db.prepare('INSERT INTO moodle_courses VALUES (?,?,?)').run(courseId,accountId,JSON.stringify({id:courseId,accountId,remoteId:1,fullName:'1142實驗-王老師(資訊)[CS1]',shortName:'1142_CS1',imageUrl:null,progress:null,startAt:null,endAt:null,favourite:false}));
  db.exec(migrations.find(item => item.version === 17)!.sql);
  const repository = new MoodleRepository(db);
  expect(repository.course(courseId).course.identity).toMatchObject({title:{zh:'實驗',en:null},teachers:[{zh:'王老師',en:null}],code:'CS1',term:'1142',hasProgress:false});
  expect(JSON.parse(String(db.prepare('SELECT data FROM moodle_courses').get()!.data)).identity.title).toEqual({zh:'實驗',en:null});
  repository.saveDetail(courseId,{sections:[],announcements:[]});
  expect(repository.detailCache(courseId)?.sections).toEqual([]);
  repository.disconnect(accountId);
  expect(db.prepare('SELECT count(*) AS count FROM moodle_course_details').get()).toEqual({count:0});
  db.close();
});
