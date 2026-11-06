import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { openStore } from '../db';
import { excerptKind } from './source-kind';

it.each([['assignment','assign','assignment'],['quiz','quiz','exam'],['resource','resource',undefined]])('reads %s kind from the linked Moodle module', (kind,modname,expected) => {
 const store=openStore(':memory:');
 try {
  const account=randomUUID(),course=randomUUID(),file=randomUUID(),document=randomUUID();
  store.db.prepare("INSERT INTO moodle_accounts(id,siteUrl,remoteUserId,data) VALUES(?,'school',1,'{}')").run(account);
  store.db.prepare("INSERT INTO moodle_courses(id,accountId,data) VALUES(?,?,'{}')").run(course,account);
  store.db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) VALUES(?,'Text','text.md',?,'/tmp/source','text/markdown','ready','/tmp/content','2026-11-06T00:00:00Z')").run(document,document);
  store.db.prepare("INSERT INTO moodle_files(id,courseId,url,data,documentId) VALUES(?,?,'https://example.edu/file','{}',?)").run(file,course,document);
  store.db.prepare('INSERT INTO moodle_course_details(courseId,data) VALUES(?,?)').run(course,JSON.stringify({sections:[{modules:[{kind,modname,fileIds:[file]}]}]}));
  expect(excerptKind(store.db,document)).toBe(expected);
  expect(excerptKind(store.db,randomUUID())).toBeUndefined();
 } finally {store.close();}
});
