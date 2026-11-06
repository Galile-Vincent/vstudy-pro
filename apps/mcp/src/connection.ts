/** Select a local pipe or checked Unix socket before opening the framed transport. @packageDocumentation */
import { lstatSync } from 'node:fs';
import { dirname } from 'node:path';
import { createConnection, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { currentWindowsSid, windowsPipeName } from '../../desktop/src/main/mcp/endpoint';
import { assertNoSymlinks } from './files';
import { BridgeError } from './errors';
import { createWindowsPipeConnector } from './windows-pipe';

/**
 * Resolve only after checking the actual server SID on the same handle that carries the returned stream.
 * Never probe then reconnect. Use Identification-level impersonation and send no client bytes before verification.
 * Destroying the returned stream must close that authenticated handle and any forwarding process.
 * Reject promptly when the supplied signal aborts, including during native startup.
 */
export type AuthenticatedPipeConnector = (request: {
  path: string; expectedServerSid: string; impersonationLevel: 'identification'; signal?: AbortSignal;
}) => Promise<{ stream: Duplex; serverSid: string }>;
export interface ConnectionOptions {
  platform?: NodeJS.Platform;
  connect?: (path: string) => Socket;
  checkUnix?: (path: string) => void;
  authenticatedPipe?: AuthenticatedPipeConnector | null;
  currentSid?: () => string;
  signal?: AbortSignal;
}

function checkUnix(path: string): void {
  assertNoSymlinks(path);
  const directory = lstatSync(dirname(path));
  const file = lstatSync(path);
  if (!directory.isDirectory() || !file.isSocket() || (directory.mode & 0o777) !== 0o700
    || (file.mode & 0o777) !== 0o600 || (process.getuid && (directory.uid !== process.getuid() || file.uid !== process.getuid()))) {
    throw new BridgeError('DENIED', 'The bridge directory must be private (0700) and its socket owned by you (0600).');
  }
}

export async function connectLocalSocket(path: string, options: ConnectionOptions = {}): Promise<Duplex> {
  if ((options.platform ?? process.platform) === 'win32') {
    const prefix = "\\\\.\\pipe\\vstudy-";
    if (!path.startsWith(prefix) || !/^[a-f0-9]{32}$/.test(path.slice(prefix.length))) throw new BridgeError('DENIED', 'Use the current-user local VStudy named pipe.');
    if (options.authenticatedPipe === null) throw new BridgeError('UNSUPPORTED', 'A same-handle authenticated Windows pipe connector is required. No credentials were sent.');
    const expectedServerSid = (options.currentSid ?? currentWindowsSid)();
    if (path !== windowsPipeName(expectedServerSid)) throw new BridgeError('DENIED', 'The pipe does not belong to the current SID namespace.');
    const connected = await (options.authenticatedPipe ?? createWindowsPipeConnector())({ path, expectedServerSid, impersonationLevel: 'identification', ...(options.signal ? { signal: options.signal } : {}) });
    if (connected.serverSid !== expectedServerSid) {
      connected.stream.destroy();
      throw new BridgeError('DENIED', 'The connected pipe server owner does not match the current SID.');
    }
    return connected.stream;
  } else (options.checkUnix ?? checkUnix)(path);
  return new Promise((resolve, reject) => {
    const socket = (options.connect ?? createConnection)(path);
    const timer = setTimeout(() => { socket.destroy(); reject(new BridgeError('TIMEOUT', 'VStudy did not accept the local connection.')); }, 2000);
    const onError = (error: Error) => { clearTimeout(timer); socket.destroy(); reject(error); };
    socket.once('error', onError);
    socket.once('connect', () => { clearTimeout(timer); socket.removeListener('error', onError); resolve(socket); });
  });
}
