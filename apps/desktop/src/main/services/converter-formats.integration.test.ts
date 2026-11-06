/**
 * Regression coverage for services converter-formats.
 * Owned by main/services.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WarmWorker } from '../../../resources/converter/warm-worker';
it.skipIf(!process.env.VSTUDY_CONVERTER_PYTHON)('converts all seven formats through the real platform converter worker', async () => {
  const root=await mkdtemp(join(tmpdir(),'vstudy-converter-formats-'));
  execFileSync(process.platform === 'win32' ? 'python' : 'python3',['test-fixtures/converter/generate.py',root]);
  const worker=new WarmWorker(process.env.VSTUDY_CONVERTER_PYTHON!,resolve('resources/converter/convert.py'),root);
  try {
    for (const extension of ['docx','xlsx','pptx','html','csv','md','pdf']) {
      const target=join(root,extension+'.md');
      await worker.run(join(root,'sample.'+extension),target,target);
      expect(await readFile(target,'utf8'),extension).toContain('VStudy fixture');
    }
  } finally {worker.stop();await rm(root,{recursive:true,force:true});}
},120_000);
it.skipIf(!process.env.VSTUDY_CONVERTER_PYTHON || !process.env.VSTUDY_AUDIT_CORPUS)('replays the original audit XML and lying-size archive PoCs safely',async()=>{
  const root=await mkdtemp(join(tmpdir(),'vstudy-original-pocs-'));
  const worker=new WarmWorker(process.env.VSTUDY_CONVERTER_PYTHON!,resolve('resources/converter/convert.py'),root);
  try{
    for(const name of ['xxe.docx','xxe.xlsx','billion-laughs.docx','lying-size.docx']){
      await expect(worker.run(join(process.env.VSTUDY_AUDIT_CORPUS!,name),join(root,name+'.md'),join(root,'lib.md')),name).rejects.toThrow('Document conversion failed');
    }
    const target=join(root,'pptx.md');
    await worker.run(join(process.env.VSTUDY_AUDIT_CORPUS!,'xxe.pptx'),target,target);
    expect(await readFile(target,'utf8')).not.toContain('XXE_CANARY_SECRET_9137');
  }finally{worker.stop();await rm(root,{recursive:true,force:true});}
},120_000);
