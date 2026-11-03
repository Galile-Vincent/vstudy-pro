import { useEffect, useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  MessagePrimitive,
  ErrorPrimitive,
  useLocalRuntime,
  useAuiState,
} from "@assistant-ui/react";
import type { Conversation, Message, Selection } from "../shared";
import { desktop } from "./bridge";
import { createChatAdapter } from "./chat-adapter";
import { providerName, type Providers } from "./providers";

function ChatMessage() {
  const role = useAuiState((s) => s.message.role);
  return (
    <MessagePrimitive.Root className={`message ${role}`}>
      <div className="message-label">
        {role === "user" ? "You" : "Assistant"}
      </div>
      <div className="message-text">
        <MessagePrimitive.Parts />
      </div>
      <ErrorPrimitive.Root className="chat-error">
        <ErrorPrimitive.Message />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Root>
  );
}
export function Chat({
  conversation,
  history,
  selection,
  onClearSelection,
  providers,
  model,
  onModel,
  onSettings,
  onProvidersChanged,
}: {
  conversation: Conversation;
  history: Message[];
  selection: Selection | null;
  onClearSelection: () => void;
  providers: Providers;
  model: string;
  onModel: (value: string) => void;
  onSettings: () => void;
  onProvidersChanged: () => Promise<void>;
}) {
  const current = useRef({ conversation, selection, onClearSelection });
  current.current = { conversation, selection, onClearSelection };
  const connection = useMemo(
    () =>
      createChatAdapter(
        desktop,
        async () => {
          const { conversation: c, selection: s } = current.current;
          return {
            conversationId: c.id,
            documentId: c.documentId,
            providerId: c.providerId,
            modelId: c.modelId,
            ...(s ? { selection: s } : {}),
          };
        },
        () => current.current.onClearSelection(),
      ),
    [],
  );
  useEffect(() => () => connection.dispose(), [connection]);
  const runtime = useLocalRuntime(connection.adapter, {
    initialMessages: history.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.parts,
      createdAt: new Date(m.createdAt),
    })),
  });
  const prepareMessage = () => {
    const selected = current.current.selection;
    if (!selected) return;
    const text = runtime.thread.composer.getState().text;
    const quote = `Selected passage${selected.headingPath.length ? ` · ${selected.headingPath.join(" / ")}` : ""}:\n${selected.text}`;
    if (!text.endsWith(quote))
      runtime.thread.composer.setText(`${text}\n\n${quote}`);
  };
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="thread">
        <ThreadPrimitive.Viewport className="transcript">
          <ThreadPrimitive.Empty>
            <div className="empty">
              <div className="empty-symbol">✦</div>
              <h3>Make room for a question</h3>
              <p>Select a passage, or ask about the whole document.</p>
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages>
            {() => <ChatMessage />}
          </ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>
        <ComposerPrimitive.Root
          className="composer"
          onSubmitCapture={prepareMessage}
        >
          {selection && (
            <div className="selection-chip">
              <span>
                <strong>
                  {selection.headingPath.at(-1) ?? "Selected passage"}
                </strong>
                <span>{selection.text}</span>
              </span>
              <button
                type="button"
                aria-label="Remove selection"
                onClick={onClearSelection}
              >
                ×
              </button>
            </div>
          )}
          <ComposerPrimitive.Input
            aria-label="Ask about your document"
            placeholder="Ask about your document…"
            rows={2}
            onKeyDownCapture={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              )
                prepareMessage();
            }}
          />
          <div className="composer-footer">
            <ModelPicker
              providers={providers}
              model={model}
              onModel={onModel}
              onSettings={onSettings}
              onProvidersChanged={onProvidersChanged}
            />
            <div className="row">
              <ComposerPrimitive.Cancel className="stop-button">
                Stop
              </ComposerPrimitive.Cancel>
              <ComposerPrimitive.Send
                className="send-button"
                aria-label="Send message"
                onClickCapture={prepareMessage}
              >
                ↑
              </ComposerPrimitive.Send>
            </div>
          </div>
        </ComposerPrimitive.Root>
        <p className="composer-note">
          Grounded in your document. Check important details.
        </p>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
export function ModelPicker({
  providers,
  model,
  onModel,
  onSettings,
  onProvidersChanged,
}: {
  providers: Providers;
  model: string;
  onModel: (value: string) => void;
  onSettings: () => void;
  onProvidersChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false),
    [providerId, setProviderId] = useState<
      "openai-api" | "anthropic-api" | "openai-compatible"
    >("openai-api"),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await desktop.invoke("secrets:set", { providerId, key });
      setKey("");
      await onProvidersChanged();
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save key");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="model-picker">
      <select
        aria-label="Model"
        value={model}
        onChange={(e) => onModel(e.target.value)}
      >
        <option value="" disabled>
          Choose a model
        </option>
        {providers.map((p) => (
          <optgroup
            key={p.config.id}
            label={`${providerName[p.config.id]}${p.availability.available ? "" : ` · ${p.availability.reason}`}`}
          >
            {p.models.map((m) => (
              <option
                disabled={!p.config.enabled || !p.availability.available}
                key={m.id}
                value={`${p.config.id}/${m.id}`}
              >
                {m.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button
        type="button"
        className="text-button"
        onClick={() => setAdding(!adding)}
      >
        Add API key
      </button>
      {adding && (
        <div className="inline-key" role="group" aria-label="Add API key">
          <div className="row">
            <strong>Add API key</strong>
            <button
              type="button"
              aria-label="Close key form"
              onClick={() => {
                setAdding(false);
                setKey("");
              }}
            >
              ×
            </button>
          </div>
          <select
            aria-label="Key provider"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value as typeof providerId)}
          >
            {providers
              .filter((p) => p.config.kind !== "cli")
              .map((p) => (
                <option key={p.config.id} value={p.config.id}>
                  {providerName[p.config.id]}
                </option>
              ))}
          </select>
          <input
            aria-label="API key"
            type="password"
            autoComplete="off"
            placeholder="Enter API key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <div className="row">
            <button
              type="button"
              disabled={busy || !key.trim()}
              onClick={() => void save()}
            >
              Save key
            </button>
            <button type="button" className="text-button" onClick={onSettings}>
              All provider settings
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
