import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { migrations } from './index';
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
