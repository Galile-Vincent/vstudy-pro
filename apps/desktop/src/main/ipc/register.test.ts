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
