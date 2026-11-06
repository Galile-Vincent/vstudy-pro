/** Keep one authenticated native handle for the whole relay, and never expose credentials to an unverified pipe owner. @packageDocumentation */
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Duplex, type Readable, type Writable } from 'node:stream';
import { win32 } from 'node:path';
import { windowsPipeName } from '../../desktop/src/main/mcp/endpoint';
import type { AuthenticatedPipeConnector } from './connection';
import { BridgeError } from './errors';
import { windowsPipeScript } from './windows-pipe-script';

interface PipeProcess extends EventEmitter {
  stdin: Writable; stdout: Readable; stderr: Readable;
  kill: () => boolean;
}
export interface WindowsPipeOptions {
  environment?: NodeJS.ProcessEnv;
  readyTimeoutMs?: number;
  start?: (executable: string, args: string[], options: {
    env: NodeJS.ProcessEnv; windowsHide: true; shell: false; stdio: ['pipe', 'pipe', 'pipe'];
  }) => PipeProcess;
}

/** Owner and protected DACL are read from the actual stream, which is opened with Identification impersonation. */
export function createWindowsPipeConnector(options: WindowsPipeOptions = {}): AuthenticatedPipeConnector {
  return async request => {
    const environment = options.environment ?? process.env;
    const system = environment.SystemRoot ?? String.raw`C:\Windows`;
    if (request.path !== windowsPipeName(request.expectedServerSid) || request.impersonationLevel !== 'identification'
      || !win32.isAbsolute(system) || !/^[a-z]:/i.test(system) || [...system].some(character => character.charCodeAt(0) < 32)) {
      throw new BridgeError('DENIED', 'Use the current-user local VStudy pipe.');
    }
    if (request.signal?.aborted) throw new BridgeError('DISCONNECTED', 'The VStudy client has closed.');
    let child: PipeProcess;
    try {
      child = (options.start ?? spawn)(win32.join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(windowsPipeScript, 'utf16le').toString('base64')],
        { env: { ...environment, VSTUDY_PIPE_NAME: request.path.slice('\\\\.\\pipe\\'.length), VSTUDY_PIPE_SID: request.expectedServerSid },
          windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch { throw new BridgeError('UNSUPPORTED', 'Windows PowerShell pipe authentication is unavailable. No credentials were sent.'); }
    child.stderr.resume();
    return new Promise((resolve, reject) => {
      let state: 'opening' | 'connected' | 'closed' = 'opening';
      let header = Buffer.alloc(0);
      let stream: Duplex | undefined;
      const stop = () => { child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.kill(); };
      const cleanup = () => { clearTimeout(timer); request.signal?.removeEventListener('abort', aborted); child.stdout.removeListener('data', ready); };
      const fail = (error: Error) => {
        if (state === 'closed') return;
        const opening = state === 'opening';
        state = 'closed'; cleanup();
        if (opening) reject(error);
        else stream?.destroy();
        stop();
      };
      const aborted = () => fail(new BridgeError('DISCONNECTED', 'The VStudy client has closed.'));
      const timer = setTimeout(() => fail(new BridgeError('TIMEOUT', 'Windows pipe authentication timed out. No credentials were sent.')), options.readyTimeoutMs ?? 30_000);
      const ready = (chunk: Buffer) => {
        header = Buffer.concat([header, chunk]);
        const end = header.indexOf(10);
        if (end < 0 && header.length <= 256) return;
        if (end < 0 || end > 256 || !header.subarray(0, end).equals(Buffer.from(`VSTUDY_PIPE_READY:${request.expectedServerSid}`))) {
          fail(new BridgeError('DENIED', 'The connected pipe owner or private ACL could not be verified. No credentials were sent.'));
          return;
        }
        child.stdout.pause(); cleanup();
        child.stdout.unshift(header.subarray(end + 1));
        header = Buffer.alloc(0);
        stream = Duplex.from({ readable: child.stdout, writable: child.stdin });
        stream.on('error', () => fail(new BridgeError('DISCONNECTED', 'VStudy disconnected.')));
        stream.once('close', () => { if (state !== 'closed') { state = 'closed'; request.signal?.removeEventListener('abort', aborted); stop(); } });
        state = 'connected';
        request.signal?.addEventListener('abort', aborted, { once: true });
        resolve({ stream, serverSid: request.expectedServerSid });
      };
      request.signal?.addEventListener('abort', aborted, { once: true });
      child.once('error', () => fail(new BridgeError('UNSUPPORTED', 'Windows PowerShell pipe authentication is unavailable. No credentials were sent.')));
      child.stdin.on('error', () => fail(new BridgeError('DISCONNECTED', 'VStudy disconnected.')));
      child.stdout.on('error', () => fail(new BridgeError('DISCONNECTED', 'VStudy disconnected.')));
      child.stderr.on('error', () => fail(new BridgeError('DISCONNECTED', 'VStudy disconnected.')));
      child.once('close', code => {
        if (state === 'opening') fail(code === 3 ? Object.assign(new Error('VStudy pipe is not running.'), { code: 'ENOENT' })
          : new BridgeError(code === 2 ? 'DENIED' : 'DISCONNECTED', 'The native pipe relay closed. Check VStudy Settings > Agents.'));
      });
      child.stdout.on('data', ready);
      if (request.signal?.aborted) aborted();
    });
  };
}
