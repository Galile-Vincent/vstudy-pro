/**
 * Register guided setup capabilities through the existing strict sender and schema registrar.
 * Terminal input, plans, output, and cancellation belong only to the originating webContents.
 * @packageDocumentation
 */
import { app, clipboard, type WebContents } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { IpcChannel } from '../../shared/ipc';
import { aiCliContract } from '../../shared/ai-cli';
import type { ExecutablePins } from '../providers/executable-pins';
import type { ProviderRegistry } from '../providers';
import type { ChatService } from '../services/chat';
import { systemExecutable } from '../platform/process';
import { showAttachedMessage } from '../dialogs';
import { tr } from '../i18n';
import { SetupStore } from '../providers/setup/store';
import { ReleaseSource } from '../providers/setup/releases';
import { setupNetwork } from '../providers/setup/fixtures';
import { artifactVerifier } from '../providers/setup/authenticity';
import { AiCliSetup } from '../providers/setup/service';
import type { createIpcRegistrar } from './register';
export function registerAiCliIpc(registrar: ReturnType<typeof createIpcRegistrar>, implemented: Set<IpcChannel>, providers: ProviderRegistry, pins: ExecutablePins, chat: ChatService) {
  const subscribers = new Map<WebContents, () => void>();
  const changed = () => { for (const sender of subscribers.keys()) if (!sender.isDestroyed()) sender.send('vstudy:providers-changed'); };
  let service: AiCliSetup | undefined;
  const ready = setupNetwork(app.isPackaged).then(({ network, fingerprint, loginInterpreters }) => {
    const store = new SetupStore(join(app.getPath('userData'), 'ai-tools'), artifactVerifier(fingerprint));
    service = new AiCliSetup({ store, source: new ReleaseSource(network, process.platform, process.arch, fingerprint), registry: providers, pins, chatBusy: () => chat.isBusy, chatRevision: () => chat.activityRevision, changed, loginInterpreters });
    service.startUpdates(); return service;
  });
  void ready.catch(() => {});
  const safe: Pick<typeof registrar, 'handle'> = { handle(channel, handler) {
    registrar.handle(channel, async (request, event) => {
      try {
        if (!subscribers.has(event.sender)) {
          const sender = event.sender;
          const navigated = (details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>) => {
            if (details.isMainFrame && !details.isSameDocument) void service?.resetOwner(sender);
          };
          const detach = () => { sender.removeListener('did-start-navigation', navigated); subscribers.delete(sender); };
          subscribers.set(sender, detach); sender.on('did-start-navigation', navigated); sender.once('destroyed', detach);
        }
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
  safe.handle('ai-cli:setPreferences', async preferences => {
    const setup = await ready;
    if (preferences.advancedShell && !setup.preferences().advancedShell) {
      const result = await showAttachedMessage({ type: 'warning', message: tr('ai-cli:advanced_title'), detail: tr('ai-cli:pref_advancedShell_help'), buttons: [tr('common:cancel'), tr('settings:allow')], defaultId: 0, cancelId: 0 });
      if (result.response !== 1) return setup.preferences();
    }
    return setup.setPreferences(preferences);
  });
  safe.handle('ai-cli:checkUpdates', async () => (await ready).checkUpdates());
  safe.handle('ai-cli:openTerminal', async ({ actionId, token }, event) => {
    const setup = await ready, plan = await setup.terminalPlan(event.sender, actionId, token);
    clipboard.writeText(plan.command);
    if (process.platform === 'darwin') {
      await new Promise<void>((resolve, reject) => execFile('/usr/bin/open', ['-a', 'Terminal', plan.cwd], { timeout: 10_000, cwd: plan.cwd, env: { ...plan.env } }, error => error ? reject(error) : resolve()));
    } else {
      const launch = async (binary: string, args: string[]) => {
        const child = spawn(binary, args, { cwd: plan.cwd, env: { ...plan.env }, shell: false, detached: true, stdio: 'ignore', windowsHide: false });
        await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref();
      };
      if (process.platform === 'win32') {
        const powershell = systemExecutable('WindowsPowerShell\\v1.0\\powershell.exe');
        const terminal = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'wt.exe') : null;
        if (terminal && existsSync(terminal)) {
          try { await launch(terminal, ['new-tab', '--startingDirectory', plan.cwd, powershell, '-NoLogo', '-NoProfile']); return { ok: true }; }
          catch { /* Windows Terminal aliases can remain after uninstall. */ }
        }
        await launch(powershell, ['-NoLogo', '-NoProfile', '-NoExit']);
      } else await launch('/usr/bin/x-terminal-emulator', []);
    }
    return { ok: true };
  });
  return async () => { for (const detach of subscribers.values()) detach(); await ready.catch(() => {}); await service?.dispose(); };
}
