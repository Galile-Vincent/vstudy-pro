/**
 * Regression coverage for ipc register.
 * Owned by main/ipc.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect, it } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { defaultSettings } from "../../shared";
import { createIpcRegistrar } from "./register";
it("validates payloads, sender, and responses through the sole registrar", async () => {
  let invoke:
    | ((event: IpcMainInvokeEvent, payload: unknown) => unknown)
    | undefined;
  const removed: string[] = [];
  let trusted = true;
  let calls = 0;
  const registrar = createIpcRegistrar(
    {
      handle: (_channel, listener) => {
        invoke = listener;
      },
      removeHandler: (channel) => {
        removed.push(channel);
      },
    },
    () => trusted,
  );
  registrar.handle("settings:get", () => {
    calls++;
    return defaultSettings;
  });
  const event = {} as IpcMainInvokeEvent;
  if (!invoke) throw new Error("Missing handler");
  await expect(invoke(event, {})).resolves.toEqual(defaultSettings);
  await expect(invoke(event, { key: "unexpected" })).rejects.toThrow();
  await expect(invoke(event, undefined)).rejects.toThrow();
  trusted = false;
  await expect(invoke(event, {})).rejects.toThrow("Untrusted IPC sender");
  expect(calls).toBe(1);
  registrar.dispose();
  expect(removed).toEqual(["settings:get"]);
});

it("rejects malformed responses before they cross the bridge", async () => {
  let invoke:
    | ((event: IpcMainInvokeEvent, payload: unknown) => unknown)
    | undefined;
  const registrar = createIpcRegistrar(
    {
      handle: (_channel, listener) => {
        invoke = listener;
      },
      removeHandler: () => {},
    },
    () => true,
  );
  registrar.handle("settings:get", () => {
    const response = { ...defaultSettings };
    Object.assign(response, { chatSide: "invalid" });
    return response;
  });
  if (!invoke) throw new Error("Missing handler");
  await expect(invoke({} as IpcMainInvokeEvent, {})).rejects.toThrow();
});

it('rejects iframe and alternate URL senders for EVERY registered contract channel', async () => {
  const { ipcContract } = await import('../../shared/ipc');
  for (const channel of Object.keys(ipcContract) as (keyof typeof ipcContract)[]) {
    let invoke: ((event: IpcMainInvokeEvent, payload: unknown) => unknown) | undefined;
    let calls = 0;
    const registrar = createIpcRegistrar({ handle: (_channel, listener) => { invoke = listener; }, removeHandler: () => {} }, event => event.senderFrame === event.sender.mainFrame && event.senderFrame.url === 'file:///app/index.html');
    registrar.handle(channel, () => { calls++; throw new Error('Must never run'); });
    const mainFrame = { url: 'file:///app/index.html' };
    for (const frame of [{ url: 'https://evil.example/' }, { url: mainFrame.url }]) {
      await expect(invoke!({ sender: { id: 1, mainFrame }, senderFrame: frame } as unknown as IpcMainInvokeEvent, {})).rejects.toThrow('Untrusted IPC sender');
    }
    expect(calls).toBe(0);
  }
});
it('caps payload bytes and per-channel budgets before side effects', async () => {
  let invoke: ((event: IpcMainInvokeEvent, payload: unknown) => unknown) | undefined;
  const registrar = createIpcRegistrar({ handle: (_channel, listener) => { invoke = listener; }, removeHandler: () => {} }, () => true);
  registrar.handle('welcome:sampleDocument', () => 'sample');
  const event = {} as IpcMainInvokeEvent;
  await expect(invoke!(event, { language: 'x'.repeat(600_000) })).rejects.toThrow('too large');
  for (let i = 0; i < 600; i++) await invoke!(event, { language: 'en' });
  await expect(invoke!(event, { language: 'en' })).rejects.toThrow('rate limited');
});
it('gives searches a read budget independent of import and export', async () => {
  const { channelPolicy } = await import('./register');
  expect(channelPolicy('library:search').requests).toBe(600);
  expect(channelPolicy('documents:import').requests).toBe(12);
  expect(channelPolicy('library:export').requests).toBe(12);
});

it('validates all AI parse channels through the same sender and response boundary',async()=>{
 const {aiParseContract}=await import('../../shared/ai-parse');
 const handlers=new Map<string,(e:IpcMainInvokeEvent,p:unknown)=>unknown>();
 let trusted=true;
 const registrar=createIpcRegistrar({handle:(c,h)=>{handlers.set(c,h);},removeHandler:()=>{}},()=>trusted);
 const id='00000000-0000-4000-8000-000000000001';
 for(const channel of Object.keys(aiParseContract) as (keyof typeof aiParseContract)[])registrar.handle(channel,()=>{throw new Error('validated');});
 const event={sender:{id:1}} as IpcMainInvokeEvent;
 for(const [channel,handler] of handlers){await expect(handler(event,{documentId:id,extra:'forbidden'})).rejects.toThrow();trusted=false;await expect(handler(event,{documentId:id})).rejects.toThrow('Untrusted');trusted=true;expect(channel).toMatch(/^aiParse:/);}
 registrar.dispose();
});

it('logs only IPC failure metadata without provider text or private filenames', async () => {
  const {vi} = await import('vitest');
  const output=vi.spyOn(console,'log').mockImplementation(()=>{});
  const raw=vi.spyOn(console,'error').mockImplementation(()=>{});
  let invoke!: (event:IpcMainInvokeEvent,payload:unknown)=>unknown;
  const registrar=createIpcRegistrar({handle:(_channel,handler)=>{invoke=handler;},removeHandler:()=>{}},()=>true);
  registrar.handle('settings:get',()=>{throw Error("ENOENT open '/Volumes/School/private-paper.pdf'; private-paper.pdf PRIVATE_PROMPT_CANARY");});
  try {
    await expect(invoke({} as IpcMainInvokeEvent,{})).rejects.toThrow('VSTUDY_STATUS');
    expect(output).toHaveBeenCalled(); expect(raw).not.toHaveBeenCalled();
    expect(JSON.stringify(output.mock.calls)).not.toContain('private-paper');
    expect(JSON.stringify(output.mock.calls)).not.toContain('PRIVATE_PROMPT_CANARY');
    expect(JSON.stringify(output.mock.calls)).toContain('ipc-failed');
  } finally {registrar.dispose();output.mockRestore();raw.mockRestore();}
});
it('returns a localized size error before accepting an oversize user chat message',async()=>{
  let invoke:((event:IpcMainInvokeEvent,payload:unknown)=>unknown)|undefined;
  let calls=0;
  const registrar=createIpcRegistrar({handle:(_channel,listener)=>{invoke=listener;},removeHandler:()=>{}},()=>true);
  registrar.handle('chat:start',()=>{calls++;return {ok:true};});
  const request={scope:'general',requestId:'11111111-1111-4111-a111-111111111111',conversationId:'22222222-2222-4222-a222-222222222222',providerId:'openai-api',modelId:'fixture',userMessage:'x'.repeat(2_000_001)};
  await expect(invoke!({} as IpcMainInvokeEvent,request)).rejects.toThrow('VSTUDY_STATUS:{"code":"errors.message_too_large","params":{}}');
  expect(calls).toBe(0);registrar.dispose();
});
