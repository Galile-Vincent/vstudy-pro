/** Real native PTY boundaries, ownership, and process-tree cancellation. @packageDocumentation */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ActionPty, TerminalText, type TerminalPlan } from './pty';
import { ActionSessions } from './sessions';
import { buildPlan, displayCommand } from './plans';
import { cliEnvironment } from '../cli-transport';
import { Owner, temporaryDirectories } from './test-fixtures';
const temporary = temporaryDirectories();
const terminalPlan = (cwd: string, code: string): TerminalPlan => ({ executable: process.execPath, args: ['-e', code], cwd, env: Object.fromEntries(Object.entries(cliEnvironment()).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) });
it('passes argv literally, supports quoted paths, and scrubs inherited secrets and browser openers', async () => {
  const cwd = await temporary(), arg = 'space "quote" $(touch PWNED)';
  const base = buildPlan('login-claude', cwd, '/fake/cli with "quotes"', null, null, Date.now());
  const plan = { ...base, executable: process.execPath, args: ['-e', 'console.log(JSON.stringify({arg:process.argv[1],secret:process.env.ANTHROPIC_API_KEY,browser:process.env.BROWSER,updates:process.env.DISABLE_AUTOUPDATER,agy:process.env.AGY_CLI_DISABLE_AUTO_UPDATE}))', arg] };
  const result = await new ActionPty().run(plan, AbortSignal.timeout(5000), () => {});
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.output)).toMatchObject({ arg, browser: process.platform === 'win32' ? expect.stringContaining('where.exe') : '/usr/bin/true', updates: '1', agy: 'true' });
  expect(JSON.parse(result.output)).not.toHaveProperty('secret');
  await expect(readFile(join(cwd, 'PWNED'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(displayCommand('/fake/a b', ['quote\'here'], 'darwin')).toContain("'quote'\\''here'");
});
it('accepts bounded input and resize, then awaits cancellation of a TERM-resistant tree', async () => {
  const cwd = await temporary(), pty = new ActionPty(), controller = new AbortController();
  let output = '';
  const script = `const fs=require('fs'); const {spawn}=require('child_process'); process.on('SIGTERM',()=>{}); const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'}); fs.writeFileSync(${JSON.stringify(join(cwd, 'child.pid'))},String(child.pid)); process.stdin.on('data',d=>process.stdout.write('INPUT:'+d)); console.log('READY'); setInterval(()=>{},1000);`;
  const run = pty.run(terminalPlan(cwd, script), controller.signal, data => { output += data; });
  const rejected = expect(run).rejects.toMatchObject({ code: 'cancelled' });
  await expect.poll(() => output).toContain('READY');
  pty.resize(120, 40); pty.write('hello\r');
  expect(() => pty.write('x'.repeat(4097))).toThrow('blocked');
  await expect.poll(() => output).toContain('INPUT:hello');
  const childPid = Number(await readFile(join(cwd, 'child.pid'), 'utf8'));
  controller.abort(); await rejected;
  await expect.poll(() => { try { process.kill(childPid, 0); return false; } catch { return true; } }).toBe(true);
});
it('stops an output flood rather than storing or processing it without a bound', async () => {
  let bytes = 0;
  await expect(new ActionPty().run(terminalPlan(await temporary(), "process.stdout.write('x'.repeat(3000000));setInterval(()=>{},1000)"), AbortSignal.timeout(5000), data => { bytes += data.length; })).rejects.toMatchObject({ code: 'blocked' });
  expect(bytes).toBeLessThanOrEqual(2_000_000);
});
it('drops OSC links and clipboard sequences even when their terminator crosses output chunks', () => {
  const filter = new TerminalText(), esc = String.fromCharCode(27), bell = String.fromCharCode(7);
  expect(filter.filter(`visible${esc}]52;c;secret`)).toBe('visible');
  expect(filter.filter(`${bell}safe${esc}]8;;https://example.com${esc}`)).toBe('safe');
  expect(filter.filter(`\\link${esc}]8;;${esc}\\`)).toBe('link');
});
it('binds session input, output, resize, and close to the originating window', async () => {
  const owner = new Owner(), stranger = new Owner(), sessions = new ActionSessions();
  const base = buildPlan('login-claude', await temporary(), process.execPath, null, null, Date.now());
  const plan = { ...base, executable: process.execPath, args: ['-e', "console.log('READY');process.stdin.resume();setInterval(()=>{},1000)"] };
  const session = sessions.start(owner, plan, async action => { await action.pty.run(plan, action.controller.signal, data => sessions.append(action, data)); }, () => {});
  await expect.poll(() => sessions.read(owner, session.id).output).toContain('READY');
  expect(() => sessions.read(stranger, session.id)).toThrow('blocked');
  expect(() => sessions.input(stranger, session.id, 'data')).toThrow('blocked');
  expect(() => sessions.resize(stranger, session.id, 90, 24)).toThrow('blocked');
  await expect(sessions.close(stranger, session.id)).rejects.toThrow('blocked');
  expect(() => sessions.start(owner, plan, async () => {}, () => {})).toThrow('busy');
  owner.destroy();
  await expect.poll(() => sessions.isBusy).toBe(false);
  await sessions.dispose();
});
it('caps session output in memory and awaits close before releasing the provider', async () => {
  const owner = new Owner(), sessions = new ActionSessions(), plan = buildPlan('status-claude', await temporary(), '/unused', null, null, Date.now());
  const session = sessions.start(owner, plan, async action => {
    sessions.append(action, 'x'.repeat(300000));
    await new Promise<void>(resolve => action.controller.signal.addEventListener('abort', () => setTimeout(resolve, 20), { once: true }));
  }, () => {});
  await expect.poll(() => sessions.read(owner, session.id).truncated).toBe(true);
  expect(sessions.read(owner, session.id).output).toHaveLength(262144);
  await sessions.close(owner, session.id); expect(sessions.isBusy).toBe(false);
  await sessions.dispose();
});
it('stops a native action on document reset and removes its output and input capability', async () => {
  const owner = new Owner(), sessions = new ActionSessions();
  const plan = { ...buildPlan('login-claude', await temporary(), process.execPath, null, null, Date.now()), executable: process.execPath, args: ['-e', "console.log('READY');process.stdin.resume();setInterval(()=>{},1000)"] };
  const session = sessions.start(owner, plan, async action => { await action.pty.run(plan, action.controller.signal, data => sessions.append(action, data)); }, () => {});
  await expect.poll(() => sessions.read(owner, session.id).output).toContain('READY');
  await sessions.resetOwner(owner);
  expect(sessions.isBusy).toBe(false);
  expect(() => sessions.read(owner, session.id)).toThrow('blocked');
  expect(() => sessions.input(owner, session.id, 'data')).toThrow('blocked');
  await sessions.dispose();
});
