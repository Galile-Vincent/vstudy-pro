/**
 * Regression coverage for services ai-page-render.
 * Owned by main/services.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { it,expect } from 'vitest';
import { copyFile,mkdtemp,readFile,readdir,rm,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createPageRenderer } from '../../../resources/converter/ai-pages';
it.skipIf(!process.env.VSTUDY_CONVERTER_VENV)('renders a real page and repairs an interrupted metadata cache',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ai-page-render-'));
 try {
  const source=join(root,'source.pdf');await copyFile(resolve('test-fixtures/converter/sample.pdf'),source);
  const render=createPageRenderer(async()=>join(process.env.VSTUDY_CONVERTER_VENV!,'bin/python'),resolve('resources/converter'));
  const first=await render(source,1,new AbortController().signal);expect(first.image.subarray(1,4).toString()).toBe('PNG');expect(first.text.length).toBeGreaterThan(0);
  const cache=join(root,'ai-pages');const metadata=(await readdir(cache)).find(path=>path.endsWith('.json'));if(!metadata)throw new Error('missing metadata');
  await writeFile(join(cache,metadata),'{');const second=await render(source,1,new AbortController().signal);expect(second.text).toBe(first.text);expect(second.image.equals(first.image)).toBe(true);
  expect(JSON.parse(await readFile(join(cache,metadata),'utf8')).text).toBe(first.text);
  const controller=new AbortController();controller.abort();await expect(render(source,1,controller.signal)).rejects.toThrow();
 }finally{await rm(root,{recursive:true,force:true});}
});
