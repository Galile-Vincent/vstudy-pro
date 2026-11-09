import { expect, it } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import { createIpcRegistrar } from './register';
import { updatesContract } from '../../shared/updates';
it.each(Object.keys(updatesContract) as (keyof typeof updatesContract)[])(
  'validates %s requests, responses and main-frame ownership', async channel => {
    let invoke: (event:IpcMainInvokeEvent, request:unknown) => unknown = () => {};
    let trusted = true;
    let malformed = false;
    const registrar = createIpcRegistrar({handle:(_name, handler) => {invoke=handler;},removeHandler:() => {}}, () => trusted);
    const snapshot = {state:{status:'idle' as const},currentVersion:'0.4.4',lastCheckedAt:null,automatic:true};
    registrar.handle(channel, () => malformed ? {} as never : channel === 'updates:notes' ? {ok:true as const} : snapshot);
    const event = {} as IpcMainInvokeEvent;
    const request = channel === 'updates:setAuto' ? {enabled:false} : {};
    await expect(invoke(event, request)).resolves.toEqual(channel === 'updates:notes' ? {ok:true} : snapshot);
    await expect(invoke(event, {...request,url:'https://evil.example'})).rejects.toThrow();
    if (channel === 'updates:setAuto') await expect(invoke(event,{enabled:'true'})).rejects.toThrow();
    trusted = false; await expect(invoke(event, request)).rejects.toThrow('Untrusted IPC sender');
    trusted = true;
    await expect(invoke({sender:{mainFrame:{}},senderFrame:{}} as IpcMainInvokeEvent,request)).rejects.toThrow('Untrusted IPC sender');
    malformed = true; await expect(invoke(event,request)).rejects.toThrow();
    registrar.dispose();
  });
