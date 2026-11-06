import {randomUUID as uuid} from 'node:crypto';
import {generationRequestSchema} from '../../shared/review-generate';
import {openStore} from '../db';
import {ReviewRepository} from './repository';
import {ArtifactRepository} from './artifact-repository';
import {resolveScope} from './scope';
const at='2026-11-06T00:00:00.000Z';
export function fixture(){const store=openStore(':memory:');const r=new ReviewRepository(store.db),a=new ArtifactRepository(store.db);const c=r.createCourse({title:'Physics'});const d=uuid();store.db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt) VALUES(?,'Text','text.md',?,'/source','text/markdown','ready','/content',?)").run(d,'a'.repeat(64),at);r.linkDocument(c.id,d,['Force','Motion']);const request=generationRequestSchema.parse({requestId:uuid(),courseId:c.id,kind:'test',title:'Practice',scope:{kind:'documents',documentIds:[d]},idempotencyKey:uuid(),providerId:'openai-api',modelId:'gpt-5.4',locale:'en'});const snapshot=resolveScope(request.scope,a.scopeInputs(c.id)).snapshot;const source={documentId:d,version:'original' as const,excerptHash:'a'.repeat(64)};snapshot.sources=[source];return {store,r,a,c,d,request,snapshot,source};}
