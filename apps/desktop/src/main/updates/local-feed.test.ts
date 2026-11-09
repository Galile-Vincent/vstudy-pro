import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { AppUpdater } from 'electron-updater/out/AppUpdater';
import type { AppAdapter } from 'electron-updater/out/AppAdapter';
import { expect, it } from 'vitest';
class FeedProbe extends AppUpdater {
  constructor(app: AppAdapter) { super(null, app); }
  protected async doDownloadUpdate(): Promise<never> { throw new Error('Metadata probe only'); }
  quitAndInstall() { throw new Error('Metadata probe only'); }
}
it('checks a higher disk-backed generic feed through dev-app-update.yml', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vstudy-update-feed-'));
  const server = createServer(async (request, response) => {
    const name = new URL(request.url!, 'http://localhost').pathname.slice(1);
    if (!['latest-mac.yml', 'latest.yml', 'latest-linux.yml', 'latest-linux-arm64.yml'].includes(name)) {
      response.writeHead(404).end(); return;
    }
    response.end(await readFile(join(root, 'latest.yml')));
  });
  try {
    await writeFile(join(root, 'latest.yml'), 'version: 99.0.0\nfiles: []\npath: fake.zip\nsha512: abc\n');
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    const config = join(root, 'dev-app-update.yml');
    await writeFile(config, `provider: generic\nurl: http://127.0.0.1:${address.port}\n`);
    const updater = new FeedProbe({version:'0.4.4',name:'VStudy feed probe',isPackaged:false,
      appUpdateConfigPath:config,userDataPath:root,baseCachePath:root,
      whenReady:async () => {},relaunch:() => {},quit:() => {},onQuit:() => {}});
    Reflect.set(updater, 'httpExecutor', {request:async (options: {
      protocol:string;hostname:string;port:number;path:string;
    }) => (await fetch(`${options.protocol}//${options.hostname}:${options.port}${options.path}`)).text()});
    updater.forceDevUpdateConfig = true;
    updater.autoDownload = false;
    updater.logger = null;
    const result = await updater.checkForUpdates();
    expect(result?.isUpdateAvailable).toBe(true);
    expect(result?.updateInfo.version).toBe('99.0.0');
  } finally {
    server.close(); await rm(root, {recursive:true,force:true});
  }
});
