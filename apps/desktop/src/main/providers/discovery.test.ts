/**
 * Regression coverage for providers discovery.
 * Owned by main/providers.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect, it, vi } from 'vitest';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { capture } from './models';
it('awaits killing TERM-resistant discovery process groups before rejecting', async () => {
  const root=await mkdtemp(join(tmpdir(),'vstudy-discovery-'));const pids=join(root,'pids');
  try {
    const source = `process.on('SIGTERM',()=>{});const child=require('node:child_process').spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});require('node:fs').writeFileSync(${JSON.stringify(pids)},JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);`;
    await expect(capture(process.execPath,['-e',source],'',false,500)).rejects.toThrow('timed out');
    const ids=JSON.parse(await readFile(pids,'utf8')) as number[];
    for(const pid of ids) await vi.waitFor(()=>expect(()=>process.kill(pid,0)).toThrow(),{timeout:2000});
  } finally {await rm(root,{recursive:true,force:true});}
});
