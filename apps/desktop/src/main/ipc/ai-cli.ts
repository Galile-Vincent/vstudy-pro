/**
 * Register guided setup capabilities through the existing strict sender and schema registrar.
 * Terminal input, plans, output, and cancellation belong only to the originating webContents.
 * @packageDocumentation
 */
import { app, clipboard, type WebContents } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import type { IpcChannel } from '../../shared/ipc';
import { aiCliContract } from '../../shared/ai-cli';
import type { ExecutablePins } from '../providers/executable-pins';
import type { ProviderRegistry } from '../providers';
import type { ChatService } from '../services/chat';
import { systemExecutable } from '../platform/process';
import { SetupStore } from '../providers/setup/store';
import { ReleaseSource } from '../providers/setup/releases';
import { setupNetwork } from '../providers/setup/fixtures';
import { AiCliSetup } from '../providers/setup/service';
import type { createIpcRegistrar } from './register';
export function registerAiCliIpc(registrar: ReturnType<typeof createIpcRegistrar>, implemented: Set<IpcChannel>, providers: ProviderRegistry, pins: ExecutablePins, chat: ChatService) {
  const subscribers = new Set<WebContents>();
  const changed = () => { for (const sender of subscribers) if (!sender.isDestroyed()) sender.send('vstudy:providers-changed'); };
  const store = new SetupStore(join(app.getPath('userData'), 'ai-tools'));
  pins.setManagedResolver(binary => store.identity(binary));
  let service: AiCliSetup | undefined;
  const ready = setupNetwork(app.isPackaged).then(({ network, fingerprint, loginInterpreters }) => {
    service = new AiCliSetup({ store, source: new ReleaseSource(network, process.platform, process.arch, fingerprint), registry: providers, pins, chatBusy: () => chat.isBusy, chatRevision: () => chat.activityRevision, changed, loginInterpreters });
    service.startUpdates(); return service;
  });
  void ready.catch(() => {});
  const safe: Pick<typeof registrar, 'handle'> = { handle(channel, handler) {
    registrar.handle(channel, async (request, event) => {
      try {
        if (!subscribers.has(event.sender)) { subscribers.add(event.sender); event.sender.once('destroyed', () => subscribers.delete(event.sender)); }
        return await handler(request, event);
      } catch { throw new Error('AI tool setup request failed'); }
    });
  } };
  for (const channel of Object.keys(aiCliContract) as (keyof typeof aiCliContract)[]) implemented.add(channel);
  safe.handle('ai-cli:list', async () => (await ready).list());
  safe.handle('ai-cli:consent', async ({ provider, enabled }) => { await (await ready).consent(provider, enabled); return { ok: true }; });
  safe.handle('ai-cli:preview', async ({ actionId }, event) => (await ready).preview(event.sender, actionId));
  safe.handle('ai-cli:run', async ({ actionId, token }, event) => (await ready).run(event.sender, actionId, token));
  safe.handle('ai-cli:read', async ({ id }, event) => (await ready).sessions.read(event.sender, id));
  safe.handle('ai-cli:input', async ({ id, data }, event) => { (await ready).sessions.input(event.sender, id, data); return { ok: true }; });
  safe.handle('ai-cli:resize', async ({ id, columns, rows }, event) => { (await ready).sessions.resize(event.sender, id, columns, rows); return { ok: true }; });
  safe.handle('ai-cli:close', async ({ id }, event) => { await (await ready).sessions.close(event.sender, id); return { ok: true }; });
  safe.handle('ai-cli:preferences', async () => (await ready).preferences());
  safe.handle('ai-cli:setPreferences', async preferences => (await ready).setPreferences(preferences));
  safe.handle('ai-cli:checkUpdates', async () => (await ready).checkUpdates());
  safe.handle('ai-cli:openTerminal', async ({ actionId, token }, event) => {
    const setup = await ready, plan = setup.takePlan(event.sender, actionId, token);
    clipboard.writeText(plan.public.command);
    if (process.platform === 'darwin') {
      await new Promise<void>((resolve, reject) => execFile('/usr/bin/open', ['-a', 'Terminal', plan.cwd], { timeout: 10_000 }, error => error ? reject(error) : resolve()));
    } else {
      const binary = process.platform === 'win32' ? systemExecutable('cmd.exe') : '/usr/bin/x-terminal-emulator';
      const child = spawn(binary, process.platform === 'win32' ? ['/D'] : [], { cwd: plan.cwd, env: { ...plan.env }, shell: false, detached: true, stdio: 'ignore', windowsHide: false });
      await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref();
    }
    return { ok: true };
  });
  return async () => { subscribers.clear(); await ready.catch(() => {}); await service?.dispose(); };
}
