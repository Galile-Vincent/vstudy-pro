import { DatabaseSync } from 'node:sqlite';
import { LibraryService } from './library';
import type { Store } from '../db';
import type { IpcRequest } from '../../shared/ipc';
type Job = {path:string;root:string} & ({kind:'search';request:IpcRequest<'library:search'>} | {kind:'list';request:IpcRequest<'library:documents:list'>});
function run(job: Job) {
  const send = (value: unknown) => process.parentPort ? process.parentPort.postMessage(value) : process.send!(value);
  const db = new DatabaseSync(job.path, {readOnly:true});
  try {
    const library = new LibraryService({db} as Store, job.root);
    send({result:job.kind==='search' ? library.search.search(job.request.text,job.request.limit,job.request.cursor) : library.list(job.request)});
  } catch(error) {send({error:error instanceof Error ? error.message : 'Search failed'});}
  finally {db.close();}
}
if (process.parentPort) process.parentPort.once('message', event => run(event.data));
else process.once('message', job => run(job as Job));
