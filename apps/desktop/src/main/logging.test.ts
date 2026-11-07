/** Local diagnostics are bounded and safe to copy after restarting. */
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, statSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import * as fs from 'node:fs';
import { join } from 'node:path';
const mocks = vi.hoisted(() => ({root:'',copy:vi.fn()}));
vi.mock('node:fs', async importOriginal => {
  const actual=await importOriginal<typeof import('node:fs')>();
  return {...actual,renameSync:vi.fn(actual.renameSync),rmSync:vi.fn(actual.rmSync)};
});
vi.mock('electron', () => ({app:{getPath:()=>mocks.root,getVersion:()=> '0.3.0'},clipboard:{writeText:mocks.copy}}));
import { log, redact, copyDiagnostics } from './logging';
const roots:string[]=[];
function fixture() { const root=mkdtempSync(join(tmpdir(),'vstudy-log-')); roots.push(root); mocks.root=root; return join(root,'logs'); }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root,{recursive:true,force:true}); vi.restoreAllMocks(); });
it.each([`${homedir()}/Documents/private-paper.pdf`, '/Volumes/School/private-paper.pdf', 'C:\\Users\\Student\\private-paper.pdf', 'private-paper.pdf', '/Volumes/School/Private Coursework/private-paper.pdf', '\\\\School\\Student\\private-paper.pdf'])('removes private paths and filenames: %s', path => {
  expect(redact(`ENOENT open '${path}' sk-secret Bearer secret x-api-key: hidden`)).not.toMatch(/private-paper|Documents|Student|Coursework|School|sk-secret|Bearer secret|hidden/);
});
it('bounds redaction work for long dotted diagnostics while removing paths and filenames', () => {
  const input = "private-paper.pdf '/Volumes/School/private-paper.pdf' " + 'a.'.repeat(200_000);
  const started = performance.now();
  const result = redact(input);
  expect(performance.now() - started).toBeLessThan(200);
  expect(result.length).toBeLessThanOrEqual(20_000);
  expect(result).toContain('[file]');
  expect(result).toContain('[path]');
  expect(result).not.toContain('private-paper');
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
  writeFileSync(join(directory,'main.log'), Array.from({length:120},(_,i)=>`2026-11-06T12:34:56.789Z ${redact({phase:`record-${i}`,path:'/private/private-paper.pdf'})}`).join('\n')+'\n');
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

it.each([
  '2026-11-06T12:34:56.789Z', 'rows.0.id', 'sections.0.modules.1.id', 'Object.handler', '12.345', 'disk-full',
])('preserves diagnostic labels and timestamps: %s', value => {
  expect(redact(value)).toBe(value);
});
it.each([
  '/Users/John Smith/Library/private-paper.pdf',
  '/home/John Smith/Documents/Private Coursework/private-paper.pdf',
  String.raw`C:\Users\Ann Lee\AppData\private-paper.db`,
  `${homedir()}/Private Coursework/private-paper.pdf`,
])('redacts unquoted home paths with spaces: %s', path => {
  expect(redact(`open ${path} failed`)).not.toMatch(/John|Smith|Ann|Lee|Coursework|private-paper/);
  expect(redact({path})).not.toMatch(/John|Smith|Ann|Lee|Coursework|private-paper/);
});
it.each([
  'secret=PRIVATE_CANARY', 'client_secret: PRIVATE_CANARY',
  'Cookie: MoodleSession=PRIVATE_CANARY; other=PRIVATE_OTHER',
  'Authorization: Basic PRIVATE_CANARY', 'Authorization: Bearer PRIVATE_CANARY',
  {Cookie:'MoodleSession=PRIVATE_CANARY; other=PRIVATE_OTHER'},
  {Authorization:'Basic PRIVATE_CANARY'}, {client_secret:'PRIVATE_CANARY'},
])('redacts credentials: %j', value => {
  expect(redact(value)).not.toContain('PRIVATE_');
});
it.each(['sesskey', 'private_key', 'private-key', 'passwd', 'PASSWD', 'password'])('redacts %s in plain, JSON and query forms', key => {
  for (const value of [
    `${key}=PRIVATE_CANARY`, `${key}: PRIVATE_CANARY TWO_WORDS`,
    {[key]:'PRIVATE_CANARY TWO_WORDS'}, `{"${key}":"PRIVATE_CANARY TWO_WORDS"}`,
    `${key}=PRIVATE_CANARY&next=ok`, `?next=ok&${key}=PRIVATE_CANARY`,
    `https://school.example/login?${key}=PRIVATE_CANARY&next=ok`,
  ]) {
    expect(redact(value)).not.toMatch(/PRIVATE_CANARY|TWO_WORDS/);
  }
});
it.each(['Digest', 'Negotiate'])('redacts %s authorization in plain, JSON and query forms', scheme => {
  for (const key of ['Authorization', 'Proxy-Authorization']) {
    for (const value of [
      `${key}: ${scheme} PRIVATE_CANARY`, {[key]:`${scheme} PRIVATE_CANARY`},
      `?${key}=${scheme}%20PRIVATE_CANARY&next=ok`,
      `${key}: ${scheme} username="PRIVATE_USER", response="PRIVATE_RESPONSE"`,
    ]) expect(redact(value)).not.toContain('PRIVATE_');
  }
});
it('copies persisted diagnostic lines verbatim with intact timestamps and labels', () => {
  fixture(); vi.spyOn(console,'log').mockImplementation(()=>{});
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T12:34:56.789Z'));
  try {
    log({phase:'validation',path:'rows.0.id'});
    const stored=readFileSync(join(mocks.root,'logs','main.log'),'utf8').trim();
    copyDiagnostics();
    expect(mocks.copy.mock.calls.at(-1)![0]).toContain(stored);
    expect(stored).toContain('2026-11-06T12:34:56.789Z');
    expect(stored).toContain('rows.0.id');
  } finally { vi.useRealTimers(); }
});
it('redacts credentials in diagnostic files written by older versions before copying', () => {
  const directory=fixture(); vi.spyOn(console,'log').mockImplementation(()=>{});
  log({phase:'initialize'});
  writeFileSync(join(directory,'main.log.1'),'2026-11-06T12:34:56.789Z sesskey=PRIVATE_CANARY\n');
  writeFileSync(join(directory,'main.log'),'2026-11-06T12:34:56.789Z Authorization: Digest username="PRIVATE_USER", response="PRIVATE_RESPONSE"\n');
  copyDiagnostics();
  const text=mocks.copy.mock.calls.at(-1)![0] as string;
  expect(text).not.toContain('PRIVATE_');
  expect(text).toContain('2026-11-06T12:34:56.789Z');
});
it.each(['renameSync','rmSync'] as const)('continues file logging when rotation %s fails', operation => {
  const directory=fixture(); vi.spyOn(console,'log').mockImplementation(()=>{});
  log({phase:'initialize'});
  writeFileSync(join(directory,'main.log'),'x'.repeat(1024*1024));
  vi.mocked(fs[operation]).mockImplementationOnce(()=>{throw Error('EBUSY');});
  log({phase:'rotation-failed'});
  expect(readFileSync(join(directory,'main.log'),'utf8')).toContain('rotation-failed');
  log({phase:'rotation-recovered'});
  expect(readFileSync(join(directory,'main.log'),'utf8')).toContain('rotation-recovered');
});
it.each([
  'GET /login/token.php?autologin key=0123456789abcdef0123456789abcdef failed',
  'https://moodle.example.test/auth/userkey/login.php?userid=7&key=PRIVATE_CANARY&urltogo=%2Fmy',
  '{"key":"PRIVATE_CANARY"}',
  'provider said AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q rejected',
  'push failed ghp_PRIVATECANARY0123456789abcdefghij and AKIAPRIVATECANARY12',
])('redacts bare key values and non-sk API key shapes: %s', value => {
  expect(redact(value)).not.toMatch(/PRIVATE|0123456789abcdef|AIzaSy|AKIA|ghp_/);
});
it('keeps ordinary words that merely contain key', () => {
  expect(redact('keyboard monkey hotkey shortcut')).toBe('keyboard monkey hotkey shortcut');
});
