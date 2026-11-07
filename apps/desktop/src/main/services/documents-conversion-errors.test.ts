import {it,expect} from 'vitest';
import {tmpdir} from 'node:os';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {openStore} from '../db';
import {DocumentService} from './documents';
it.each([['ENOSPC','errors.disk_full'],['EACCES','errors.permission_denied'],['ENETUNREACH','errors.offline']])('conversion failure %s retains specific copy',async(code,expected)=>{
 const dir=await mkdtemp(join(tmpdir(),'vstudy-conv-error-'));const store=openStore(':memory:');
 const service=new DocumentService({userData:dir,store,convert:async()=>{throw Object.assign(new Error(code+': fixture conversion failure'),{code})}});
 try{const d=await service.importPath(resolve('test-fixtures/converter/sample.html'));await service.waitForIdle();const doc=service.get(d.id);const actual=doc?.status==='failed'?doc.error:undefined;expect(actual).toContain(expected)}
 finally{service.dispose();store.close();await rm(dir,{recursive:true,force:true})}
});

const sqliteFull=()=>Object.assign(new Error('database or disk is full'),{code:'ERR_SQLITE_ERROR',errcode:13});
it.each([
 ['message-only ECONNRESET',()=>new Error('read ECONNRESET'),'errors.offline'],
 ['message-only ENOTFOUND',()=>new Error('getaddrinfo ENOTFOUND pypi.org'),'errors.offline'],
 ['ENOSPC two causes deep',()=>Object.assign(new Error('a'),{cause:Object.assign(new Error('b'),{cause:{code:'ENOSPC'}})}),'errors.disk_full'],
 ['AggregateError member',()=>new AggregateError([Object.assign(new Error('x'),{code:'ENOSPC'})],'multi'),'errors.disk_full'],
 ['EDQUOT',()=>Object.assign(new Error('quota'),{code:'EDQUOT'}),'errors.disk_full'],
 ['EMFILE',()=>Object.assign(new Error('too many open files'),{code:'EMFILE'}),'errors.converter_failed'],
 ['SQLite disk full thrown by the converter',sqliteFull,'errors.disk_full'],
])('conversion failure %s is classified',async(_name,make,expected)=>{
 const dir=await mkdtemp(join(tmpdir(),'vstudy-conv-error-'));const store=openStore(':memory:');
 const service=new DocumentService({userData:dir,store,convert:async()=>{throw make()}});
 try{const d=await service.importPath(resolve('test-fixtures/converter/sample.html'));await service.waitForIdle();const doc=service.get(d.id);expect(doc?.status==='failed'?doc.error:undefined).toContain(expected)}
 finally{service.dispose();store.close();await rm(dir,{recursive:true,force:true})}
});
it('maps a SQLite disk-full error thrown while marking the document ready to disk_full',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vstudy-conv-error-'));const store=openStore(':memory:');
 const service=new DocumentService({userData:dir,store,convert:async(_source:string,out:string)=>{const {writeFile}=await import('node:fs/promises');await writeFile(out,'# ok');return 'markitdown' as never}});
 const real=store.documents.transition.bind(store.documents);let ready=0;
 (store.documents as unknown as {transition:typeof real}).transition=(id,patch)=>{if(patch.status==='ready'&&ready++===0)throw sqliteFull();return real(id,patch)};
 try{const d=await service.importPath(resolve('test-fixtures/converter/sample.html'));await service.waitForIdle();const doc=service.get(d.id);expect(doc?.status).toBe('failed');expect(doc?.status==='failed'?doc.error:undefined).toContain('errors.disk_full')}
 finally{service.dispose();store.close();await rm(dir,{recursive:true,force:true})}
});
