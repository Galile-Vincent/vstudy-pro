/**
 * Read usage history and CSV data off the main thread for disk-backed stores.
 * Owned by main/db.
 * Applied SQL remains immutable; repositories share one connection and use bound query values.
 * @packageDocumentation
 */
import { usageCsv } from './usage-csv';
import { Worker } from 'node:worker_threads';
import type { Store } from './index';
import type { UsageRecord } from '../../shared/domain';

/** Read usage history on a separate SQLite connection; in-memory tests use the existing store. */
export function readUsageHistory(store: Store, kind: 'all' | 'document' | 'conversation', id?: string): Promise<UsageRecord[]> {
  return runReader(store,kind,id) as Promise<UsageRecord[]>;
}
/** Serialize usage history off the main thread for disk-backed stores. */
export function readUsageCsv(store: Store): Promise<string> { return runReader(store,'csv') as Promise<string>; }
function runReader(store: Store, kind: 'all' | 'document' | 'conversation' | 'csv', id?: string): Promise<UsageRecord[] | string> {
  const path = String(store.db.prepare('PRAGMA database_list').get()?.file ?? '');
  // In-memory test stores cannot be shared with another SQLite connection.
  if (!path && kind === 'csv') return Promise.resolve(usageCsv(store.usage.list()));
  if (!path) return Promise.resolve(kind === 'document' ? store.usage.forDocument(id!) : kind === 'conversation' ? store.usage.forConversation(id!) : store.usage.list());
  return new Promise((resolve, reject) => {
    const worker = new Worker(`
      const {parentPort,workerData}=require('node:worker_threads');
      const {DatabaseSync}=require('node:sqlite');
      const db=new DatabaseSync(workerData.path,{readOnly:true});
      try {
        const where=workerData.kind==='document'?'WHERE documentId=?':workerData.kind==='conversation'?'WHERE conversationId=?':'';
        const rows=db.prepare('SELECT payload FROM usage_events '+where+' ORDER BY createdAt,id').all(...(where?[workerData.id]:[]));
        const records=rows.map(row=>JSON.parse(row.payload));
        if(workerData.kind==='csv') {
          parentPort.postMessage((${usageCsv.toString()})(records));
        } else parentPort.postMessage(records);
      } finally {db.close();}
    `, {eval:true,workerData:{path,kind,id}});
    worker.once('message', (records: UsageRecord[] | string) => resolve(records));
    worker.once('error', reject);
    worker.once('exit', code => { if (code) reject(new Error(`Usage reader exited: ${code}`)); });
  });
}
