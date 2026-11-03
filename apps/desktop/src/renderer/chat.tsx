import { ModelPicker, ModelOptions } from "./model-picker";
export { ModelPicker } from "./model-picker";
import { MessageUsage } from "./usage/chip";
import { UsageMeter, useUsage, useBudgetGuard } from "./usage/meter";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  MessagePrimitive,
  ErrorPrimitive,
  ActionBarPrimitive,
  useLocalRuntime,
  useAuiState,
} from "@assistant-ui/react";
import type { Conversation, Message, Selection } from "../shared";
import { ReplyMarkdown } from "./markdown";
import { plainSelection } from "./selection-preview";
import { desktop } from "./bridge";
import { createChatAdapter } from "./chat-adapter";
import { type Providers } from "./providers";

function ChatMessage({ selections, statuses, subscription }: { subscription: boolean; selections: Map<string, Selection>; statuses: Map<string, string> }) {
  const id = useAuiState((s) => s.message.id);
  const selected = selections.get(id);
  const copied = useAuiState(s => s.message.isCopied);
  const editing = useAuiState(s => s.message.composer.isEditing);
  const running = useAuiState(s => s.message.status?.type === "running");
  const role = useAuiState((s) => s.message.role);
  return (
    <MessagePrimitive.Root className={`message ${role}`}>
      <div className="message-label">
        {role === "user" ? "You" : "Assistant"}
      </div>
      {selected && <SelectionPreview selection={selected} />}
      {editing ? <ComposerPrimitive.Root className="edit-composer">
        <ComposerPrimitive.Input aria-label="Edit message" />
        <ComposerPrimitive.Cancel>Cancel edit</ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send>Save & resend</ComposerPrimitive.Send>
      </ComposerPrimitive.Root> : <div className="message-text">
        <MessagePrimitive.Parts components={role === "assistant" ? { Text: AssistantText } : undefined} />
      </div>}
      {role === "user" && !editing && <ActionBarPrimitive.Root className="message-actions"><ActionBarPrimitive.Edit>Edit</ActionBarPrimitive.Edit></ActionBarPrimitive.Root>}
      {role === "assistant" && <>
        {running && <div role="status" className="thinking">Thinking<span aria-hidden> ● ● ●</span></div>}
        <MessageUsage subscription={subscription} />
        <ActionBarPrimitive.Root className="message-actions" hideWhenRunning>
          <ActionBarPrimitive.Copy>{copied ? 'Copied' : 'Copy'}</ActionBarPrimitive.Copy>
          <ActionBarPrimitive.Reload>Regenerate</ActionBarPrimitive.Reload>
        </ActionBarPrimitive.Root>
      </>}
      {statuses.get(id) && <p role="status">Response {statuses.get(id)}. This turn is excluded from future context.</p>}
      <MessagePrimitive.Error><ErrorPrimitive.Root className="chat-error">
        <ErrorPrimitive.Message />
        <ActionBarPrimitive.Reload>Retry</ActionBarPrimitive.Reload>
      </ErrorPrimitive.Root></MessagePrimitive.Error>
    </MessagePrimitive.Root>
  );
}
export function Chat({
  conversation,
  draft,
  onDraft,
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
  draft: string;
  onDraft: (value: string) => void;
  history: Message[];
  selection: Selection | null;
  onClearSelection: () => void;
  providers: Providers;
  model: string;
  onModel: (value: string) => void;
  onSettings: () => void;
  onProvidersChanged: () => Promise<void>;
}) {
  const [options, setOptions] = useState<Record<string,string|boolean>>(conversation.options ?? {});
  const declared = providers.find(p => p.config.id === conversation.providerId)?.models.find(m => m.id === conversation.modelId)?.options ?? [];
  const effectiveOptions = Object.fromEntries(declared.map(o => [o.id, options[o.id] ?? o.default]));
  const usage = useUsage(conversation.id);
  const budget = useBudgetGuard(usage.data, conversation.id, draft);
  const available = providers.find(p => p.config.id === conversation.providerId);
  const unavailable = !available?.config.enabled || !available.availability.available;
  const current = useRef({ conversation, selection, onClearSelection });
  current.current = { conversation: { ...conversation, options: effectiveOptions }, selection, onClearSelection };
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
            options: c.options,
            ...(s ? { selection: s } : {}),
          };
        },
        id => {
          if (current.current.selection) selections.current.set(id, current.current.selection);
          current.current.onClearSelection();
        },
      ),
    [],
  );
  useEffect(() => () => connection.dispose(), [connection]);
  const runtime = useLocalRuntime(connection.adapter, {
    initialMessages: history.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.parts.map(p => ({ type: "text" as const, text: p.text })),
      createdAt: new Date(m.createdAt),
      metadata: { custom: { usage: m.parts.find(p => p.usage)?.usage, modelId: m.parts[0]?.modelId, options: m.parts[0]?.options, selection: m.parts[0]?.selection, turnId: m.parts[0]?.turnId } },
    })),
  });
  useEffect(() => { runtime.thread.composer.setText(draft); return runtime.thread.composer.subscribe(() => onDraft(runtime.thread.composer.getState().text)); }, [runtime, onDraft]);
  const statuses = new Map(history.flatMap(m => m.parts.flatMap(p => p.status && p.status !== "complete" ? [[m.id, p.status] as const] : [])));
  const selections = useRef(new Map<string, Selection>(history.flatMap(m => m.parts.flatMap(p => p.selection ? [[m.id, p.selection] as const] : []))));
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="thread">
        <ThreadPrimitive.Viewport className="transcript">
          <ThreadPrimitive.Empty>
            <div className="empty">
              <div className="empty-symbol">✦</div>
              <h3>Make room for a question</h3>
              <p>Select a passage, or ask about the whole document.</p>
              <ThreadPrimitive.Suggestion prompt="Summarize this document" method="replace">Summarize this document</ThreadPrimitive.Suggestion>
              <ThreadPrimitive.Suggestion prompt="Explain the selected passage" method="replace">Explain the selected passage</ThreadPrimitive.Suggestion>
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages>
            {() => <ChatMessage subscription={conversation.providerId.endsWith("-cli")} selections={selections.current} statuses={statuses} />}
          </ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>
        <ThreadPrimitive.ScrollToBottom className="scroll-bottom" aria-label="Scroll to bottom">↓ Latest</ThreadPrimitive.ScrollToBottom>
        {unavailable && <p role="alert">This conversation’s provider is unavailable. Add an API key or enable it in Settings.</p>}
        <ComposerPrimitive.Root
          className="composer"
          onSubmitCapture={budget.guard}
        >
          {selection && (
            <div className="selection-chip">
              <SelectionPreview selection={selection} />
              <button
                type="button"
                aria-label="Remove selection"
                onClick={onClearSelection}
              >
                ×
              </button>
            </div>
          )}
          <ChatComposerInput />
          <div className="composer-footer">
            <ModelPicker
              providers={providers}
              model={model}
              onModel={onModel}
              onSettings={onSettings}
              onProvidersChanged={onProvidersChanged}
            />
            <ModelOptions providers={providers} model={model} values={options} onChange={next => { setOptions(next); void desktop.invoke('conversations:options', { conversationId: conversation.id, options: next }).catch(() => {}); }} />
            <div className="row">
              <ComposerPrimitive.Cancel className="stop-button">
                Stop
              </ComposerPrimitive.Cancel>
              <ComposerPrimitive.Send
                onClick={budget.guard}
                disabled={unavailable}
                className="send-button"
                aria-label="Send message"
              >
                ↑
              </ComposerPrimitive.Send>
            </div>
          </div>
          <UsageMeter {...usage} />
          {budget.warning && <div className="usage-warning" role="alert">{budget.reason} The estimate allows 1,024 output tokens; actual usage can be higher.
            <button type="button" onClick={budget.approve}>Send anyway</button>
            <button type="button" onClick={budget.dismiss}>Cancel</button>
          </div>}
        </ComposerPrimitive.Root>
        <p className="composer-note">
          Grounded in your document. Check important details.
        </p>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function AssistantText() {
  const text = useAuiState(s => s.message.content.filter(p => p.type === "text").map(p => p.text).join("\n"));
  return <div className="markdown"><ReplyMarkdown text={text} /></div>;
}
export function SelectionPreview({ selection }: { selection: Selection }) {
  const plain = plainSelection(selection.text.replace(/^#{1,6} .*\n?/, ""));
  return <details className="selection-preview"><summary><strong>{selection.headingPath.join(" › ") || "Selected passage"}</strong><span>{plain.slice(0, 160)}{plain.length > 160 ? "…" : ""}</span></summary><div>{plain}</div></details>;
}

export function ChatComposerInput() {
  const composing = useRef(false);
  return <ComposerPrimitive.Input aria-label="Ask about your document" placeholder="Ask about your document…" rows={2}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={() => { composing.current = false; }}
    onKeyDown={e => { if (e.key === 'Enter' && (composing.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) { e.preventDefault(); e.stopPropagation(); } }} />;
}
