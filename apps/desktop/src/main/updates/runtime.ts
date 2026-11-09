import { app, net } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Store } from '../db';
import { UpdateProvider } from './provider';
import { Updates } from './service';
export async function createUpdates(store: Store) {
  const { autoUpdater } = await import('electron-updater');
  let unsupported: 'development' | 'unsigned' | 'platform' | 'portable' | undefined;
  if (!app.isPackaged) unsupported = 'development';
  else if (process.platform === 'darwin') {
    try {
      await promisify(execFile)('/usr/bin/codesign', ['--verify', '--strict',
        dirname(dirname(dirname(app.getPath('exe'))))]);
      const result = await promisify(execFile)('/usr/bin/codesign',
        ['-d', '--verbose=4', dirname(dirname(dirname(app.getPath('exe'))))]);
      if (!/Authority=Developer ID Application:/.test(result.stdout + result.stderr)) unsupported = 'unsigned';
    } catch { unsupported = 'unsigned'; }
  } else if (process.platform === 'win32') {
    const root = dirname(app.getPath('exe'));
    if (process.arch !== 'x64') unsupported = 'platform';
    else if (!/^publisherName:\s*\S+/m.test(
      readFileSync(join(process.resourcesPath, 'app-update.yml'), 'utf8'))) unsupported = 'unsigned';
    if (!existsSync(join(process.resourcesPath, 'app-update.yml')) ||
      !existsSync(join(root, 'Uninstall VStudy Pro.exe'))) unsupported = 'portable';
  } else unsupported = 'platform';
  if (!unsupported) {
    try {
      const config = readFileSync(join(process.resourcesPath, 'app-update.yml'), 'utf8');
      if (!/^provider: generic$/m.test(config) ||
        !/^url: ['"]?https:\/\/github.com\/ava-apple\/vstudy-pro\/releases\/latest\/download['"]?$/m.test(config)) unsupported = 'portable';
    } catch { unsupported = 'portable'; }
  }
  autoUpdater.setFeedURL({ provider:'custom', updateProvider:UpdateProvider });
  autoUpdater.disableWebInstaller = true;
  autoUpdater.disableDifferentialDownload = true;
  return new Updates(autoUpdater, {unsupported, version:app.getVersion(),
    automatic:store.settings.get().autoCheckUpdates, online:() => net.isOnline(),
    saveAutomatic:enabled => {store.settings.set({autoCheckUpdates:enabled});} });
}
