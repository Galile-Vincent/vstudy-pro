import { app, screen, powerMonitor } from 'electron';
import { release, totalmem, cpus } from 'node:os';
import type { DatabaseSync } from 'node:sqlite';
import { AnalyticsService, setAnalytics } from './service';
import { analyticsConfig } from './config';
import { deviceProperties } from './device';
import { AnalyticsActivity } from './activity';

export function initializeAnalytics(db:DatabaseSync,language:string) {
  let device:Record<string,unknown>={};
  let config:ReturnType<typeof analyticsConfig>=null;
  try {
    const display=screen.getPrimaryDisplay();
    device=deviceProperties({platform:process.platform,os:process.platform === 'darwin' ? process.getSystemVersion() : release(),arch:process.arch,version:app.getVersion(),language:language === 'auto' ? app.getLocale() : language,memory:totalmem()/2**30,cores:cpus().length,width:display.size.width,scale:display.scaleFactor,electron:process.versions.electron!,chrome:process.versions.chrome!});
    config=analyticsConfig(app.isPackaged);
  } catch {config=null;}
  const service=new AnalyticsService(db,config,device);
  setAnalytics(service);
  const activity=new AnalyticsActivity(service,()=>powerMonitor.getSystemIdleTime());
  service.onConsentChanged=()=>activity.reset();
  const timer=setInterval(()=>{try {activity.sample();} catch {return;}},5000);
  timer.unref();
  service.start();
  return {service,activity,async stop(){clearInterval(timer);activity.end();await service.stop();setAnalytics(undefined);}};
}
