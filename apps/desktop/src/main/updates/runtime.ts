import {cancellableInstall} from './install';
import { parseUpdateInfo } from 'electron-updater/out/providers/Provider';
import { EventEmitter } from 'node:events';
import { app, net, autoUpdater as nativeUpdater } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Store } from '../db';
import { UpdateProvider, updateFeed } from './provider';
import { Updates } from './service';
function updateConfig(raw: string) {
  if (raw.length > 65536 || /[&*!]/.test(raw)) throw new Error('Invalid updater config');
  const config = parseUpdateInfo(raw, 'app-update.yml', new URL(updateFeed)) as unknown as {
    provider?:unknown; url?:unknown; publisherName?:unknown;
  };
  if (config?.provider !== 'generic' || config.url !== updateFeed) throw new Error('Invalid updater config');
  return config;
}
export function windowsUpdateSupport(raw: string, arch: string, installed: boolean) {
  if (arch !== 'x64') return 'platform';
  const publisher = updateConfig(raw).publisherName;
  const names = Array.isArray(publisher) ? publisher : [publisher];
  if (!names.length || !names.every(name=>typeof name === 'string' && name.trim().length > 0)) return 'unsigned';
  return installed ? undefined : 'portable';
}
async function setupUpdater() {
  const { autoUpdater } = await import('electron-updater');
  let unsupported: 'development' | 'unsigned' | 'platform' | 'portable' | undefined;
  if (!app.isPackaged) unsupported = 'development';
  else if (process.platform === 'darwin' && process.arch !== 'arm64') unsupported = 'platform';
  else if (process.platform === 'darwin') {
    try {
      await promisify(execFile)('/usr/bin/codesign', ['--verify', '--strict',
        dirname(dirname(dirname(app.getPath('exe'))))], {timeout:3000});
      const result = await promisify(execFile)('/usr/bin/codesign',
        ['-d', '--verbose=4', dirname(dirname(dirname(app.getPath('exe'))))], {timeout:3000});
      if (!/Authority=Developer ID Application:/.test(result.stdout + result.stderr)) unsupported = 'unsigned';
    } catch { unsupported = 'unsigned'; }
  } else if (process.platform === 'win32') {
    const root = dirname(app.getPath('exe'));
    unsupported = windowsUpdateSupport(
      readFileSync(join(process.resourcesPath,'app-update.yml'),'utf8'), process.arch,
      existsSync(join(root,'Uninstall VStudy Pro.exe')));
  } else unsupported = 'platform';
  if (!unsupported) {
    try {
      updateConfig(readFileSync(join(process.resourcesPath,'app-update.yml'),'utf8'));
    } catch { unsupported = 'portable'; }
  }
  autoUpdater.setFeedURL({ provider:'custom', updateProvider:UpdateProvider });
  autoUpdater.disableWebInstaller = true;
  autoUpdater.disableDifferentialDownload = true;
  if ('cancelInstall' in autoUpdater) return {
    autoUpdater:autoUpdater as typeof autoUpdater & {cancelInstall:() => void}, unsupported,
  };
  const updater = Object.assign(autoUpdater, cancellableInstall(autoUpdater,
    process.platform === 'darwin' ? nativeUpdater : undefined));
  return {autoUpdater:updater,unsupported};
}
export function createUpdates(store: Store, shown: Promise<void> = Promise.resolve()) {
  const fallback = Object.assign(new EventEmitter(), {autoDownload:false,allowDowngrade:false,
    allowPrerelease:false,autoInstallOnAppQuit:false,checkForUpdates:async()=>null,
    downloadUpdate:async()=>[],quitAndInstall:()=>{}});
  const service = new Updates(fallback as unknown as ConstructorParameters<typeof Updates>[0], {
    unsupported:'platform',version:app.getVersion(),automatic:store.settings.get().autoCheckUpdates,
    ready:()=>store.settings.get().onboardingCompleted === true,
    getAutomatic:()=>store.settings.get().autoCheckUpdates,
    online:()=>net.isOnline(),saveAutomatic:enabled=>{store.settings.set({autoCheckUpdates:enabled});},
  });
  void shown.then(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([setupUpdater(), new Promise<never>((_resolve,reject)=>{
        timer = setTimeout(()=>reject(new Error('Updater setup timeout')), 7000);
      })]);
      service.initialize(result.autoUpdater,result.unsupported);
    } catch { service.initialize(fallback as unknown as ConstructorParameters<typeof Updates>[0],'unsigned'); }
    finally { clearTimeout(timer); }
  });
  return service;
}
