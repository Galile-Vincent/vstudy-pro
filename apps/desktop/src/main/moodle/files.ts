import { moodleFetch, siteFetch, siteTarget } from './site-url';
import { mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DocumentService } from '../services/documents';
import { MAX_SOURCE_BYTES } from '../services/documents';
import type { MoodleRepository } from './repository';
import type { Fetch } from './client';

export function authenticatedFileUrl(source: string, host: string, token: string): string {
  const url = siteTarget(host,source);
  const root = new URL(host).pathname.replace(/\/$/,'');
  const relative = url.pathname.slice(root.length);
  if (!/^\/(?:webservice\/)?pluginfile\.php(?:\/|$)/.test(relative) || relative.endsWith('pluginfile.php') && !url.searchParams.has('file')) throw new Error('Unsafe Moodle file URL');
  url.pathname = root + relative.replace(/^\/pluginfile\.php/,'/webservice/pluginfile.php');
  for (const key of [...url.searchParams.keys()]) if (/token|sesskey/i.test(key)) url.searchParams.delete(key);
  url.searchParams.set('token',token);
  url.hash = '';
  return url.href;
}
export function clearMoodleImages(host?: string, token?: string): void {
  for (const key of imageCache.keys()) if (!host || key.startsWith(`${host}:${token ?? ''}:`)) imageCache.delete(key);
}
const imageCache = new Map<string,{expires:number;data:Promise<string | null>;bytes:number}>();
export function moodleImage(source: string, host: string, token?: string, request: Fetch = moodleFetch): Promise<string | null> {
  const key = `${host}:${token ?? ''}:${source}`;
  const cached = imageCache.get(key);
  if (cached && cached.expires > Date.now()) { imageCache.delete(key); imageCache.set(key,cached); return cached.data; }
  const data = (async () => {
    const url = siteTarget(host,source);
    const target = token && /\/pluginfile\.php(?:\/|$)/.test(url.pathname) ? authenticatedFileUrl(source,host,token) : url.href;
    const response = await siteFetch(host,request)(target,{redirect:'error',signal:AbortSignal.timeout(30_000)});
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim();
    if (!response.ok || !response.body || !mime || !['image/png','image/jpeg','image/gif','image/webp','image/avif'].includes(mime)) { await response.body?.cancel(); return null; }
    const limit = 2 * 1024 * 1024;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit) return null;
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    return `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`;
  })().catch(() => null);
  if (imageCache.size >= 128) imageCache.delete(imageCache.keys().next().value!);
  const entry={expires:Date.now()+5*60_000,data,bytes:0};
  imageCache.set(key,entry);
  void data.then(value=>{
    if(imageCache.get(key)!==entry)return;entry.bytes=(value?.length ?? 0)*2;
    let bytes=[...imageCache.values()].reduce((n,e)=>n+e.bytes,0);
    for(const [old,cached] of imageCache){if(bytes<=16*1024*1024)break;bytes-=cached.bytes;imageCache.delete(old);}
  });
  return data;
}
async function performImport(repository: MoodleRepository, id: string, host: string, token: string, documents: Pick<DocumentService,'importPath'|'get'>, request: Fetch = moodleFetch, stagingRoot = tmpdir()): Promise<string> {
  const {file,url} = repository.file(id);
  if (file.documentId && documents.get(file.documentId as Parameters<DocumentService['get']>[0])) return file.documentId;
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Document exceeds 50 MiB');
  const target = authenticatedFileUrl(url,host,token);
  const extension = extname(file.name).toLowerCase();
  if (!/^\.[a-z0-9]{1,12}$/.test(extension)) throw new Error('Unsupported Moodle file extension');
  await mkdir(stagingRoot,{recursive:true,mode:0o700});
  const directory = await mkdtemp(join(stagingRoot,'.download-'));
  try {
    let response: Response;
    try { response = await siteFetch(host,request)(target,{redirect:'error',signal:AbortSignal.timeout(120_000)}); }
    catch { throw new Error('Moodle file download failed'); }
    if (!response.ok || !response.body) throw new Error('Moodle file download failed');
    if (Number(response.headers.get('content-length')) > MAX_SOURCE_BYTES) { await response.body.cancel(); throw new Error('Document exceeds 50 MiB'); }
    const path = join(directory,Array.from(file.name,char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || '/\\:'.includes(char) ? '_' : char).join('').replace(/^\.+/, '_'));
    const output = await open(path,'wx',0o600);
    const reader = response.body.getReader();
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_SOURCE_BYTES) throw new Error('Document exceeds 50 MiB');
        await output.writeFile(chunk.value);
      }
      await output.sync();
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); await output.close(); }
    const document = await documents.importPath(path);
    repository.linkFile(id,document.id,file);
    return document.id;
  } finally { await rm(directory,{recursive:true,force:true}); }
}

const downloads=new WeakMap<MoodleRepository,Map<string,Promise<string>>>();
/** One import per remote file at a time. Durable originals outlive account sign-out. */
export function importMoodleFile(...args:Parameters<typeof performImport>):Promise<string>{
  const [repository,id]=args;let pending=downloads.get(repository);
  if(!pending){pending=new Map();downloads.set(repository,pending);}
  const existing=pending.get(id);if(existing)return existing;
  const work=performImport(...args).finally(()=>pending.delete(id));pending.set(id,work);return work;
}
