/** Same-origin public school logos. Only bounded raster bytes cross IPC; cache paths never do. */
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { moodleFetch, siteTarget } from './site-url';

const limit = 1024 * 1024;
const entrySchema = z.object({hash:z.string().regex(/^[a-f0-9]{64}$/),mime:z.enum(['image/png','image/jpeg','image/gif','image/webp'])}).strict();
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Validate raster signatures and dimensions before accepting an untrusted image. SVG is never accepted. */
export function logoMime(bytes: Buffer): z.infer<typeof entrySchema>['mime'] | null {
  if (bytes.length > limit || bytes.length < 24) return null;
  let mime: z.infer<typeof entrySchema>['mime'], width = 0, height = 0;
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16) === 'IHDR') {
    mime = 'image/png'; width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6))) {
    mime = 'image/gif'; width = bytes.readUInt16LE(6); height = bytes.readUInt16LE(8);
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    mime = 'image/jpeg';
    for (let at = 2; at + 8 < bytes.length;) {
      if (bytes[at] !== 255) return null;
      const marker = bytes[at+1]!;
      if (marker === 218 || marker === 217) break;
      const size = bytes.readUInt16BE(at+2);
      if (size < 2 || at + size + 2 > bytes.length) return null;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
        height = bytes.readUInt16BE(at+5); width = bytes.readUInt16BE(at+7); break;
      }
      at += size + 2;
    }
  } else if (bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') {
    mime = 'image/webp';
    const format = bytes.toString('ascii',12,16);
    if (format === 'VP8X' && bytes.length >= 30) {
      width = 1 + bytes.readUIntLE(24,3); height = 1 + bytes.readUIntLE(27,3);
    } else if (format === 'VP8 ' && bytes.length >= 30 && bytes.subarray(23,26).equals(Buffer.from([157,1,42]))) {
      width = bytes.readUInt16LE(26) & 16383; height = bytes.readUInt16LE(28) & 16383;
    } else if (format === 'VP8L' && bytes.length >= 25 && bytes[20] === 47) {
      const bits = bytes.readUInt32LE(21); width = 1 + (bits & 16383); height = 1 + ((bits >>> 14) & 16383);
    }
  } else return null;
  return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 4_194_304 ? mime : null;
}

/** Fetch once per URL and reuse content-addressed bytes across restarts. Failures use the UI monogram. */
export class MoodleLogoCache {
  private readonly pending = new Map<string,Promise<string | null>>();
  constructor(private readonly directory: () => string, private readonly request: typeof fetch = moodleFetch) {}

  get(source: string, site: string): Promise<string | null> {
    let target: URL;
    try {
      target = siteTarget(new URL(site).origin,new URL(source,`${site}/`).href);
      if ([...target.searchParams.keys()].some(key => /token|sesskey|passport|secret/i.test(key))) return Promise.resolve(null);
      target.hash = '';
    } catch { return Promise.resolve(null); }
    const key = hash(`${site}\n${target.href}`);
    const previous = this.pending.get(key);
    if (previous) return previous;
    if (this.pending.size >= 64) this.pending.delete(this.pending.keys().next().value!);
    const result = this.load(key,target.href).catch(() => null);
    this.pending.set(key,result);
    return result;
  }

  private async load(key: string, target: string): Promise<string | null> {
    const directory = this.directory();
    const pointer = join(directory,`${key}.json`);
    try {
      const metadata = await lstat(pointer);
      if (!metadata.isFile() || metadata.size > 512) throw new Error('Invalid logo pointer');
      const entry = entrySchema.parse(JSON.parse(await readFile(pointer,'utf8')));
      const content = join(directory,entry.hash), image = await lstat(content);
      if (!image.isFile() || image.size > limit) throw new Error('Invalid cached logo');
      const bytes = await readFile(content);
      if (hash(bytes) === entry.hash && logoMime(bytes) === entry.mime) return `data:${entry.mime};base64,${bytes.toString('base64')}`;
    } catch { /* Missing or invalid cache entries are replaced from the selected school. */ }
    const response = await this.request(target,{redirect:'error',signal:AbortSignal.timeout(10_000)});
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (!response.ok || !response.body || !['image/png','image/jpeg','image/gif','image/webp'].includes(mime ?? '') || Number(response.headers.get('content-length')) > limit) {
      await response.body?.cancel(); return null;
    }
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit) return null;
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const bytes = Buffer.concat(chunks), detected = logoMime(bytes);
    if (!detected || detected !== mime) return null;
    const entry = {hash:hash(bytes),mime:detected};
    await mkdir(directory,{recursive:true,mode:0o700});
    await this.write(join(directory,entry.hash),bytes);
    await this.write(pointer,JSON.stringify(entry));
    return `data:${detected};base64,${bytes.toString('base64')}`;
  }

  private async write(path: string, value: Buffer | string) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try { await writeFile(temporary,value,{mode:0o600,flag:'wx'}); await rename(temporary,path); }
    finally { await rm(temporary,{force:true}); }
  }
}
