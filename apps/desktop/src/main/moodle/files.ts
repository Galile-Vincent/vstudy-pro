import { moodleFetch, siteFetch } from './site-url';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DocumentService } from '../services/documents';
import { MAX_SOURCE_BYTES } from '../services/documents';
import type { MoodleRepository } from './repository';
import type { Fetch } from './client';

export function authenticatedFileUrl(source: string, host: string, token: string): string {
  const url = new URL(source);
  const school = new URL(host);
  if (url.protocol !== 'https:' || url.origin !== school.origin || url.username || url.password || !/\/(?:webservice\/)?pluginfile\.php\//.test(url.pathname)) throw new Error('Unsafe Moodle file URL');
  for (const key of [...url.searchParams.keys()]) if (key.toLowerCase() === 'token') url.searchParams.delete(key);
  url.searchParams.set('token',token);
  url.hash = '';
  return url.href;
}
export async function importMoodleFile(repository: MoodleRepository, id: string, host: string, token: string, documents: Pick<DocumentService,'importPath'|'get'>, request: Fetch = moodleFetch): Promise<string> {
  const {file,url} = repository.file(id);
  if (file.documentId && documents.get(file.documentId as Parameters<DocumentService['get']>[0])) return file.documentId;
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Document exceeds 50 MiB');
  const target = authenticatedFileUrl(url,host,token);
  const extension = extname(file.name).toLowerCase();
  if (!/^\.[a-z0-9]{1,12}$/.test(extension)) throw new Error('Unsupported Moodle file extension');
  const directory = await mkdtemp(join(tmpdir(),'vstudy-moodle-'));
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
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); await output.close(); }
    const document = await documents.importPath(path);
    repository.linkFile(id,document.id,file);
    return document.id;
  } finally { await rm(directory,{recursive:true,force:true}); }
}
