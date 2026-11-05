/**
 * Regression coverage for moodle webview-files.
 * Owned by main/moodle.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
/** File links preserve authentication while the validated library owns all permanent writes. */
import { expect, it, vi } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { importWebviewFile } from './webview-files';
import { webviewPolicy } from './webview-policy';
import { MAX_SOURCE_BYTES } from '../services/documents';
import { documentSchema } from '../../shared/domain';

const policy = webviewPolicy('https://school.example/campus');
const url = 'https://school.example/campus/pluginfile.php/42/notes.md';
const signal = new AbortController().signal;
it('passes only a private temporary file to the document importer and removes it afterward',async () => {
  let path = '';
  const importPath = vi.fn(async (value:string) => {
    path=value;expect(await readFile(path,'utf8')).toBe('# Notes');expect((await stat(path)).mode & 0o777).toBe(0o600);
    return documentSchema.parse({id:'11111111-1111-4111-a111-111111111111',title:'Notes',sourceName:'notes.md',sourcePath:path,sourceHash:'a'.repeat(64),mime:'text/markdown',status:'ready',markdownPath:path,createdAt:new Date().toISOString(),converter:'markitdown'});
  });
  const request = vi.fn(async () => new Response('# Notes'));
  expect(await importWebviewFile(url,policy,request,{importPath},signal)).toBe('11111111-1111-4111-a111-111111111111');
  expect(request).toHaveBeenCalledWith(url,{redirect:'manual',credentials:'include',signal});
  await expect(stat(path)).rejects.toThrow();
});
it.each(['https://elsewhere.example/pluginfile.php/notes.md','https://school.example/campus/course/view.php?id=2'])('rejects %s before network or IO',async target => {
  const request = vi.fn();
  await expect(importWebviewFile(target,policy,request,{importPath:vi.fn()},signal)).rejects.toMatchObject({code:'blocked'});
  expect(request).not.toHaveBeenCalled();
});
it('rejects unsupported downloads and declared oversized responses',async () => {
  const request = vi.fn(async () => new Response('bytes',{headers:{'Content-Length':String(MAX_SOURCE_BYTES + 1)}}));
  await expect(importWebviewFile(url.replace('.md','.exe'),policy,request,{importPath:vi.fn()},signal)).rejects.toMatchObject({code:'file-unsupported'});
  expect(request).not.toHaveBeenCalled();
  await expect(importWebviewFile(url,policy,request,{importPath:vi.fn()},signal)).rejects.toMatchObject({code:'file-unsupported'});
});
it('shows session expiry for login redirects, including Electron manual-redirect rejections',async () => {
  await expect(importWebviewFile(url,policy,async () => new Response(null,{status:302,headers:{Location:'/campus/login/index.php'}}),{importPath:vi.fn()},signal)).rejects.toMatchObject({code:'session-expired'});
  await expect(importWebviewFile(url,policy,async () => {throw new Error('Redirect was cancelled');},{importPath:vi.fn()},signal)).rejects.toMatchObject({code:'session-expired'});
});
it('removes the temporary file when the import pipeline rejects its contents',async () => {
  let path = '';
  await expect(importWebviewFile(url,policy,async () => new Response('bad content'),{importPath:async value => {path=value;throw Error('Invalid file');}},signal)).rejects.toThrow('Invalid file');
  await expect(stat(path)).rejects.toThrow();
});

it('rejects native downloads during maintenance before network or document writes',async()=>{
  const {exclusiveStorage}=await import('../storage/maintenance');
  const request=vi.fn(), importPath=vi.fn();
  await exclusiveStorage(async()=>{},async()=>{
    await expect(importWebviewFile(url,policy,request,{importPath},signal)).rejects.toThrow('storage.busy');
    expect(request).not.toHaveBeenCalled();expect(importPath).not.toHaveBeenCalled();
  });
});
it('drains a native download before maintenance touches storage',async()=>{
  const {exclusiveStorage}=await import('../storage/maintenance');
  let downloaded!:(value:Response)=>void;
  const request=vi.fn(()=>new Promise<Response>(resolve=>{downloaded=resolve;}));
  const download=importWebviewFile(url,policy,request,{importPath:async()=>{throw new Error('test import rejected');}},signal);
  while(!request.mock.calls.length)await new Promise(resolve=>setTimeout(resolve,1));
  let maintained=false;
  const maintenance=exclusiveStorage(async()=>{},async()=>{maintained=true;});
  await Promise.resolve();await Promise.resolve();expect(maintained).toBe(false);
  const result=expect(download).rejects.toThrow('test import rejected');
  downloaded(new Response('# Notes'));await result;await maintenance;expect(maintained).toBe(true);
});
