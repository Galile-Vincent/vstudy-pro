import { it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
import { openStore } from '../db';
import { createSecretStore } from '../services/secrets';
import { createIpcRegistrar } from './register';
import { registerMoodleIpc } from './moodle';
import { moodleChannels } from '../../shared/moodle';
import { moodleProgressSchema, type IpcChannel } from '../../shared/ipc';

vi.mock('electron',() => ({dialog:{showSaveDialog:vi.fn()},Notification:{isSupported:() => false}}));
it('registers every Moodle channel behind strict requests and trusted main-frame senders',async () => {
  const directory = mkdtempSync(join(tmpdir(),'moodle-ipc-'));
  const store = openStore(':memory:');
  const secrets = createSecretStore(join(directory,'secrets.json'),{isAsyncEncryptionAvailable:async () => false,encryptStringAsync:vi.fn(),decryptStringAsync:vi.fn()});
  const handlers = new Map<string,(event:IpcMainInvokeEvent,payload:unknown) => unknown>();
  const registrar = createIpcRegistrar({handle:(channel,callback) => {handlers.set(channel,callback);},removeHandler:channel => {handlers.delete(channel);}},event => event.sender.id === 1);
  const implemented = new Set<IpcChannel>();
  const dispose = registerMoodleIpc(registrar,store,secrets,implemented,{get:vi.fn(),importPath:vi.fn()});
  const frame = {}, sender = {id:1,mainFrame:frame};
  const invoke = async (channel:string,payload:unknown,event = {sender,senderFrame:frame}) => handlers.get(channel)!(event as unknown as IpcMainInvokeEvent,payload);
  const log = vi.spyOn(console,'error').mockImplementation(() => undefined);
  try {
    expect([...handlers.keys()].sort()).toEqual(Object.values(moodleChannels).sort());
    expect(await invoke('moodle:schools',{})).toEqual(expect.arrayContaining([expect.objectContaining({id:'cycu',login:'sso-launch'})]));
    expect(await invoke('moodle:overview',{})).toEqual({accounts:[],courses:[],summaries:[],upcoming:[],otherNotifications:[],unreadNotifications:0});
    await expect(invoke('moodle:schools',{}, {sender:{id:2,mainFrame:frame},senderFrame:frame})).rejects.toThrow('Untrusted');
    await expect(invoke('moodle:overview',{}, {sender,senderFrame:{}})).rejects.toThrow('Untrusted');
    await expect(invoke('moodle:overview',{token:'sensitive-token'})).rejects.toThrow('VSTUDY_STATUS');
    await expect(invoke('moodle:connect',{schoolId:'cycu',password:'sensitive-password'})).rejects.toThrow('VSTUDY_STATUS');
    expect(log).not.toHaveBeenCalled();
  } finally { log.mockRestore(); registrar.dispose(); await dispose(); store.close(); rmSync(directory,{force:true,recursive:true}); }
});
it('returns cancellation as a handled result rather than an Electron handler rejection',async () => {
  const { MoodleAuthError } = await import('../moodle/auth');
  let invoke!: (event:IpcMainInvokeEvent,payload:unknown) => unknown;
  const registrar = createIpcRegistrar({handle:(_channel,handler) => {invoke = handler;},removeHandler:vi.fn()},() => true);
  registrar.handle('moodle:connect',() => {throw new MoodleAuthError('cancelled');});
  await expect(invoke({} as IpcMainInvokeEvent,{siteUrl:'https://school.example'})).resolves.toEqual({moodleAuthCancelled:true});
  registrar.dispose();
});

it.each(['ai_parse.moodlemobile://token=CANARY','Invalid JSON moodlemobile://token=CANARY'])('redacts Moodle IPC errors containing %s',async message => {
  let invoke!: (event:IpcMainInvokeEvent,payload:unknown) => unknown;
  const registrar = createIpcRegistrar({handle:(_channel,handler) => {invoke = handler;},removeHandler:vi.fn()},() => true);
  registrar.handle('moodle:connect',() => {throw new Error(message);});
  const logs = vi.spyOn(console,'error').mockImplementation(() => undefined);
  try {
    await expect(invoke({} as IpcMainInvokeEvent,{siteUrl:'https://school.example'})).rejects.toEqual(new Error('VSTUDY_STATUS:{"code":"errors.generic","params":{}}'));
    expect(JSON.stringify(logs.mock.calls)).not.toContain('CANARY');
  } finally {logs.mockRestore();registrar.dispose();}
});

it('rejects secret fields and unknown panels in Moodle progress events',() => {
  const event={accountId:'11111111-1111-4111-a111-111111111111',panel:'contents',state:'loading',completed:0,total:1};
  expect(moodleProgressSchema.parse(event)).toEqual(event);
  expect(moodleProgressSchema.safeParse({...event,token:'secret'}).success).toBe(false);
  expect(moodleProgressSchema.safeParse({...event,panel:'unknown'}).success).toBe(false);
});
