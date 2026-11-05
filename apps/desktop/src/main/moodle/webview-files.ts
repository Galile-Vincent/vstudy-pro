/** Streams authenticated pluginfile responses into DocumentService's bounded, validated import pipeline. Never writes Downloads. */
import { mkdtemp, open, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DocumentService } from '../services/documents';
import { MAX_SOURCE_BYTES } from '../services/documents';
import { safeFilename } from '../security';
import { WebviewSessionError } from './webview-session';
import { webviewFile, type WebviewPolicy } from './webview-policy';

export async function importWebviewFile(url:string, policy:WebviewPolicy, request:(url:string,init:RequestInit)=>Promise<Response>, documents:Pick<DocumentService,'importPath'>, signal:AbortSignal): Promise<string> {
  if (!webviewFile(url,policy)) throw new WebviewSessionError('blocked');
  const parsed = new URL(url);
  let name:string;
  try { name = safeFilename(decodeURIComponent(parsed.searchParams.get('file') ?? parsed.pathname.split('/').pop() ?? '')); }
  catch { throw new WebviewSessionError('file-unsupported'); }
  if (!['.pdf','.docx','.xlsx','.pptx','.html','.htm','.csv','.md','.txt'].includes(extname(name).toLowerCase())) throw new WebviewSessionError('file-unsupported');
  const directory = await mkdtemp(join(tmpdir(),'vstudy-moodle-webview-'));
  try {
    let response:Response;
    try {response = await request(url,{redirect:'manual',credentials:'include',signal});}
    catch (error) {throw new WebviewSessionError(error instanceof Error && /redirect was cancelled/i.test(error.message) ? 'session-expired' : signal.aborted ? 'timeout' : 'offline');}
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new WebviewSessionError(response.status >= 300 && response.status < 400 ? 'session-expired' : 'load-failed'); }
    if (Number(response.headers.get('content-length')) > MAX_SOURCE_BYTES) { await response.body.cancel(); throw new WebviewSessionError('file-unsupported'); }
    const path = join(directory,name);
    const output = await open(path,'wx',0o600);
    const reader = response.body.getReader();
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_SOURCE_BYTES) throw new WebviewSessionError('file-unsupported');
        await output.writeFile(part.value);
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); await output.close(); }
    if (signal.aborted) throw new WebviewSessionError('load-failed');
    return (await documents.importPath(path)).id;
  } finally { await rm(directory,{recursive:true,force:true}); }
}
