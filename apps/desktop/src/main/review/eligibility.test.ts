/** Keep SQL claim/read fences equivalent to the pure provenance predicate. @packageDocumentation */
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { eligibleSourceSql, isEligibleSource, type EligibleSource } from './eligibility';
const baseline:EligibleSource = {
  conversation:{id:'c',deletedAt:null,documentId:'d'},document:{id:'d',deletedAt:null},
  user:{id:'u',conversationId:'c',role:'user',supersededBy:null,parts:[{type:'text',text:'q'}]},
  assistant:{id:'a',conversationId:'c',role:'assistant',supersededBy:null,parts:[{type:'text',text:'answer',status:'complete'}]},
  link:{courseId:'course',revision:2,excludeFromMemory:false,confirmed:true,confidence:1},
  courseId:'course',assignmentRevision:2,
};
it.each([
  ['eligible', {}],
  ['stale assignment', {assignmentRevision:1}],
  ['removed course', {courseId:null}],
  ['deleted chat', {conversation:{...baseline.conversation,deletedAt:'deleted'}}],
  ['deleted document', {document:{id:'d',deletedAt:'deleted'}}],
  ['missing document', {document:null}],
  ['wrong user role', {user:{...baseline.user,role:'assistant'}}],
  ['wrong conversation', {assistant:{...baseline.assistant,conversationId:'other'}}],
  ['superseded user', {user:{...baseline.user,supersededBy:'new'}}],
  ['excluded context', {user:{...baseline.user,parts:[{type:'text',text:'q',contextExcluded:true}]}}],
  ['aborted answer', {assistant:{...baseline.assistant,parts:[{type:'text',text:'a',status:'aborted'}]}}],
  ['failed answer', {assistant:{...baseline.assistant,parts:[{type:'text',text:'a',error:'failed'}]}}],
  ['unicode whitespace answer', {assistant:{...baseline.assistant,parts:[{type:'text',text:'\n\t\u3000'}]}}],
  ['empty answer', {assistant:{...baseline.assistant,parts:[{type:'text',text:'  '}]}}],
  ['excluded memory', {link:{...baseline.link,excludeFromMemory:true}}],
  ['legacy complete answer', {assistant:{...baseline.assistant,parts:[{type:'text',text:'a'}]}}],
] satisfies [string,Partial<EligibleSource>][])('SQL/pure source policy: %s', (_label,patch) => {
  const s = {...baseline,...patch};
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE conversations(id,deletedAt,documentId); CREATE TABLE documents(id,deletedAt); CREATE TABLE messages(id,conversationId,role,supersededBy,parts); CREATE TABLE links(courseId,revision,excludeFromMemory); CREATE TABLE jobs(courseId,assignmentRevision)');
    db.prepare('INSERT INTO conversations VALUES(?,?,?)').run(s.conversation.id,s.conversation.deletedAt,s.conversation.documentId);
    if (s.document) db.prepare('INSERT INTO documents VALUES(?,?)').run(s.document.id,s.document.deletedAt);
    for (const m of [s.user,s.assistant]) db.prepare('INSERT INTO messages VALUES(?,?,?,?,?)').run(m.id,m.conversationId,m.role,m.supersededBy,JSON.stringify(m.parts));
    db.prepare('INSERT INTO links VALUES(?,?,?)').run(s.link.courseId,s.link.revision,Number(s.link.excludeFromMemory));
    db.prepare('INSERT INTO jobs VALUES(?,?)').run(s.courseId,s.assignmentRevision);
    const row = db.prepare(`SELECT 1 FROM jobs j JOIN conversations c LEFT JOIN documents d ON d.id=c.documentId JOIN messages u ON u.id='u' JOIN messages a ON a.id='a' JOIN links l WHERE ${eligibleSourceSql}`).get();
    expect(!!row).toBe(isEligibleSource(s));
  } finally { db.close(); }
});
