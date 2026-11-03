import { expect, it, vi } from 'vitest';
import { probeCodexRateLimits, createRateLimitProbe } from './rate-limits';
it('initializes app-server, reads account limits, and kills it after the reply', async () => {
  const script = `require('readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line); if(r.method==='initialize')console.log(JSON.stringify({id:1,result:{}})); if(r.method==='account/rateLimits/read')console.log(JSON.stringify({id:2,result:{rateLimits:{primary:{usedPercent:62,windowDurationMins:300,resetsAt:1793715000},secondary:{usedPercent:18,windowDurationMins:10080}}}}));}); setInterval(()=>{},100);`;
  expect(await probeCodexRateLimits(process.execPath,['-e',script])).toEqual({label:'300 minute window',usedPercent:62,resetsAt:'2026-11-03T14:10:00.000Z'});
  expect(await probeCodexRateLimits(process.execPath,['-e','setInterval(()=>{},100)'],30)).toBeUndefined();
});
it('deduplicates on-demand probes and caches success or failure for 60 seconds', async () => {
  const load=vi.fn(async()=>({label:'window',usedPercent:42}));const probe=createRateLimitProbe(load);
  expect(await Promise.all([probe(),probe()])).toEqual([{label:'window',usedPercent:42},{label:'window',usedPercent:42}]);
  await probe();expect(load).toHaveBeenCalledTimes(1);
  vi.spyOn(Date,'now').mockReturnValue(Date.now()+60001);
  await probe();expect(load).toHaveBeenCalledTimes(2);vi.restoreAllMocks();
});

it.skipIf(process.env.VSTUDY_REAL_RATE_LIMIT_SMOKE !== '1')('reads rate limits from the installed Codex app-server',async()=>{
  const {findCli}=await import('./cli');const binary=await findCli('codex');
  expect(binary).toBeTruthy();
  const result=await probeCodexRateLimits(binary!);
  expect(result?.usedPercent).toBeTypeOf('number');
});
