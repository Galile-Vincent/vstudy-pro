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
