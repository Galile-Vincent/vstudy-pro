/** Claim a private listener and remove only stale sockets or lock files whose identity still matches. @packageDocumentation */
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, unlinkSync, writeFileSync, fsyncSync, type Stats } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { privateMcpDirectory } from './grants';
import { McpFailure } from './errors';

function info(path: string): Stats | undefined {
  try { return lstatSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw new McpFailure('DENIED'); }
}
function same(first: Stats, second: Stats | undefined): boolean { return first.dev === second?.dev && first.ino === second.ino; }

/** Closing a listener must not unlink a replacement listener's path. */
export function unlinkOwned(path: string, identity: Stats): void {
  if (same(identity, info(path))) unlinkSync(path);
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}

function claimLock(path: string): () => void {
  const previous = info(path);
  if (previous) {
    if (!previous.isFile() || previous.nlink !== 1 || previous.uid !== process.getuid?.() || (previous.mode & 0o077) !== 0) throw new McpFailure('DENIED');
    const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let pid: number;
    try {
      if (!same(previous, fstatSync(descriptor)) || previous.size > 32) throw new McpFailure('DENIED');
      const text = readFileSync(descriptor, 'utf8');
      if (!/^\d+\n$/.test(text)) throw new McpFailure('DENIED');
      pid = Number(text.trim());
    } finally { closeSync(descriptor); }
    if (!Number.isSafeInteger(pid) || pid < 1 || alive(pid)) throw new McpFailure('DENIED');
    unlinkOwned(path, previous);
  }
  const descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  const identity = fstatSync(descriptor);
  try { writeFileSync(descriptor, `${process.pid}\n`); fsyncSync(descriptor); }
  catch { unlinkOwned(path, identity); throw new McpFailure('INTERNAL'); }
  finally { closeSync(descriptor); }
  return () => unlinkOwned(path, identity);
}

async function stale(path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    const timer = setTimeout(() => { socket.destroy(); reject(new McpFailure('DENIED')); }, 500);
    timer.unref();
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(false); });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      socket.destroy();
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOENT') resolve(true);
      else reject(new McpFailure('DENIED'));
    });
  });
}

/** A PID lock serializes listener startup, including stale-socket checks across processes. */
export async function claimSocketPath(userData: string): Promise<{path: string; release: () => void}> {
  const directory = privateMcpDirectory(userData);
  const path = join(directory, 'bridge.sock');
  if (Buffer.byteLength(path) > 103) throw new McpFailure('UNSUPPORTED');
  const release = claimLock(join(directory, 'bridge.lock'));
  try {
    const previous = info(path);
    if (previous) {
      if (!previous.isSocket() || previous.uid !== process.getuid?.() || (previous.mode & 0o077) !== 0) throw new McpFailure('DENIED');
      if (!(await stale(path))) throw new McpFailure('DENIED');
      unlinkOwned(path, previous);
      if (info(path)) throw new McpFailure('DENIED');
    }
    return {path, release};
  } catch (error) { release(); throw error; }
}
