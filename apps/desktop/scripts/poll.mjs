import { setTimeout } from 'node:timers/promises';
export async function poll(predicate, timeoutMs=30_000) {
 const deadline=Date.now()+timeoutMs;
 do {const result=await predicate();if(result)return result;await setTimeout(100);} while(Date.now()<deadline);
 throw new Error(`Condition did not become true within ${timeoutMs} ms`);
}
