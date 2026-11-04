import { createHash } from 'node:crypto';
import { access, mkdir, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { z } from 'zod';
import { ProcessScope } from './process-scope';
import { runProcess } from './index';
import { containedPath } from '../../src/main/services/file-paths';
export type AiPage = {image:Buffer; text:string};
export function createPageRenderer(ensureReady:()=>Promise<string>, resources:string) {
 return async (source:string, page:number, signal:AbortSignal):Promise<AiPage> => {
  signal.throwIfAborted();
  const python=await ensureReady();
  const cache=join(dirname(source),'ai-pages');await mkdir(cache,{recursive:true,mode:0o700});
  const key=createHash('sha256').update(await readFile(source)).update(`:${page}:120dpi:v1`).digest('hex');
  const path=join(cache,`${key}.png`);
  const scope=new ProcessScope();const abort=()=>{void scope.dispose();};signal.addEventListener('abort',abort,{once:true});
  try {
   signal.throwIfAborted();
   try {await access(containedPath(cache,path));await access(containedPath(cache,path+'.json'));z.object({text:z.string().max(1_000_000)}).strict().parse(JSON.parse(await readFile(containedPath(cache,path+'.json'),'utf8')));}
   catch {const args=['-B','-E','-s',join(resources,'render_page.py'),source,String(page),path];await runProcess(process.platform==='darwin'?'/usr/bin/sandbox-exec':python,process.platform==='darwin'?['-p','(version 1)(allow default)(deny network*)',python,...args]:args,cache,25_000,4096,undefined,undefined,scope);}
   signal.throwIfAborted();
   if((await stat(path)).size>8*1024*1024)throw new Error('ai_parse.size');
   const metadata=z.object({text:z.string().max(1_000_000)}).strict().parse(JSON.parse(await readFile(containedPath(cache,path+'.json'),'utf8')));
   return {image:await readFile(containedPath(cache,path)),text:metadata.text};
  } finally {signal.removeEventListener('abort',abort);await scope.dispose();}
 };
}
