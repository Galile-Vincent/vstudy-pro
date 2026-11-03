import { ModelPicker } from "./model-picker";
export { ModelPicker } from "./model-picker";
import { MessageUsage } from "./usage/chip";
import { UsageButton, UsageMeter, useUsage, useBudgetGuard } from "./usage/meter";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  useLocalRuntime,
  useAuiState,
} from "@assistant-ui/react";
import type { Conversation, Message, Selection } from "../shared";
import { Thread } from "./components/assistant-ui/elements/thread.aui";
import { plainSelection } from "./selection-preview";
import { desktop } from "./bridge";
import { createChatAdapter } from "./chat-adapter";
import { type Providers } from "./providers";

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
  onUsage,
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
  onUsage: () => void;
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
      ...(m.role === 'assistant' && m.parts.some(p => p.status === 'error') ? { status: { type: 'incomplete' as const, reason: 'error' as const, error: m.parts.find(p => p.error)?.error ?? 'Provider unavailable' } } : {}),
      metadata: { custom: { usage: m.parts.find(p => p.usage)?.usage, modelId: m.parts[0]?.modelId, options: m.parts[0]?.options, selection: m.parts[0]?.selection, turnId: m.parts[0]?.turnId } },
    })),
  });
  useEffect(() => { runtime.thread.composer.setText(draft); return runtime.thread.composer.subscribe(() => onDraft(runtime.thread.composer.getState().text)); }, [runtime, onDraft]);
  const statuses = new Map(history.flatMap(m => m.parts.flatMap(p => p.status && p.status !== "complete" ? [[m.id, p.status] as const] : [])));
  const selections = useRef(new Map<string, Selection>(history.flatMap(m => m.parts.flatMap(p => p.selection ? [[m.id, p.selection] as const] : []))));
  const extensions = {
    selection, onClearSelection, usage, budget, unavailable, onUsage,
    picker: <ModelPicker providers={providers} model={model} onModel={onModel} onSettings={onSettings} onProvidersChanged={onProvidersChanged} values={options} onChange={next => { setOptions(next); void desktop.invoke('conversations:options', { conversationId: conversation.id, options: next }).catch(() => {}); }} />,
    selections: selections.current, statuses, subscription: conversation.providerId.endsWith('-cli'),
  };
  return <AssistantRuntimeProvider runtime={runtime}><DocumentChatContext.Provider value={extensions}>
    {unavailable && <p role="alert">This conversation’s provider is unavailable. Add an API key or enable it in Settings.</p>}
    <Thread components={documentComponents} />
    <p className="composer-note">Grounded in your document. Check important details.</p>
  </DocumentChatContext.Provider></AssistantRuntimeProvider>;
}

type DocumentChat = {
  selection: Selection | null; onClearSelection: () => void;
  usage: ReturnType<typeof useUsage>; budget: ReturnType<typeof useBudgetGuard>;
  unavailable: boolean; onUsage: () => void; picker: React.ReactNode;
  selections: Map<string, Selection>; statuses: Map<string, string>; subscription: boolean;
};
const DocumentChatContext = createContext<DocumentChat | null>(null);
const useDocumentChat = () => useContext(DocumentChatContext)!;
function ComposerSelection() {
  const {selection,onClearSelection} = useDocumentChat();
  return selection && <div className="selection-chip"><SelectionPreview selection={selection} /><button type="button" aria-label="Remove selection" onClick={onClearSelection}>×</button></div>;
}
function ComposerBanner() {
  const {usage,budget} = useDocumentChat();
  return <><UsageMeter {...usage} />{budget.warning && <div className="usage-warning" role="alert">{budget.reason} The estimate allows 1,024 output tokens; actual usage can be higher.<button type="button" onClick={budget.approve}>Send anyway</button><button type="button" onClick={budget.dismiss}>Cancel</button></div>}</>;
}
function ComposerModel() { return useDocumentChat().picker; }
function ComposerUsage() { const {usage,onUsage} = useDocumentChat(); return <UsageButton {...usage} onClick={onUsage} />; }
function MessageSelection() {
  const id = useAuiState(s => s.message.id), {selections} = useDocumentChat();
  const selected = selections.get(id);
  return selected && <SelectionPreview selection={selected} />;
}
function DocumentMessageFooter() {
  const id = useAuiState(s => s.message.id), {statuses,subscription} = useDocumentChat();
  return <><MessageUsage subscription={subscription} />{statuses.get(id) && <p role="status">Response {statuses.get(id)}. This turn is excluded from future context.</p>}</>;
}
function useComposerBindings() { const {budget,unavailable} = useDocumentChat(); return { onSubmitCapture: budget.guard, disabled: unavailable }; }
const documentComponents = { ComposerExtra: ComposerModel, ComposerPrefix: ComposerSelection, ComposerBanner, ComposerUsage, UserMessagePrefix: MessageSelection, MessageFooter: DocumentMessageFooter, ComposerInput: ChatComposerInput, useComposerBindings };

export function SelectionPreview({ selection }: { selection: Selection }) {
  const plain = plainSelection(selection.text.replace(/^#{1,6} .*\n?/, ""));
  return <details className="selection-preview"><summary><strong>{selection.headingPath.join(" › ") || "Selected passage"}</strong><span>{plain.slice(0, 160)}{plain.length > 160 ? "…" : ""}</span></summary><div>{plain}</div></details>;
}

export function ChatComposerInput() {
  const composing = useRef(false);
  return <ComposerPrimitive.Input className="aui-composer-input" aria-label="Ask about your document" placeholder="Ask about your document…" rows={2}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={() => { composing.current = false; }}
    onKeyDown={e => { if (e.key === 'Enter' && (composing.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) { e.preventDefault(); e.stopPropagation(); } }} />;
}
