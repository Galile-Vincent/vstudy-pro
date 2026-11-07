/**
 * Register validated chat IPC operations and delegate privileged work to main services.
 * Owned by main/ipc.
 * Request and response validation and sender ownership stay at the IPC boundary.
 * @packageDocumentation
 */
import { searchInWorker } from '../services/search-runner';
import { createApiAdapter } from "../providers/api";
import { validateOptions } from "../providers/models";
import { app } from "electron";
import { join } from "node:path";
import type { Store } from "../db";
import type { SecretStore } from "../services/secrets";
import { ChatService } from "../services/chat";
import { createProviderRegistry, type ProviderRegistry } from "../providers";
import type { IpcChannel } from "../../shared/ipc";
import type { createIpcRegistrar } from "./register";
/** Register this subsystem through the validated IPC registrar; return cleanup for window teardown. */
export function registerChatIpc(
  registrar: ReturnType<typeof createIpcRegistrar>,
  store: Store,
  secrets: SecretStore,
  implemented: Set<IpcChannel>,
  providers: ProviderRegistry = createProviderRegistry(
    secrets,
    join(app.getPath("userData"), "providers.json"),
  ),
): ChatService {
  const compatible = providers.config('openai-compatible');
  if (compatible.kind === 'compatible') secrets.bindCompatibleOrigin(compatible.baseUrl);
  const chat = new ChatService(store, providers, join(app.getPath("userData"), "library"));
  const purgeHistory = setInterval(() => {
    const expired = store.db.prepare('SELECT id FROM conversations WHERE deletedAt IS NOT NULL AND deletedAt<?').all(new Date(Date.now() - 30_000).toISOString());
    for (const row of expired) chat.deleteConversation(String(row.id) as import('../../shared/domain').Conversation['id']);
  }, 30_000);
  purgeHistory.unref();
  implemented.add('chats:facets');
  registrar.handle('chats:facets', () => store.chatHistory.facets());
  implemented.add('chats:get');
  registrar.handle('chats:get', ({conversationId}) => store.conversations.get(conversationId));
  implemented.add('chats:search'); implemented.add('chats:update');
  registrar.handle('chats:search', input => input.query ? searchInWorker('chats:search', input, String(store.db.prepare('PRAGMA database_list').get()!.file), '', 1500) : store.chatHistory.search(input));
  registrar.handle('chats:update', ({conversationId,patch}) => { store.chatHistory.update(conversationId,patch); return {ok:true}; });
  const channels = [
    "providers:test",
    "providers:list",
    "providers:configure",
    "chat:start",
    "chat:abort",
    "conversations:create",
    "conversations:options",
    "conversations:model",
    "conversations:list",
    "conversations:delete",
    "messages:list",
  ] as const;
  for (const channel of channels) implemented.add(channel);
  registrar.handle("providers:test", async ({providerId}) => {
    const config = providers.config(providerId);
    const adapter = createApiAdapter(() => config, secrets);
    return adapter.testConnection!();
  });
  registrar.handle("providers:list", ({discover}) => providers.list(discover));
  registrar.handle("providers:configure", (config, event) => {
    const previous = providers.config(config.id);
    if (config.kind === 'compatible' && previous.kind === 'compatible' && new URL(config.baseUrl).origin !== new URL(previous.baseUrl).origin) secrets.delete(config.id);
    if (config.kind === 'compatible') secrets.bindCompatibleOrigin(config.baseUrl);
    providers.configure(config);
    event.sender?.send?.('vstudy:providers-changed');
    return { ok: true };
  });
  registrar.handle("conversations:create", async (input) => {
    const adapter = providers.get(input.providerId);
    const models = await adapter.listModels();
    if (!models.some(m => m.id === input.modelId || m.resolvedId === input.modelId)) throw new Error('Model unavailable');
    return chat.createConversation(input);
  });
  registrar.handle("conversations:model", async ({conversationId,providerId,modelId}) => {
    if (!store.conversations.get(conversationId)) throw new Error('Conversation unavailable');
    const adapter = providers.get(providerId);
    const models = await adapter.listModels();
    if (!(await adapter.detect()).available || !models.some(m => m.id === modelId || m.resolvedId === modelId)) throw new Error('Model unavailable');
    return store.conversations.setModel(conversationId,providerId,modelId);
  });
  registrar.handle("conversations:options", async ({ conversationId, options }) => {
    const conversation = store.conversations.get(conversationId);
    if (!conversation) throw new Error('Conversation unavailable');
    const models = await providers.get(conversation.providerId).listModels();
    validateOptions(models.find(m => m.id === conversation.modelId || m.resolvedId === conversation.modelId), options);
    store.conversations.setOptions(conversationId, options);
    return { ok: true };
  });
  registrar.handle("conversations:list", (scope) =>
    store.conversations.list(scope),
  );
  registrar.handle("conversations:delete", ({ conversationId }) => {
    chat.deleteConversation(conversationId);
    return { ok: true };
  });
  registrar.handle("messages:list", ({ conversationId }) =>
    store.messages.list(conversationId),
  );
  registrar.handle("chat:start", async (request, event) => {
    await chat.start(request, event.sender);
    return { ok: true };
  });
  registrar.handle("chat:abort", ({ requestId }, event) => {
    chat.abort(requestId, event.sender);
    return { ok: true };
  });
  const dispose = registrar.dispose;
  registrar.dispose = () => {
    clearInterval(purgeHistory);
    chat.dispose();
    dispose();
  };
  return chat;
}
