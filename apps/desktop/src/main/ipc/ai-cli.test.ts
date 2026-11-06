/** IPC keeps main-issued capabilities behind sender validation and redacts boundary exceptions. @packageDocumentation */
import { EventEmitter } from 'node:events';
import { execFile, spawn } from 'node:child_process';
import { realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import { temporaryDirectories } from '../providers/setup/test-fixtures';
import { windowsFixtureImage } from '../providers/setup/native-fixtures';
import { ExecutablePins, setExecutablePins } from '../providers/executable-pins';
import { ProviderRegistry } from '../providers';
import type { ChatService } from '../services/chat';
import { aiCliContract } from '../../shared/ai-cli';
import type { IpcChannel } from '../../shared/ipc';
import { createIpcRegistrar } from './register';
import { registerAiCliIpc } from './ai-cli';
const approval = vi.hoisted(() => ({ show: vi.fn(async () => ({ response: 1, checkboxChecked: false })) }));
const host = vi.hoisted(() => ({ windows: process.platform === 'win32', rejectLaunch: false }));
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>();
  const directories = new Set<number>();
  let nextDirectory = -1;
  return { ...fs, openSync: (path: Parameters<typeof fs.openSync>[0], flags: Parameters<typeof fs.openSync>[1], mode?: Parameters<typeof fs.openSync>[2]) => {
    // A simulated Unix terminal still needs a Windows-compatible filesystem boundary.
    if (host.windows && process.platform !== 'win32' && flags === 'r' && fs.statSync(path).isDirectory()) {
      const handle = nextDirectory--; directories.add(handle); return handle;
    }
    return fs.openSync(path, flags, mode);
  }, fsyncSync: (handle: number) => { if (!directories.has(handle)) fs.fsyncSync(handle); },
  closeSync: (handle: number) => { if (!directories.delete(handle)) fs.closeSync(handle); },
  lstatSync: (path: Parameters<typeof fs.lstatSync>[0]) => {
    const info = fs.lstatSync(path);
    if (host.windows && process.platform !== 'win32') info.mode &= ~0o077;
    return info;
  } };
});
vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return { ...fs, stat: async (path: Parameters<typeof fs.stat>[0]) => {
    const info = await fs.stat(path);
    if (host.windows && process.platform !== 'win32') info.mode &= ~0o077;
    return info;
  } };
});
vi.mock('../dialogs', () => ({ showAttachedMessage: approval.show }));
beforeEach(() => { host.rejectLaunch = false; approval.show.mockClear().mockResolvedValue({ response: 1, checkboxChecked: false }); });
const electron = vi.hoisted(() => ({ app: { getPath: vi.fn(), isPackaged: true }, clipboard: { writeText: vi.fn() } }));
vi.mock('electron', () => electron);
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execFile: vi.fn((...args: unknown[]) => { const callback = args.at(-1); if (typeof callback === 'function') callback(new Error('PRIVATE https://auth.example.test/?code=SECRET')); }),
  spawn: vi.fn(() => { const child = Object.assign(new EventEmitter(), { unref: vi.fn() }); queueMicrotask(() => host.rejectLaunch ? child.emit('error', new Error('PRIVATE https://auth.example.test/?code=SECRET')) : child.emit('spawn')); return child; }),
}));
const temporary = temporaryDirectories();
const disposers: (() => Promise<void>)[] = [];
afterEach(async () => { for (const dispose of disposers) await dispose(); disposers.length = 0; vi.restoreAllMocks(); vi.unstubAllEnvs(); });
class Window extends EventEmitter {
  mainFrame = {}; id = 1; send = vi.fn(); isDestroyed() { return false; }
}
async function backend() {
  const root = await realpath(await temporary()); electron.app.getPath.mockReturnValue(root);
  const owner = new Window(), stranger = new Window();
  const handlers = new Map<string, (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>>();
  const ipc = { handle: (channel: string, handler: (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>) => { handlers.set(channel, handler); }, removeHandler: (channel: string) => { handlers.delete(channel); } };
  const registrar = createIpcRegistrar(ipc, event => event.sender === owner as unknown);
  const providers = new ProviderRegistry(), confirm = vi.fn(async () => false), pins = new ExecutablePins(`${root}/pins.json`, confirm);
  setExecutablePins(pins);
  const implemented = new Set<IpcChannel>();
  const dispose = registerAiCliIpc(registrar, implemented, providers, pins, { isBusy: false, activityRevision: 0 } as ChatService);
  disposers.push(async () => { await dispose(); registrar.dispose(); });
  const invoke = (channel: string, payload: unknown, sender = owner, frame = sender.mainFrame) => handlers.get(channel)!({ sender, senderFrame: frame } as unknown as IpcMainInvokeEvent, payload);
  return { invoke, owner, stranger, implemented, pins, root, confirm };
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
  host.rejectLaunch = true; vi.stubEnv('LOCALAPPDATA', undefined);
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
it.each([
  ['linux', 'claude'], ['linux', 'codex'], ['linux', 'agy'],
  ['win32', 'claude'], ['win32', 'codex'], ['win32', 'agy'],
] as const)('opens a manual login terminal on %s for %s while embedded login stays unsupported', async (platform, provider) => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: platform });
  vi.stubEnv('DISPLAY', ':fixture'); vi.stubEnv('LOCALAPPDATA', undefined); vi.mocked(spawn).mockClear();
  const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const { invoke, pins, root } = await backend(), binary = join(root, `${provider}.exe`), actionId = `login-${provider}`;
    await writeFile(binary, windowsFixtureImage('IPC metadata fixture'), { mode: 0o700 }); await pins.choose(provider, binary);
    await invoke('ai-cli:consent', { provider, enabled: true });
    const blocked = aiCliContract['ai-cli:preview'].response.parse(await invoke('ai-cli:preview', { actionId }));
    await expect(invoke('ai-cli:run', { actionId, token: blocked.token })).rejects.toThrow('VSTUDY_STATUS');
    const preview = await invoke('ai-cli:preview', { actionId });
    const plan = aiCliContract['ai-cli:preview'].response.parse(preview);
    expect(plan).toMatchObject({ available: false, reason: 'unsupported' });
    expect(await invoke('ai-cli:openTerminal', { actionId, token: plan.token })).toEqual({ ok: true });
    expect(electron.clipboard.writeText).toHaveBeenLastCalledWith(plan.command);
    expect(spawn).toHaveBeenCalledWith(platform === 'win32' ? expect.stringMatching(/powershell\.exe$/) : '/usr/bin/x-terminal-emulator', platform === 'win32' ? ['-NoLogo', '-NoProfile', '-NoExit'] : [], expect.objectContaining({ shell: false, cwd: plan.cwd, env: expect.objectContaining({ DISABLE_AUTOUPDATER: '1', ...(platform === 'linux' ? { DISPLAY: ':fixture' } : {}) }) }));
    expect(vi.mocked(spawn).mock.calls[0]?.[2]?.env).not.toHaveProperty('BROWSER');
    await expect(invoke('ai-cli:openTerminal', { actionId, token: plan.token })).rejects.toThrow('VSTUDY_STATUS');
    const revoked = aiCliContract['ai-cli:preview'].response.parse(await invoke('ai-cli:preview', { actionId }));
    await invoke('ai-cli:consent', { provider, enabled: false });
    await expect(invoke('ai-cli:openTerminal', { actionId, token: revoked.token })).rejects.toThrow('VSTUDY_STATUS');
    expect(spawn).toHaveBeenCalledTimes(1);
  } finally { Object.defineProperty(process, 'platform', original); logging.mockRestore(); }
});
it.skipIf(process.platform !== 'darwin')('copies a direct manual login command after executable approval and rejects a changed file', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'PRIVATE'); vi.stubEnv('BASH_ENV', '/private/fixture');
  const { invoke, pins, root, confirm } = await backend(), binary = join(root, 'claude');
  await writeFile(binary, '#!/bin/sh\nexit 0\n', { mode: 0o700 }); await pins.choose('claude', binary);
  await invoke('ai-cli:consent', { provider: 'claude', enabled: true });
  const preview = aiCliContract['ai-cli:preview'].response.parse(await invoke('ai-cli:preview', { actionId: 'login-claude' }));
  const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(invoke('ai-cli:openTerminal', { actionId: 'login-claude', token: preview.token })).rejects.toThrow('VSTUDY_STATUS');
  expect(electron.clipboard.writeText).toHaveBeenLastCalledWith(`'${binary}' 'auth' 'login'`);
  expect(execFile).toHaveBeenLastCalledWith('/usr/bin/open', ['-a', 'Terminal', expect.any(String)], expect.objectContaining({ cwd: expect.any(String), env: expect.objectContaining({ DISABLE_AUTOUPDATER: '1' }) }), expect.any(Function));
  expect(vi.mocked(execFile).mock.calls.at(-1)?.[2]).not.toHaveProperty('env.OPENAI_API_KEY');
  expect(vi.mocked(execFile).mock.calls.at(-1)?.[2]).not.toHaveProperty('env.BASH_ENV');
  expect(confirm).not.toHaveBeenCalled();
  const changed = aiCliContract['ai-cli:preview'].response.parse(await invoke('ai-cli:preview', { actionId: 'login-claude' }));
  await writeFile(binary, '#!/bin/sh\nexit 1\n');
  electron.clipboard.writeText.mockClear(); vi.mocked(execFile).mockClear();
  await expect(invoke('ai-cli:openTerminal', { actionId: 'login-claude', token: changed.token })).rejects.toThrow('VSTUDY_STATUS');
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(electron.clipboard.writeText).not.toHaveBeenCalled(); expect(execFile).not.toHaveBeenCalled();
  logging.mockRestore();
});

it('requires native user approval before the renderer can enable the general shell', async () => {
  const { invoke } = await backend();
  approval.show.mockResolvedValueOnce({ response: 0, checkboxChecked: false });
  expect(await invoke('ai-cli:setPreferences', { updateChecks: false, autoUpdateWhenIdle: false, advancedShell: true })).toMatchObject({ advancedShell: false });
  expect(aiCliContract['ai-cli:preview'].response.parse(await invoke('ai-cli:preview', { actionId: 'advanced-shell' })).available).toBe(false);
  expect(approval.show).toHaveBeenCalledTimes(1);
  await invoke('ai-cli:setPreferences', { updateChecks: false, autoUpdateWhenIdle: false, advancedShell: true });
  await invoke('ai-cli:setPreferences', { updateChecks: false, autoUpdateWhenIdle: false, advancedShell: true });
  expect(approval.show).toHaveBeenCalledTimes(2);
});

it.each(['darwin', 'win32'] as const)('confirms the official manual command before opening a blank %s terminal', async platform => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: platform });
  vi.stubEnv('LOCALAPPDATA', undefined);
  const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const { invoke } = await backend();
    electron.clipboard.writeText.mockClear(); vi.mocked(execFile).mockClear(); vi.mocked(spawn).mockClear();
    const preview = aiCliContract['ai-cli:preview'].response.parse(await invoke('ai-cli:preview', { actionId: 'terminal-agy' }));
    expect(preview.available).toBe(true);
    expect(preview.command).toBe(platform === 'win32' ? 'irm https://antigravity.google/cli/install.ps1 | iex' : 'curl -fsSL https://antigravity.google/cli/install.sh | bash');
    approval.show.mockResolvedValueOnce({ response: 0, checkboxChecked: false });
    expect(await invoke('ai-cli:openTerminal', { actionId: 'terminal-agy', token: preview.token })).toEqual({ ok: false });
    expect(electron.clipboard.writeText).not.toHaveBeenCalled(); expect(execFile).not.toHaveBeenCalled(); expect(spawn).not.toHaveBeenCalled();
    expect(approval.show).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expect.stringContaining(preview.command), defaultId: 0, cancelId: 0 }),expect.objectContaining({id:1}));
    const opening = invoke('ai-cli:openTerminal', { actionId: 'terminal-agy', token: preview.token });
    if (platform === 'darwin') {
      await expect(opening).rejects.toThrow('VSTUDY_STATUS');
      expect(execFile).toHaveBeenLastCalledWith('/usr/bin/open', ['-a', 'Terminal', preview.cwd], expect.objectContaining({ cwd: preview.cwd }), expect.any(Function));
    } else {
      expect(await opening).toEqual({ ok: true });
      expect(spawn).toHaveBeenLastCalledWith(expect.stringMatching(/powershell\.exe$/), ['-NoLogo', '-NoProfile', '-NoExit'], expect.objectContaining({ shell: false, cwd: preview.cwd }));
    }
    expect(electron.clipboard.writeText).toHaveBeenCalledWith(preview.command);
    expect(aiCliContract['ai-cli:list'].response.parse(await invoke('ai-cli:list', {})).every(tool => !tool.consented)).toBe(true);
  } finally { Object.defineProperty(process, 'platform', original); logging.mockRestore(); }
});

it('rechecks the document after manual terminal approval before copying or launching', async () => {
  const { invoke, owner } = await backend(), logging = vi.spyOn(console, 'error').mockImplementation(() => {});
  const preview = aiCliContract['ai-cli:preview'].response.parse(await invoke('ai-cli:preview', { actionId: 'terminal-agy' }));
  approval.show.mockImplementationOnce(async () => { owner.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false }); return { response: 1, checkboxChecked: false }; });
  electron.clipboard.writeText.mockClear(); vi.mocked(execFile).mockClear(); vi.mocked(spawn).mockClear();
  await expect(invoke('ai-cli:openTerminal', { actionId: 'terminal-agy', token: preview.token })).rejects.toThrow('VSTUDY_STATUS');
  expect(electron.clipboard.writeText).not.toHaveBeenCalled(); expect(execFile).not.toHaveBeenCalled(); expect(spawn).not.toHaveBeenCalled();
  logging.mockRestore();
});
it('revokes previews on a main document reload and preserves same-document navigation', async () => {
  host.rejectLaunch = true; vi.stubEnv('LOCALAPPDATA', undefined);
  const { invoke, owner } = await backend();
  await invoke('ai-cli:setPreferences', { updateChecks: false, autoUpdateWhenIdle: false, advancedShell: true });
  const plan = aiCliContract['ai-cli:preview'].response.parse(await invoke('ai-cli:preview', { actionId: 'advanced-shell' }));
  owner.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
  const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(invoke('ai-cli:run', { actionId: 'advanced-shell', token: plan.token })).rejects.toThrow('VSTUDY_STATUS');
  const next = aiCliContract['ai-cli:preview'].response.parse(await invoke('ai-cli:preview', { actionId: 'advanced-shell' }));
  owner.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false });
  owner.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
  await expect(invoke('ai-cli:openTerminal', { actionId: 'advanced-shell', token: next.token })).rejects.toThrow('VSTUDY_STATUS');
  expect(electron.clipboard.writeText).toHaveBeenLastCalledWith(next.command);
  logging.mockRestore();
});
