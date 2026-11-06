/** Attack native-relay authentication, byte boundaries and cleanup without impersonating Windows acceptance. @packageDocumentation */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { createWindowsPipeConnector, type WindowsPipeOptions } from '../src/windows-pipe';
import { windowsPipeName } from '../../desktop/src/main/mcp/endpoint';
import { connectLocalSocket } from '../src/connection';
import { BridgeClient } from '../src/bridge';
import { Credentials } from '../src/credentials';
import { BridgeError } from '../src/errors';

vi.mock('node:timers/promises', () => ({
  setTimeout: (ms: number, value: unknown, options: {signal?: AbortSignal} = {}) => new Promise((resolve, reject) => {
    const {signal} = options;
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(() => {signal?.removeEventListener('abort', abort); resolve(value);}, ms);
    const abort = () => {clearTimeout(timer); reject(signal?.reason);};
    signal?.addEventListener('abort', abort, {once: true});
  }),
}));

const sid = 'S-1-5-21-100-200-300-1001';
const request = { path: windowsPipeName(sid), expectedServerSid: sid, impersonationLevel: 'identification' as const };
const children: Relay[] = [];
class Relay extends EventEmitter {
  stdin = new PassThrough(); stdout = new PassThrough(); stderr = new PassThrough();
  kill = vi.fn(() => true);
  constructor() { super(); children.push(this); }
}
afterEach(() => { vi.useRealTimers(); for (const child of children.splice(0)) { child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); } });
function fixture() {
  const child = new Relay();
  const write = vi.spyOn(child.stdin, 'write');
  const start = vi.fn<NonNullable<WindowsPipeOptions['start']>>(() => child);
  const connector = createWindowsPipeConnector({ start, environment: { SystemRoot: String.raw`C:\Windows` } });
  return {child, write, start, connector};
}

it('keeps client bytes withheld until native authentication and preserves binary bytes coalesced with its ready header', async () => {
  const h = fixture();
  const opening = connectLocalSocket(request.path, {platform: 'win32', currentSid: () => sid, authenticatedPipe: h.connector});
  expect(h.write).not.toHaveBeenCalled();
  h.child.stdout.write('VSTUDY_PIPE_RE');
  expect(h.write).not.toHaveBeenCalled();
  const response = Buffer.from([0, 255, 10, 0, 128, 9]);
  h.child.stdout.write(Buffer.concat([Buffer.from('ADY:' + sid + '\n'), response]));
  const stream = await opening;
  expect(h.write).not.toHaveBeenCalled();
  const received = new Promise<Buffer>(resolve => stream.once('data', resolve));
  expect(await received).toEqual(response);
  const sent = new Promise<Buffer>(resolve => h.child.stdin.once('data', resolve));
  stream.write(Buffer.from([0, 1, 254, 10]));
  expect(await sent).toEqual(Buffer.from([0, 1, 254, 10]));
  stream.destroy();
  await vi.waitFor(() => expect(h.child.kill).toHaveBeenCalledOnce());
  expect(h.child.stdin.destroyed).toBe(true);
  const [executable, args, options] = h.start.mock.calls[0]!;
  expect(executable).toBe(String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`);
  expect(args.slice(0, 4)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand']);
  expect(options.shell).toBe(false);
  expect(options.env).toMatchObject({ VSTUDY_PIPE_NAME: request.path.slice('\\\\.\\pipe\\'.length), VSTUDY_PIPE_SID: sid });
});

it.each(['VSTUDY_PIPE_READY:S-1-5-21-999-999-999-1001\n', 'x'.repeat(257), '\u00d6STUDY_PIPE_READY:' + sid + '\n'])('rejects an invalid native attestation before releasing the stream', async value => {
  const h = fixture();
  const opening = h.connector(request);
  const rejected = expect(opening).rejects.toMatchObject({code: 'DENIED'});
  h.child.stdout.write(Buffer.from(value, 'latin1'));
  await rejected;
  expect(h.write).not.toHaveBeenCalled(); expect(h.child.kill).toHaveBeenCalledOnce();
});

it('drains the final response before observing native process closure', async () => {
  const h = fixture();
  const opening = h.connector(request);
  const reply = Buffer.alloc(64 * 1024, 254);
  h.child.stdout.end(Buffer.concat([Buffer.from(`VSTUDY_PIPE_READY:${sid}\n`), reply]));
  const {stream} = await opening;
  h.child.emit('close', 0);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks)).toEqual(reply);
  stream.destroy();
});

it.each([[2, 'DENIED'], [3, 'ENOENT'], [0, 'DISCONNECTED']] as const)('maps native exit %s to fixed error %s', async (exit, code) => {
  const h = fixture();
  const opening = h.connector(request);
  const rejected = expect(opening).rejects.toMatchObject({code});
  h.child.stderr.write('secret-from-native-error');
  h.child.emit('close', exit);
  await rejected;
  expect(h.write).not.toHaveBeenCalled(); expect(h.child.kill).toHaveBeenCalledOnce();
});

it('fails closed and hides native process errors', async () => {
  const h = fixture();
  const rejected = expect(h.connector(request)).rejects.toMatchObject({code: 'UNSUPPORTED', message: 'UNSUPPORTED'});
  h.child.emit('error', new Error('secret-from-native-error'));
  await rejected;
  expect(h.write).not.toHaveBeenCalled(); expect(h.child.kill).toHaveBeenCalledOnce();
});

it('bounds authentication and kills the pending process', async () => {
  vi.useFakeTimers();
  const h = fixture();
  const rejected = expect(h.connector(request)).rejects.toMatchObject({code: 'TIMEOUT'});
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  expect(h.write).not.toHaveBeenCalled(); expect(h.child.kill).toHaveBeenCalledOnce();
});

it('aborts both pending authentication and an authenticated forwarding process', async () => {
  for (const connected of [false, true]) {
    const h = fixture(); const controller = new AbortController();
    const opening = h.connector({...request, signal: controller.signal});
    if (connected) {
      h.child.stdout.write(`VSTUDY_PIPE_READY:${sid}\n`);
      const {stream} = await opening;
      controller.abort();
      expect(stream.destroyed).toBe(true);
    } else {
      const rejected = expect(opening).rejects.toMatchObject({code: 'DISCONNECTED'});
      controller.abort(); await rejected;
    }
    expect(h.write).not.toHaveBeenCalled(); expect(h.child.kill).toHaveBeenCalledOnce();
  }
});

it('allows cold Windows startup beyond 90 seconds but starts no attempt at or after the deadline', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T01:00:00Z'));
  const credentials = new Credentials('/unused-credentials');
  const identity = vi.spyOn(credentials, 'identity');
  const launch = vi.fn(async () => {});
  const starts: number[] = []; const beginning = Date.now();
  const connector = vi.fn(async () => {starts.push(Date.now() - beginning); throw Object.assign(new Error('Not listening'), {code: 'ENOENT'});});
  const client = new BridgeClient({ socketPath: request.path, credentials, clientName: 'Test', stderr: () => {}, launch,
    connection: {platform: 'win32', currentSid: () => sid, authenticatedPipe: connector} });
  let settled = false;
  const running = client.call('create_task', {task: {title: 'Study', courseId: null, dueAt: null, estimateMinutes: 30}}).then(result => {settled = true; return result;});
  await vi.advanceTimersByTimeAsync(91_000);
  expect(settled).toBe(false); expect(launch).toHaveBeenCalledOnce(); expect(identity).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(4000);
  expect(await running).toMatchObject({ok: false, error: {code: 'DISCONNECTED'}});
  expect(Date.now() - beginning).toBe(95_000);
  expect(starts.at(-1)).toBe(94_000);
  expect(starts.every(start => start < 95_000)).toBe(true);
  expect(launch).toHaveBeenCalledOnce(); expect(identity).not.toHaveBeenCalled();
  await client.close();
});

it('accepts a Windows app that becomes ready at 92 seconds', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T01:00:00Z'));
  const beginning = Date.now(); const credentials = new Credentials('/unused-credentials');
  const identity = vi.spyOn(credentials, 'identity').mockImplementation(() => {throw new BridgeError('EXPIRED', 'Synthetic identity.');});
  const client = new BridgeClient({socketPath: request.path, credentials, clientName: 'Test', stderr: () => {}, launch: async () => {},
    connection: {platform: 'win32', currentSid: () => sid, authenticatedPipe: async () => {
      if (Date.now() - beginning < 92_000) throw Object.assign(new Error('Not listening'), {code: 'ENOENT'});
      return {stream: new PassThrough(), serverSid: sid};
    }}});
  const running = client.call('create_task', {task: {title: 'Study', courseId: null, dueAt: null, estimateMinutes: 30}});
  await vi.advanceTimersByTimeAsync(92_000);
  expect(await running).toMatchObject({ok: false, error: {code: 'EXPIRED'}});
  expect(identity).toHaveBeenCalledOnce();
  await client.close();
});

it('cancels a last native attempt at the remaining startup deadline without reading a grant', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T01:00:00Z'));
  const h = fixture(); const beginning = Date.now(); const credentials = new Credentials('/unused-credentials');
  const identity = vi.spyOn(credentials, 'identity');
  const client = new BridgeClient({socketPath: request.path, credentials, clientName: 'Test', stderr: () => {}, launch: async () => {},
    connection: {platform: 'win32', currentSid: () => sid, authenticatedPipe: async value => {
      if (Date.now() - beginning < 94_000) throw Object.assign(new Error('Not listening'), {code: 'ENOENT'});
      return h.connector(value);
    }}});
  const running = client.call('create_task', {task: {title: 'Study', courseId: null, dueAt: null, estimateMinutes: 30}});
  await vi.advanceTimersByTimeAsync(94_000);
  expect(h.start).toHaveBeenCalledOnce(); expect(h.child.kill).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(await running).toMatchObject({ok: false, error: {code: 'DISCONNECTED'}});
  expect(h.child.kill).toHaveBeenCalledOnce(); expect(h.write).not.toHaveBeenCalled(); expect(identity).not.toHaveBeenCalled();
  await client.close();
});

it('client close cancels Windows authentication before any credential read', async () => {
  const h = fixture();
  const credentials = new Credentials('/unused-credentials'); const identity = vi.spyOn(credentials, 'identity');
  const client = new BridgeClient({socketPath: request.path, credentials, clientName: 'Test', stderr: () => {},
    connection: {platform: 'win32', currentSid: () => sid, authenticatedPipe: h.connector}});
  const running = client.call('list_accounts', {});
  await client.close();
  expect(await running).toMatchObject({ok: false, error: {code: 'DISCONNECTED'}});
  expect(identity).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled(); expect(h.child.kill).toHaveBeenCalledOnce();
});
