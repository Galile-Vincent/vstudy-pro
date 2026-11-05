/**
 * Regression coverage for ipc chat.
 * Owned by main/ipc.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { documentSchema } from "../../shared/domain";
import { openStore } from "../db";
import { ProviderRegistry, fakeAdapter } from "../providers";
import { createIpcRegistrar } from "./register";
import type { IpcChannel } from "../../shared/ipc";
vi.mock("electron", () => ({ app: { getPath: () => "/unused" } }));
import { registerChatIpc } from "./chat";
it("registers every chat handler with validated repository round trips and disposes them", async () => {
  const store = openStore(":memory:");
  const registry = new ProviderRegistry();
  registry.register("anthropic-api", fakeAdapter);
  registry.configure({kind:"api",id:"anthropic-api",enabled:true});
  const callbacks = new Map<
    string,
    (event: IpcMainInvokeEvent, payload: unknown) => unknown
  >();
  const registrar = createIpcRegistrar(
    {
      handle: (channel, callback) => {
        callbacks.set(channel, callback);
      },
      removeHandler: (channel) => {
        callbacks.delete(channel);
      },
    },
    () => true,
  );
  const implemented = new Set<IpcChannel>();
  const deletedKeys = vi.fn();
  let testKey: string | null = null;
  registerChatIpc(
    registrar,
    store,
    {
      preflight: async () => {}, getInMainOnly: async () => testKey,
      has: () => false,
      set: async () => {},
      bindCompatibleOrigin: () => {},
      useInSession: () => {},
      isUnlocked: () => false,
      delete: deletedKeys,
    },
    implemented,
    registry,
  );
  const notify = vi.fn();
  const event = {
    sender: Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      send: notify,
    }),
  } as unknown as IpcMainInvokeEvent;
  const invoke = async (channel: string, payload: unknown) => {
    const callback = callbacks.get(channel);
    if (!callback) throw new Error("Missing handler");
    return callback(event, payload);
  };
  try {
    expect(implemented.size).toBe(15);
    expect(await invoke('providers:test', {providerId:'anthropic-api'})).toEqual('bad_key');
    await expect(invoke('providers:test', {providerId:'claude-cli'})).rejects.toThrow();
    testKey = 'private-test-key';
    const fetcher = vi.spyOn(globalThis, 'fetch');
    try {
      for (const [status, result] of [[200, 'success'], [401, 'bad_key'], [403, 'no_access']] as const) {
        fetcher.mockResolvedValueOnce(new Response(null, {status}));
        expect(await invoke('providers:test', {providerId:'anthropic-api'})).toBe(result);
      }
      fetcher.mockRejectedValueOnce(new Error('private-test-key'));
      expect(await invoke('providers:test', {providerId:'openai-api'})).toBe('offline');
    } finally {
      fetcher.mockRestore();
      testKey = null;
    }
    await invoke('providers:configure',{kind:'compatible',id:'openai-compatible',baseUrl:'http://localhost:11434/v1',enabled:true});
    expect(deletedKeys).not.toHaveBeenCalled();
    await invoke('providers:configure',{kind:'compatible',id:'openai-compatible',baseUrl:'https://new-host.example/v1',enabled:true});
    expect(deletedKeys).toHaveBeenCalledExactlyOnceWith('openai-compatible');
    const doc = store.documents.insert(
      documentSchema.parse({
        id: randomUUID(),
        title: "Doc",
        sourceHash: "f".repeat(64),
        sourceName: "doc.md",
        sourcePath: "/unused",
        markdownPath: "/unused",
        mime: "text/markdown",
        status: "ready",
        createdAt: new Date().toISOString(),
      }),
    );
    await expect(invoke('conversations:create', {documentId:doc.id,providerId:'anthropic-api',modelId:'--dangerously-skip-permissions'})).rejects.toThrow();
    expect(store.conversations.list(doc.id)).toEqual([]);
    const created = await invoke("conversations:create", {
      documentId: doc.id,
      providerId: "anthropic-api",
      modelId: "fake",
    });
    const conversations = store.conversations.list(doc.id);
    const conversation = conversations[0];
    if (!conversation) throw new Error("Missing conversation");
    expect(created).toEqual(conversation);
    expect(await invoke("conversations:list", { documentId: doc.id })).toEqual(
      conversations,
    );
    expect(
      await invoke("messages:list", { conversationId: conversation.id }),
    ).toEqual([]);
    expect(await invoke("conversations:options", { conversationId: conversation.id, options: { effort: 'high' } })).toEqual({ ok: true });
    expect(store.conversations.get(conversation.id)?.options).toEqual({ effort: 'high' });
    await expect(invoke("conversations:options", { conversationId: conversation.id, options: { effort: 'ultra' } })).rejects.toThrow("VSTUDY_STATUS:");
    expect(await invoke('conversations:model',{conversationId:conversation.id,providerId:'anthropic-api',modelId:'fake'})).toEqual({...conversation,options:{}});
    expect(store.conversations.list(doc.id)).toHaveLength(1);
    store.messages.insert({id:randomUUID() as import('../../shared').Message['id'],conversationId:conversation.id,role:'user',parts:[{type:'text',text:'Started'}],createdAt:new Date().toISOString()});
    await expect(invoke('conversations:model',{conversationId:conversation.id,providerId:'anthropic-api',modelId:'fake'})).rejects.toThrow("errors.conversation_not_empty");
    expect(await invoke('chats:get',{conversationId:conversation.id})).toEqual(store.conversations.get(conversation.id));
    expect(await invoke('chats:search',{query:'Started',role:'user'})).toMatchObject({items:[{id:conversation.id,matches:[{role:'user'}]}]});
    await expect(invoke('chats:search',{query:'x',unexpected:true})).rejects.toThrow();
    await expect(invoke('chats:update',{conversationId:conversation.id,patch:{pinned:'true'}})).rejects.toThrow();
    expect(await invoke('chats:update',{conversationId:conversation.id,patch:{pinned:true}})).toEqual({ok:true});
    expect(await invoke("providers:list", {})).toHaveLength(6);
    expect(
      await invoke("providers:configure", {
        id: "anthropic-api",
        kind: "api",
        enabled: false,
      }),
    ).toEqual({ ok: true });
    expect(notify).toHaveBeenLastCalledWith("vstudy:providers-changed");
    await expect(
      invoke("chat:start", {
        requestId: randomUUID(),
        conversationId: conversation.id,
        documentId: doc.id,
        providerId: "anthropic-api",
        modelId: "fake",
        userMessage: "Hi",
      }),
    ).rejects.toThrow("VSTUDY_STATUS:");
    await expect(
      invoke("providers:configure", {
        id: "openai-compatible",
        kind: "compatible",
        enabled: true,
        baseUrl: "http://remote.example/v1",
      }),
    ).rejects.toThrow("VSTUDY_STATUS:");
    await expect(
      invoke("messages:list", { conversationId: "invalid" }),
    ).rejects.toThrow();
    expect(await invoke("chat:abort", { requestId: randomUUID() })).toEqual({
      ok: true,
    });
    expect(
      await invoke("conversations:delete", { conversationId: conversation.id }),
    ).toEqual({ ok: true });
    expect(store.conversations.list(doc.id)).toEqual([]);
  } finally {
    registrar.dispose();
    store.close();
  }
  expect(callbacks.size).toBe(0);
});
