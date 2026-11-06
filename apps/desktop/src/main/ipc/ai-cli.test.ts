/** IPC keeps main-issued capabilities behind sender validation and redacts boundary exceptions. @packageDocumentation */
import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import { temporaryDirectories } from '../providers/setup/test-fixtures';
import { ExecutablePins } from '../providers/executable-pins';
import { ProviderRegistry } from '../providers';
import type { ChatService } from '../services/chat';
import { aiCliContract } from '../../shared/ai-cli';
import type { IpcChannel } from '../../shared/ipc';
import { createIpcRegistrar } from './register';
import { registerAiCliIpc } from './ai-cli';
const electron = vi.hoisted(() => ({ app: { getPath: vi.fn(), isPackaged: true }, clipboard: { writeText: vi.fn() } }));
vi.mock('electron', () => electron);
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<typeof import('node:child_process')>(), execFile: vi.fn((...args: unknown[]) => { const callback = args.at(-1); if (typeof callback === 'function') callback(new Error('PRIVATE https://auth.example.test/?code=SECRET')); }) }));
const temporary = temporaryDirectories();
const disposers: (() => Promise<void>)[] = [];
afterEach(async () => { for (const dispose of disposers) await dispose(); disposers.length = 0; vi.restoreAllMocks(); });
class Window extends EventEmitter {
  mainFrame = {}; id = 1; send = vi.fn(); isDestroyed() { return false; }
}
async function backend() {
  const root = await temporary(); electron.app.getPath.mockReturnValue(root);
  const owner = new Window(), stranger = new Window();
  const handlers = new Map<string, (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>>();
  const ipc = { handle: (channel: string, handler: (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>) => { handlers.set(channel, handler); }, removeHandler: (channel: string) => { handlers.delete(channel); } };
  const registrar = createIpcRegistrar(ipc, event => event.sender === owner as unknown);
  const providers = new ProviderRegistry(), pins = new ExecutablePins(`${root}/pins.json`, async () => false);
  const implemented = new Set<IpcChannel>();
  const dispose = registerAiCliIpc(registrar, implemented, providers, pins, { isBusy: false, activityRevision: 0 } as ChatService);
  disposers.push(async () => { await dispose(); registrar.dispose(); });
  const invoke = (channel: string, payload: unknown, sender = owner, frame = sender.mainFrame) => handlers.get(channel)!({ sender, senderFrame: frame } as unknown as IpcMainInvokeEvent, payload);
  return { invoke, owner, stranger, implemented };
}
it('registers the entire contract with strict sender, subframe, and request validation', async () => {
  const { invoke, stranger, implemented } = await backend();
  expect([...implemented].filter(channel => channel.startsWith('ai-cli:'))).toEqual(Object.keys(aiCliContract));
  await expect(invoke('ai-cli:list', {}, stranger)).rejects.toThrow('Untrusted IPC sender');
  await expect(invoke('ai-cli:list', {}, undefined, {})).rejects.toThrow('Untrusted IPC sender');
  const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(invoke('ai-cli:preview', { actionId: 'advanced-shell', executable: '/bin/sh' })).rejects.toThrow('VSTUDY_STATUS');
  expect(logging).toHaveBeenCalled();
  expect(await invoke('ai-cli:preferences', {})).toEqual({ updateChecks: false, autoUpdateWhenIdle: false, advancedShell: false });
});
it('notifies the existing preload bridge and sanitizes native errors before the registrar logs them', async () => {
  const { invoke, owner } = await backend(), logging = vi.spyOn(console, 'error').mockImplementation(() => {});
  await invoke('ai-cli:setPreferences', { updateChecks: false, autoUpdateWhenIdle: false, advancedShell: true });
  expect(owner.send).toHaveBeenCalledWith('vstudy:providers-changed');
  const preview = await invoke('ai-cli:preview', { actionId: 'advanced-shell' }) as { token: string; command: string };
  await expect(invoke('ai-cli:openTerminal', { actionId: 'advanced-shell', token: preview.token })).rejects.toThrow('VSTUDY_STATUS');
  expect(electron.clipboard.writeText).toHaveBeenCalledWith(preview.command);
  const logs = JSON.stringify(logging.mock.calls);
  expect(logs).not.toContain('PRIVATE'); expect(logs).not.toContain('SECRET'); expect(logs).not.toContain('https://auth');
  await expect(invoke('ai-cli:run', { actionId: 'advanced-shell', token: preview.token })).rejects.toThrow('VSTUDY_STATUS');
});
