import { Worker } from 'node:worker_threads';
import type { Store } from './index';
import type { UsageRecord } from '../../shared/domain';

export function readUsageHistory(store: Store, kind: 'all' | 'document' | 'conversation', id?: string): Promise<UsageRecord[]> {
  return runReader(store,kind,id) as Promise<UsageRecord[]>;
}
export function readUsageCsv(store: Store): Promise<string> { return runReader(store,'csv') as Promise<string>; }
function runReader(store: Store, kind: 'all' | 'document' | 'conversation' | 'csv', id?: string): Promise<UsageRecord[] | string> {
  const path = String(store.db.prepare('PRAGMA database_list').get()?.file ?? '');
  // In-memory test stores cannot be shared with another SQLite connection.
  if (!path && kind === 'csv') return Promise.resolve('');
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
          const keys=['id','createdAt','providerId','modelId','kind','conversationId','documentId','messageId','inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens','costUsd','costSource','aborted'];
          const cell=value=>'"'+String(value??'').replaceAll('"','""').replace(/^(?:[=+@\\-\\t\\r]|\\s+(?=[=+@-]))/,"'$&")+'"';
          parentPort.postMessage([keys.join(','),...records.map(row=>keys.map(key=>cell(row[key])).join(','))].join('\\r\\n'));
        } else parentPort.postMessage(records);
      } finally {db.close();}
    `, {eval:true,workerData:{path,kind,id}});
    worker.once('message', (records: UsageRecord[] | string) => resolve(records));
    worker.once('error', reject);
    worker.once('exit', code => { if (code) reject(new Error(`Usage reader exited: ${code}`)); });
  });
}
