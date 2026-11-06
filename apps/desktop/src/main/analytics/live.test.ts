import { expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { openStore } from '../db';
import { AnalyticsService } from './service';
import { analyticsConfig } from './config';

it.skipIf(process.env.VSTUDY_ANALYTICS_LIVE !== '1')('sends one explicitly authorized synthetic app_opened',async()=>{
  expect(process.env.VSTUDY_ANALYTICS_ENABLE).toBe('1');
  const store=openStore(':memory:');
  store.db.prepare('UPDATE analytics_state SET value=? WHERE key=?').run('true','analytics_enabled');
  let status=0;
  let payload:unknown;
  const request:typeof fetch=async(url,init)=>{
    payload=JSON.parse(String(init?.body));
    const response=await fetch(url,init);
    status=response.status;
    return response;
  };
  const device={platform:'linux',os_version:'6.0',cpu_arch:'x64',app_version:'0.3.0',app_language:'en',memory_bucket:'8',cpu_cores_bucket:'4',display_size_bucket:'medium',display_scale_bucket:'1',electron_major:42,chrome_major:140};
  try {
    const service=new AnalyticsService(store.db,analyticsConfig(false),device,request);
    expect(service.track('app_opened',device)).toBe(true);
    await service.flush();
    mkdirSync(resolve(import.meta.dirname,'../../../../../node_modules/.cache/analytics'),{recursive:true});
    writeFileSync(resolve(import.meta.dirname,'../../../../../node_modules/.cache/analytics/live-payload.json'),JSON.stringify({url:analyticsConfig(false)!.host+'/batch/',status,payload},null,2)+'\n');
    expect(status).toBeGreaterThanOrEqual(200);expect(status).toBeLessThan(300);
    expect(store.db.prepare('SELECT count(*) AS count FROM analytics_queue').get()?.count).toBe(0);
  } finally {store.close();}
},15_000);
