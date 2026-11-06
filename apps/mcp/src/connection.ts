/** Select a local pipe or checked Unix socket before opening the framed transport. @packageDocumentation */
import { lstatSync } from 'node:fs';
import { dirname } from 'node:path';
import { createConnection, type Socket } from 'node:net';
import { assertNoSymlinks } from './files';
import { BridgeError } from './errors';

export type WireConnector = (path: string) => Promise<Socket>;
export interface ConnectionOptions {
  platform?: NodeJS.Platform;
  connect?: (path: string) => Socket;
  checkUnix?: (path: string) => void;
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

export async function connectLocalSocket(path: string, options: ConnectionOptions = {}): Promise<Socket> {
  if ((options.platform ?? process.platform) === 'win32') {
    const prefix = "\\\\.\\pipe\\vstudy-";
    if (!path.startsWith(prefix) || !/^[a-f0-9]{32}$/.test(path.slice(prefix.length))) throw new BridgeError('DENIED', 'Use the current-user local VStudy named pipe.');
  } else (options.checkUnix ?? checkUnix)(path);
  return new Promise((resolve, reject) => {
    const socket = (options.connect ?? createConnection)(path);
    const timer = setTimeout(() => { socket.destroy(); reject(new BridgeError('TIMEOUT', 'VStudy did not accept the local connection.')); }, 2000);
    const onError = (error: Error) => { clearTimeout(timer); socket.destroy(); reject(error); };
    socket.once('error', onError);
    socket.once('connect', () => { clearTimeout(timer); socket.removeListener('error', onError); resolve(socket); });
  });
}
