import {
  defaultSettings,
  documentSchema,
  conversationSchema,
  messageSchema,
} from "../shared";
import type {
  DesktopApi,
  Document,
  Conversation,
  Message,
  Settings,
  IpcChannel,
  IpcRequest,
  IpcResponse,
  ChatEvent,
  ChatRequest,
  ProviderConfig,
} from "../shared";
export const mockMarkdown = `# Reading with intention

A good question begins with **a closer look**. Select a passage to explore it together.

## Make connections

Connect new ideas to what you already know. Ask why a claim matters, where the evidence leads, and what might change your mind.

| Practice | Purpose |
| --- | --- |
| Read slowly | Notice the details |
| Ask questions | Test understanding |

- [x] Open a document
- [ ] Explore a passage

## A small example

\`\`\`typescript
const insight = reading + reflection;
\`\`\`

The relationship is $E = mc^2$.

> Understanding grows when you put an idea into your own words.
`;
export function createMockBridge(): DesktopApi {
  const documents: Document[] = [],
    conversations: Conversation[] = [],
    messages: Message[] = [];
  let settings: Settings = { ...defaultSettings };
  const keys = new Set<string>();
  const listeners = new Map<string, (event: ChatEvent) => void>();
  const configs: ProviderConfig[] = [
    { kind: "api", id: "openai-api", enabled: true },
    { kind: "api", id: "anthropic-api", enabled: true },
    {
      kind: "compatible",
      id: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      enabled: true,
    },
    { kind: "cli", id: "codex-cli", enabled: true },
    { kind: "cli", id: "claude-cli", enabled: true },
    { kind: "cli", id: "agy-cli", enabled: false },
  ];
  const invoke = async <C extends IpcChannel>(
    channel: C,
    request: IpcRequest<C>,
  ): Promise<IpcResponse<C>> => {
    const input = request as Record<string, unknown>;
    let result: unknown = { ok: true };
    switch (channel) {
      case "settings:get":
        result = settings;
        break;
      case "settings:set":
        settings = request as Settings;
        result = settings;
        break;
      case "documents:import": {
        const item = documentSchema.parse({
          id: crypto.randomUUID(),
          title: "Reading with intention",
          sourceName: "reading.md",
          sourceHash: "a".repeat(64),
          sourcePath: "mock/reading.md",
          markdownPath: "mock/content.md",
          mime: "text/markdown",
          status: "ready",
          createdAt: new Date().toISOString(),
        });
        documents.push(item);
        result = item;
        break;
      }
      case "documents:list":
        result = [...documents];
        break;
      case "documents:get":
      case "documents:retry":
        result = documents.find((d) => d.id === input.documentId) ?? null;
        break;
      case "documents:read":
        result = mockMarkdown;
        break;
      case "documents:delete":
        documents.splice(
          documents.findIndex((d) => d.id === input.documentId),
          1,
        );
        break;
      case "conversations:create": {
        const item = conversationSchema.parse({
          ...input,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        });
        conversations.push(item);
        result = item;
        break;
      }
      case "conversations:list":
        result = conversations.filter((c) => c.documentId === input.documentId);
        break;
      case "conversations:delete":
        conversations.splice(
          conversations.findIndex((c) => c.id === input.conversationId),
          1,
        );
        break;
      case "messages:list":
        result = messages.filter(
          (m) => m.conversationId === input.conversationId,
        );
        break;
      case "providers:list":
        result = configs.map((config) => ({
          config,
          availability:
            config.id === "openai-api" || keys.has(config.id)
              ? { available: true }
              : {
                  available: false,
                  reason:
                    config.kind === "cli" ? "Not detected" : "Add an API key",
                },
          models: [{ id: "mock-model", name: "Preview model" }],
        }));
        break;
      case "providers:configure":
        configs.splice(
          configs.findIndex((c) => c.id === input.id),
          1,
          request as ProviderConfig,
        );
        break;
      case "secrets:has":
        result = {
          providerId: input.providerId,
          hasKey: keys.has(String(input.providerId)),
        };
        break;
      case "secrets:set":
        keys.add(String(input.providerId));
        break;
      case "secrets:delete":
        keys.delete(String(input.providerId));
        break;
      case "chat:abort":
        listeners.get(String(input.requestId))?.({ type: "done" });
        break;
      case "chat:start": {
        const req = request as ChatRequest;
        const text = `You asked: ${req.userMessage}${req.selection ? `\n\nSelected passage:\n${req.selection.text}` : ""}`;
        messages.push(
          messageSchema.parse({
            id: crypto.randomUUID(),
            conversationId: req.conversationId,
            role: "user",
            parts: [{ type: "text", text: req.userMessage }],
            createdAt: new Date().toISOString(),
          }),
        );
        setTimeout(() => {
          const emit = listeners.get(req.requestId);
          emit?.({ type: "text-delta", text });
          emit?.({ type: "done" });
          messages.push(
            messageSchema.parse({
              id: crypto.randomUUID(),
              conversationId: req.conversationId,
              role: "assistant",
              parts: [{ type: "text", text }],
              createdAt: new Date().toISOString(),
            }),
          );
        }, 150);
        break;
      }
    }
    return result as IpcResponse<C>;
  };
  return {
    invoke,
    onChatEvent(id, listener) {
      listeners.set(id, listener);
      return () => {
        listeners.delete(id);
      };
    },
  };
}
