/** Node-only application data defaults shared by the app's local CLI adapters. Electron supplies its authoritative userData at runtime. @packageDocumentation */
import { homedir } from 'node:os';
import { join, win32 } from 'node:path';
export interface AppDataOptions {platform?:NodeJS.Platform;home?:string;environment?:NodeJS.ProcessEnv}
export function defaultAppDataPath(options:AppDataOptions={}):string {
  const platform=options.platform ?? process.platform,home=options.home ?? homedir(),environment=options.environment ?? process.env;
  if (platform==='win32') return win32.join(environment.APPDATA ?? win32.join(home,'AppData','Roaming'),'@vstudy','desktop');
  if (platform==='darwin') return join(home,'Library','Application Support','@vstudy','desktop');
  return join(environment.XDG_CONFIG_HOME ?? join(home,'.config'),'@vstudy','desktop');
}
