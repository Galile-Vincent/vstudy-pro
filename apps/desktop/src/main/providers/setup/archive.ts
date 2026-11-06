/**
 * Extract a single regular executable without delegating paths to a system archive utility.
 * Decompressed data, entry sizes, header count, and output size are bounded.
 * @packageDocumentation
 */
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { SetupError } from './types';
const cap = 600_000_000;
export async function extractExecutable(archive: string, destination: string, expected: string, signal: AbortSignal) {
  const input = createReadStream(archive);
  const unzip = createGunzip();
  const onError = (error: Error) => unzip.destroy(error);
  input.on('error', onError); input.pipe(unzip);
  const abort = () => { input.destroy(); unzip.destroy(new SetupError('cancelled')); };
  signal.addEventListener('abort', abort, { once: true });
  const file = await open(destination, 'wx', 0o700);
  let buffer = Buffer.alloc(0), remaining = 0, padding = 0, total = 0, headers = 0;
  let found = false, ended = false;
  try {
    for await (const raw of unzip) {
      signal.throwIfAborted();
      const chunk = Buffer.from(raw);
      total += chunk.length;
      if (total > cap + 1_000_000) throw new SetupError('blocked');
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length) {
        if (remaining) {
          const length = Math.min(remaining, buffer.length);
          await file.writeFile(buffer.subarray(0, length));
          buffer = buffer.subarray(length); remaining -= length;
          continue;
        }
        if (padding) { const length = Math.min(padding, buffer.length); buffer = buffer.subarray(length); padding -= length; continue; }
        if (buffer.length < 512) break;
        const header = buffer.subarray(0, 512); buffer = buffer.subarray(512);
        if (header.every(byte => byte === 0)) { ended = true; continue; }
        if (ended || ++headers > 16) throw new SetupError('blocked');
        const string = (start: number, length: number) => header.subarray(start, start + length).toString('utf8').split('\0')[0]!;
        const octal = (start: number, length: number) => {
          const value = string(start, length).trim();
          if (!/^[0-7]+$/.test(value)) throw new SetupError('blocked');
          return Number.parseInt(value, 8);
        };
        const sum = header.reduce((n, byte, i) => n + (i >= 148 && i < 156 ? 32 : byte), 0);
        if (sum !== octal(148, 8)) throw new SetupError('checksum');
        const name = string(0, 100).replace(/^\.\//, '');
        if (string(345, 155) || string(157, 100) || name !== expected || found || ![0, 48].includes(header[156]!)) throw new SetupError('blocked');
        remaining = octal(124, 12);
        if (remaining <= 0 || remaining > cap) throw new SetupError('blocked');
        padding = (512 - remaining % 512) % 512; found = true;
      }
    }
    if (!found || !ended || remaining || padding || buffer.some(byte => byte !== 0)) throw new SetupError('blocked');
    await file.sync();
  } finally {
    signal.removeEventListener('abort', abort); input.destroy(); unzip.destroy(); await file.close();
  }
}
