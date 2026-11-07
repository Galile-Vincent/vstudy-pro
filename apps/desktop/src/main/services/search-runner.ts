/**
 * Run SQLite search in killable workers with a fixed timeout.
 * Owned by main/services.
 * Privileged IO stays in main; callers receive validated domain data rather than raw paths or secrets.
 * @packageDocumentation
 */
import type { EventEmitter } from 'node:events';
import { utilityProcess } from 'electron';
import { fork } from 'node:child_process';
import { join } from 'node:path';
import type { IpcRequest, IpcResponse } from '../../shared/ipc';
const searches = new Set<() => Promise<void>>();
let stopped = false;
/** Terminate and await all search workers before closing their underlying store. */
export async function disposeSearchWorkers(): Promise<void> {
  stopped = true;
  await Promise.all([...searches].map(stop => stop()));
}
export const SEARCH_TIMEOUT = 'Search took too long; refine your query';
/** Execute a bounded search in a killable process and reject when its deadline expires. */
export function searchInWorker<C extends 'library:search' | 'library:documents:list' | 'chats:search'>(channel: C, request: IpcRequest<C>, path: string, root: string, timeoutMs = 1500, entry = join(__dirname, 'search-worker.js')): Promise<IpcResponse<C>> {
  if (stopped) return Promise.reject(new Error("Search service closed"));
  return new Promise((resolve, reject) => {
    // A process can be killed while SQLite is inside native code; V8 thread termination cannot guarantee that.
    const electron = !!process.versions.electron;
    const worker = electron ? utilityProcess.fork(entry, [], {stdio:'ignore',serviceName:'Library search'}) : fork(entry, [], {stdio:'ignore',execArgv:[]});
    let settled = false;
    const finish = (error?: Error, result?: IpcResponse<C>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (electron) (worker as Electron.UtilityProcess).kill(); else (worker as import('node:child_process').ChildProcess).kill('SIGKILL');
      if (error) reject(error); else resolve(result!);
    };
    const closed = new Promise<void>(done => (worker as EventEmitter).once('exit', () => { searches.delete(stop); done(); }));
    const stop = async () => { finish(new Error('Search service closed')); await closed; };
    searches.add(stop);
    const timer = setTimeout(() => finish(new Error(SEARCH_TIMEOUT)), timeoutMs);
    worker.once('message', value => finish(value.error ? new Error(value.error) : undefined, value.result));
    (worker as EventEmitter).once('error', error => finish(error));
    (worker as EventEmitter).once('exit', () => { if (!settled) finish(new Error('Search worker stopped')); });
    const job = {kind:channel==='chats:search'?'chat':channel==='library:search'?'search':'list',request,path,root};
    if (electron) (worker as Electron.UtilityProcess).postMessage(job); else (worker as import('node:child_process').ChildProcess).send(job);
  });
}
