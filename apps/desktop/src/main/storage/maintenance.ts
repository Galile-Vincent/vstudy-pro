/** Exclusive storage work rejects new IPC and drains accepted requests before settling background jobs. */
let busy=false,locked=false;
export const holdStorageUntilRestart=():void=>{locked=true;};
const active=new Set<Promise<void>>();
export const storageBusy=():boolean=>busy;
export function enterStorageRequest():()=>void {
  if(busy)throw new Error('storage.busy');
  let release!:()=>void;const finished=new Promise<void>(resolve=>{release=resolve;});active.add(finished);
  return ()=>{active.delete(finished);release();};
}
export async function exclusiveStorage<T>(settle:()=>Promise<void>,work:()=>Promise<T>):Promise<T>{
  if(busy)throw new Error('storage.busy');busy=true;
  try {await Promise.all(active);await settle();return await work();}finally{busy=locked;}
}
