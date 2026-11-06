/** Private review tables never join Moodle tools, FTS or planner projections. @packageDocumentation */
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { documentSchema } from '../../shared/domain';
import { mcpTools, type ToolArguments } from '../../shared/mcp';
import { ReviewRepository } from '../review/repository';
import { backendHarness, accountA, courseA, fileA } from './backend-test-support';
import { BackendContext } from './backend-context';
import { BackendPages } from './backend-page';
import { BackendRemote } from './backend-remote';
import { cachedHandlers } from './backend-cached';
import { searchHandler } from './backend-search';
import { plannerHandlers } from './backend-planner';
import type { BackendServices } from './backend-types';
const harnesses:Awaited<ReturnType<typeof backendHarness>>[]=[];
afterEach(async()=>{for(const h of harnesses.splice(0))await h.close();});
it('get_course, search_content, read_file and get_planner never return private study data',async()=>{
 const h=await backendHarness();harnesses.push(h);
 const review=new ReviewRepository(h.store.db);
 const secret='STUDYPRIVATECANARY';
 const course=review.createCourse({title:secret,aliases:[secret]});
 review.linkMoodle(course.id,courseA);
 const publicDocument=h.document();
 const localDocument=documentSchema.parse({...publicDocument,id:randomUUID(),title:secret,sourceHash:'b'.repeat(64)});
 h.store.documents.insert(localDocument);
 const stamp='2026-11-06T00:00:00.000Z';
 const chat=randomUUID(),user=randomUUID(),assistant=randomUUID(),job=randomUUID();
 h.store.db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt) VALUES(?,'general','p','m',?)").run(chat,stamp);
 for(const [id,role] of [[user,'user'],[assistant,'assistant']])h.store.db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES(?,?,?,?,?)').run(id!,chat,role!,JSON.stringify([{type:'text',text:secret}]),stamp);
 review.assignChat(chat,course.id);
 h.store.db.prepare("INSERT INTO study_jobs(id,conversationId,userMessageId,assistantMessageId,extractorVersion,courseId,assignmentRevision,questionSummary,occurredAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,1,?,?,?,?)").run(job,chat,user,assistant,'v1',course.id,secret,stamp,stamp,stamp);
 h.store.db.prepare("INSERT INTO study_observations(id,jobId,courseId,proposedLabel,errorType,signal,evidenceQuote,weaknessNote,confidence,createdAt) VALUES(?,?,?,?,'gap','confused',?,?,1,?)").run(randomUUID(),job,course.id,secret,secret,secret,stamp);
 h.store.db.prepare("INSERT INTO study_artifacts(id,courseId,kind,title,scopeJson,resolvedScopeJson,status,idempotencyKey,attemptToken,bodyMarkdown,providerId,modelId,promptVersion,createdAt) VALUES(?,?,'note',?,'{}','{}','ready',?,?,?,'p','m','v1',?)").run(randomUUID(),course.id,secret,randomUUID(),randomUUID(),secret,stamp);
 const before=h.store.db.prepare('SELECT count(*) n FROM moodle_files').get()!.n;
 review.linkDocument(course.id,localDocument.id,[secret]);
 review.addConcept({courseId:course.id,label:secret+' user',unitId:null,note:secret});
 expect(h.store.db.prepare('SELECT count(*) n FROM moodle_files').get()!.n).toBe(before);
 expect(h.store.db.prepare('SELECT 1 FROM moodle_files WHERE documentId=?').get(localDocument.id)).toBeUndefined();
 const services:BackendServices={options:h.options,planner:h.planner,clock:h.options.clock!,remote:new BackendRemote(h.options),pages:new BackendPages()};
 const context=(args:ToolArguments)=>new BackendContext(h.repository,accountA,[accountA],args);
 const cached=cachedHandlers(services);
 const courseArgs=mcpTools.get_course.schema.parse({courseId:courseA});
 const searchArgs=mcpTools.search_content.schema.parse({query:secret});
 const fileArgs=mcpTools.read_file.schema.parse({fileId:fileA});
 const plannerArgs=mcpTools.get_planner.schema.parse({});
 const results=[
  await cached.get_course(context(courseArgs),courseArgs),
  await searchHandler(services)(context(searchArgs),searchArgs),
  await cached.read_file(context(fileArgs),fileArgs),
  await plannerHandlers(services).get_planner(context(plannerArgs),plannerArgs),
 ];
 expect(JSON.stringify(results)).not.toContain(secret);
 expect(results[1]!.content).toEqual({items:[]});
 expect(h.request).not.toHaveBeenCalled();
});
