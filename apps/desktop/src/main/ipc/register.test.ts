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
