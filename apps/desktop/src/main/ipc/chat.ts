import { validateOptions } from "../providers/models";
import { app } from "electron";
import { join } from "node:path";
import type { Store } from "../db";
import type { SecretStore } from "../services/secrets";
import { ChatService } from "../services/chat";
import { createProviderRegistry, type ProviderRegistry } from "../providers";
import type { IpcChannel } from "../../shared/ipc";
import type { createIpcRegistrar } from "./register";
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
  const chat = new ChatService(store, providers);
  const channels = [
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
  registrar.handle("providers:list", () => providers.list());
  registrar.handle("providers:configure", (config) => {
    providers.configure(config);
    return { ok: true };
  });
  registrar.handle("conversations:create", (input) =>
    chat.createConversation(input),
  );
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
  registrar.handle("conversations:list", ({ documentId }) =>
    store.conversations.list(documentId),
  );
  registrar.handle("conversations:delete", ({ conversationId }) => {
    chat.deleteConversation(conversationId);
    return { ok: true };
  });
  registrar.handle("messages:list", ({ conversationId }) =>
    store.messages.list(conversationId),
  );
  registrar.handle("chat:start", (request, event) => {
    chat.start(request, event.sender);
    return { ok: true };
  });
  registrar.handle("chat:abort", ({ requestId }, event) => {
    chat.abort(requestId, event.sender);
    return { ok: true };
  });
  const dispose = registrar.dispose;
  registrar.dispose = () => {
    chat.dispose();
    dispose();
  };
  return chat;
}
