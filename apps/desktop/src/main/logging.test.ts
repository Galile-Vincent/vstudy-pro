/** Local diagnostics are bounded and safe to copy after restarting. */
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, statSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
const mocks = vi.hoisted(() => ({root:'',copy:vi.fn()}));
vi.mock('electron', () => ({app:{getPath:()=>mocks.root,getVersion:()=> '0.3.0'},clipboard:{writeText:mocks.copy}}));
import { log, redact, copyDiagnostics } from './logging';
const roots:string[]=[];
function fixture() { const root=mkdtempSync(join(tmpdir(),'vstudy-log-')); roots.push(root); mocks.root=root; return join(root,'logs'); }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root,{recursive:true,force:true}); vi.restoreAllMocks(); });
it.each([`${homedir()}/Documents/private-paper.pdf`, '/Volumes/School/private-paper.pdf', 'C:\\Users\\Student\\private-paper.pdf', 'private-paper.pdf', '/Volumes/School/Private Coursework/private-paper.pdf', '\\\\School\\Student\\private-paper.pdf'])('removes private paths and filenames: %s', path => {
  expect(redact(`ENOENT open '${path}' sk-secret Bearer secret x-api-key: hidden`)).not.toMatch(/private-paper|Documents|Student|Coursework|School|sk-secret|Bearer secret|hidden/);
});
it('writes redacted logs with restrictive permissions and bounded rotation', () => {
  const directory=fixture(); vi.spyOn(console,'log').mockImplementation(()=>{});
  for (let i=0;i<300;i++) log({phase:'failure',stack:'x'.repeat(8000)+' /private/private-paper.pdf sk-secret'});
  expect(readdirSync(directory).sort()).toEqual(['main.log','main.log.1']);
  for (const name of readdirSync(directory)) {
    const file=join(directory,name);
    expect(statSync(file).size).toBeLessThanOrEqual(1024*1024);
    if (process.platform!=='win32') expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file,'utf8')).not.toMatch(/private-paper|sk-secret/);
  }
});
it('copies only metadata and the last 100 redacted records, including previous runs', () => {
  const directory=fixture(); vi.spyOn(console,'log').mockImplementation(()=>{});
  log({phase:'initialize'});
  writeFileSync(join(directory,'main.log'), Array.from({length:120},(_,i)=>`record-${i} /private/private-paper.pdf`).join('\n')+'\n');
  copyDiagnostics();
  const text=mocks.copy.mock.calls.at(-1)![0] as string;
  expect(text).toContain('VStudy Pro 0.3.0'); expect(text).toContain('OS '+process.platform); expect(text).toContain('Arch '+process.arch);
  expect(text).toContain('record-119'); expect(text).not.toContain('record-19 ');
  expect(text).not.toContain('private-paper'); expect(text).not.toContain(mocks.root);
});
it('keeps logging and copy usable when the file sink fails', () => {
  const directory=fixture(); writeFileSync(directory,'not a directory');
  vi.spyOn(console,'log').mockImplementation(()=>{});
  expect(()=>log({phase:'sink-unavailable'})).not.toThrow();
  copyDiagnostics(); expect(mocks.copy.mock.calls.at(-1)![0]).toContain('sink-unavailable');
});
