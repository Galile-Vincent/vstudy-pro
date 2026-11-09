import { reviewWorkers } from "../review/workers";
/**
 * Serialize storage maintenance against active document and chat work.
 * Owned by main/storage.
 * Filesystem operations stay inside the application namespace and preserve recoverable state.
 * @packageDocumentation
 */
/** Exclusive storage work rejects new IPC and drains accepted requests before settling background jobs. */
let busy=false,locked=false;
export const holdStorageUntilRestart=():void=>{locked=true;};
const active=new Set<Promise<void>>();
let revision = 0;
export const storageWorkRevision = () => revision;
export async function waitForStorageRequests() { await Promise.all(active); }
export const storageBusy=():boolean=>busy;
/** Acquire request ownership and return the release required by the caller. */
export function enterStorageRequest():()=>void {
  if(busy)throw new Error('storage.busy');
  revision++;
  let release!:()=>void;const finished=new Promise<void>(resolve=>{release=resolve;});active.add(finished);
  return ()=>{active.delete(finished);release();};
}
/** Run maintenance only when document, conversion, and chat ownership permits it. */
export async function exclusiveStorage<T>(settle:()=>Promise<void>,work:()=>Promise<T>):Promise<T>{
  if(busy)throw new Error('storage.busy');busy=true;
  try {reviewWorkers.suspend("storage");await Promise.all(active);await reviewWorkers.waitForIdle();await settle();return await work();}finally{busy=locked;if(!locked)reviewWorkers.resume("storage");}
}
