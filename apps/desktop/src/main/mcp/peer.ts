/** Verify kernel peer credentials using a bundled helper with the accepted socket inherited as fd 3. @packageDocumentation */
import { spawn } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { Socket } from 'node:net';
import { McpFailure } from './errors';

/** Missing helpers, unsafe executables, malformed output, and timeouts all fail closed. */
export function peerUid(socket: Socket, helper: string, timeoutMs = 2000): Promise<number> {
  try {
    const info = lstatSync(helper);
    if (!isAbsolute(helper) || !info.isFile() || info.isSymbolicLink() || (info.mode & 0o022) !== 0 || (info.mode & 0o111) === 0 || ![0, process.getuid?.()].includes(info.uid)) throw new McpFailure('DENIED');
  } catch { return Promise.reject(new McpFailure('DENIED')); }
  return new Promise((resolve, reject) => {
    const child = spawn(helper, [], {stdio: ['ignore', 'pipe', 'ignore', socket], env: {}, windowsHide: true});
    let output = '';
    let settled = false;
    const finish = (uid?: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (uid === undefined) { child.kill('SIGKILL'); reject(new McpFailure('DENIED')); }
      else resolve(uid);
    };
    const timer = setTimeout(() => finish(), timeoutMs);
    timer.unref();
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); if (output.length > 16) finish(); });
    child.on('error', () => finish());
    child.on('close', code => {
      if (code !== 0 || !/^\d{1,10}\n$/.test(output)) return finish();
      const uid = Number(output.trim());
      finish(Number.isSafeInteger(uid) && uid <= 0xffffffff ? uid : undefined);
    });
  });
}
