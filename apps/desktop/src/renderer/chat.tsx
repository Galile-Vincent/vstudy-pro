import { useTranslation } from "react-i18next";
import { tr } from '../shared/i18n';
import { ModelPicker } from "./model-picker";
export { ModelPicker } from "./model-picker";
import { MessageUsage } from "./usage/chip";
import { UsageButton, UsageMeter, useUsage, useBudgetGuard } from "./usage/meter";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  WebSpeechSynthesisAdapter,
  useAui,
  ComposerPrimitive,
  useLocalRuntime,
  useAuiState,
} from "@assistant-ui/react";
import type { Conversation, Message, Selection } from "../shared";
import { Thread } from "./components/assistant-ui/elements/thread.aui";
import { Button } from "./components/ui/button";
import { plainSelection } from "./selection-preview";
import { desktop } from "./bridge";
import { documentCitationSchema } from "../shared";
import { Suggestions } from "./components/assistant-ui/elements/suggestions";
import { DocumentReference } from "./components/assistant-ui/elements/document-reference";
import { DocumentSource, DocumentTool, jumpToCitation } from './document-elements';
import { assistantContent } from './chat-content';
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
  documentPageCount = 0,
  documentTitle = tr('common:document'),
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
  documentPageCount?: number; documentTitle?: string;
}) {
  useTranslation();
  const [options, setOptions] = useState<Record<string,string|boolean>>(conversation.options ?? {});
  useEffect(() => setOptions(conversation.options ?? {}), [conversation.providerId,conversation.modelId]);
  const declared = providers.find(p => p.config.id === conversation.providerId)?.models.find(m => m.id === conversation.modelId || m.resolvedId === conversation.modelId)?.options ?? [];
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
  const speech = useMemo(() => typeof window !== 'undefined' && 'speechSynthesis' in window ? new WebSpeechSynthesisAdapter() : undefined, []);
  const suggestion = useMemo(() => ({generate: async () => [{prompt:tr('common:which_passages_support_this_answer')},{prompt:tr('common:explain_this_more_simply')}]}), []);
  const runtime = useLocalRuntime(connection.adapter, {
    adapters: { suggestion, ...(speech ? {speech} : {}) },
    initialMessages: history.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.role === 'assistant' ? m.parts.flatMap(p => assistantContent(p.text,p.reasoning,p.citations,p.toolCalls)) : m.parts.map(p => ({type:'text' as const,text:p.text})),
      createdAt: new Date(m.createdAt),
      ...(m.role === 'assistant' && m.parts.some(p => p.status === 'error') ? { status: { type: 'incomplete' as const, reason: 'error' as const, error: tr('errors:provider_unavailable') } } : {}),
      ...(m.role === 'assistant' && m.parts.some(p => p.status === 'aborted') ? {status:{type:'incomplete' as const,reason:'cancelled' as const}} : {}),
      metadata: { custom: { usage: m.parts.find(p => p.usage)?.usage, modelId: m.parts[0]?.modelId, options: m.parts[0]?.options, selection: m.parts[0]?.selection, turnId: m.parts[0]?.turnId, citations: m.parts[0]?.citations } },
    })),
  });
  useEffect(() => { runtime.thread.composer.setText(draft); return runtime.thread.composer.subscribe(() => onDraft(runtime.thread.composer.getState().text)); }, [runtime, onDraft]);
  const statuses = new Map(history.flatMap(m => m.parts.flatMap(p => p.status && p.status !== "complete" ? [[m.id, p.status] as const] : [])));
  const selections = useRef(new Map<string, Selection>(history.flatMap(m => m.parts.flatMap(p => p.selection ? [[m.id, p.selection] as const] : []))));
  const extensions = {
    selection, onClearSelection, usage, budget, unavailable, onUsage,
    picker: <ModelPicker providers={providers} model={model} onModel={onModel} onSettings={onSettings} onProvidersChanged={onProvidersChanged} values={options} onChange={next => { setOptions(next); void desktop.invoke('conversations:options', { conversationId: conversation.id, options: next }).catch(() => {}); }} />,
    documentPageCount, documentTitle, models: providers.flatMap(p => p.models), selections: selections.current, statuses, subscription: conversation.providerId.endsWith('-cli'),
  };
  return <AssistantRuntimeProvider runtime={runtime}><DocumentChatContext.Provider value={extensions}>
    {unavailable && <p role="alert">{tr('common:this_conversation_s_provider_is_unavailable_add_an_api_key_or_enable_it_in_settings')}</p>}
    <Thread components={documentComponents} />
    <p className="composer-note">{tr('common:grounded_in_your_document_check_important_details')}</p>
  </DocumentChatContext.Provider></AssistantRuntimeProvider>;
}

type DocumentChat = {
  selection: Selection | null; onClearSelection: () => void;
  usage: ReturnType<typeof useUsage>; budget: ReturnType<typeof useBudgetGuard>;
  unavailable: boolean; onUsage: () => void; picker: React.ReactNode;
  documentPageCount: number; documentTitle: string; models: Providers[number]["models"]; selections: Map<string, Selection>; statuses: Map<string, string>; subscription: boolean;
};
const DocumentChatContext = createContext<DocumentChat | null>(null);
const useDocumentChat = () => useContext(DocumentChatContext)!;
function ComposerSelection() {
  useTranslation();
  const {selection,onClearSelection} = useDocumentChat();
  return selection && <div className="selection-chip"><SelectionPreview selection={selection} /><button type="button" aria-label={tr('common:remove_selection')} onClick={onClearSelection}>×</button></div>;
}
function ComposerBanner() {
  useTranslation();
  const {usage,budget} = useDocumentChat();
  return <><UsageMeter {...usage} />{budget.warning && <div className="usage-warning" role="alert" title={tr('common:the_estimate_allows_1_024_output_tokens_actual_usage_can_be_higher')}><span>{budget.reason}</span><div className="usage-warning-actions"><Button type="button" variant="outline" size="sm" onClick={budget.approve}>{tr('common:send_anyway')}</Button><Button type="button" variant="ghost" size="sm" onClick={budget.dismiss}>{tr('common:cancel')}</Button></div></div>}</>;
}
function ComposerModel() {
  useTranslation(); return useDocumentChat().picker; }
function ComposerUsage() {
  useTranslation(); const {usage,onUsage} = useDocumentChat(); return <UsageButton {...usage} onClick={onUsage} />; }
function MessageSelection() {
  useTranslation();
  const id = useAuiState(s => s.message.id), {selections} = useDocumentChat();
  const selected = selections.get(id);
  return selected && <SelectionPreview selection={selected} />;
}
function DocumentSuggestions() {
  useTranslation();
  const aui = useAui();
  return <Suggestions suggestions={[tr('common:summarize_this_document'),tr('common:explain_the_key_ideas'),tr('common:compare_the_main_arguments')]} selectedSuggestion={null} cycle={0} onSuggestion={prompt => aui.composer().setText(prompt)} variant="list" />;
}
function DocumentMessageFooter() {
  useTranslation();
  const rawCitations = useAuiState(s => s.message.metadata.custom.citations);
  const parsedCitations = documentCitationSchema.array().safeParse(rawCitations);
  const {documentPageCount,documentTitle,usage,models,statuses,subscription} = useDocumentChat();
  const citations = parsedCitations.success ? parsedCitations.data.filter(c => c.page) : [];
  const [activePage,setActivePage] = useState(0);
  const stopped = useAuiState(s => s.message.status?.type === "incomplete" && s.message.status.reason === "cancelled");
  const createdAt = useAuiState(s => s.message.createdAt);
  const isLast = useAuiState(s => s.message.index === s.thread.messages.length - 1);
  const fallbackUsage = stopped && isLast ? usage.data?.records.find(record => Date.parse(record.createdAt) >= (createdAt?.getTime() ?? Infinity)) : undefined;
  const id = useAuiState(s => s.message.id);
  return <div className="document-message-footer">{documentPageCount > 0 && citations.length > 0 && <details><summary>{tr('common:document_references')}</summary><DocumentReference title={documentTitle} pages={documentPageCount} anchors={citations.map(c => ({page:c.page!,quote:c.quote}))} activePage={activePage || citations[0]!.page!} onJump={page => {setActivePage(page);const citation=citations.find(c => c.page === page);if(citation) jumpToCitation(citation);}} /></details>}<MessageUsage subscription={subscription} models={models} fallbackUsage={fallbackUsage} />{(stopped || statuses.get(id) === "aborted") && <p role="status" className="muted">{tr('common:stopped_partial_response_excluded_from_future_context')}</p>}{statuses.get(id) && statuses.get(id) !== "aborted" && <p role="status">{tr('common:response')}{statuses.get(id)}{tr('common:this_turn_is_excluded_from_future_context')}</p>}</div>;
}
function useComposerBindings() {
  useTranslation(); const {budget,unavailable} = useDocumentChat(); return { onSubmitCapture: budget.guard, disabled: unavailable }; }
const documentComponents = { WelcomeExtra:DocumentSuggestions, Source:DocumentSource, ToolFallback:DocumentTool, ComposerExtra: ComposerModel, ComposerPrefix: ComposerSelection, ComposerBanner, ComposerUsage, UserMessagePrefix: MessageSelection, MessageFooter: DocumentMessageFooter, ComposerInput: ChatComposerInput, useComposerBindings };

export function SelectionPreview({ selection }: { selection: Selection }) {
  useTranslation();
  const plain = plainSelection(selection.text.replace(/^#{1,6} .*\n?/, ""));
  return <details className="selection-preview"><summary><strong>{selection.headingPath.join(" › ") || tr('common:selected_passage')}</strong><span>{plain.slice(0, 160)}{plain.length > 160 ? "…" : ""}</span></summary><div>{plain}</div></details>;
}

export function ChatComposerInput() {
  useTranslation();
  const composing = useRef(false);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = () => { composing.current = false; clearTimeout(expiry.current); };
  const refresh = () => { composing.current = true; clearTimeout(expiry.current); expiry.current = setTimeout(clear,1500); };
  useEffect(() => () => clearTimeout(expiry.current), []);
  return <ComposerPrimitive.Input className="aui-composer-input" aria-label={tr('common:ask_about_your_document')} placeholder={tr('common:ask_about_your_document')} rows={2}
    onCompositionStart={refresh}
    onCompositionUpdate={refresh}
    onBlur={clear}
    onCompositionEnd={clear}
    onKeyDown={e => { if (e.key === 'Enter' && (composing.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) { e.preventDefault(); e.stopPropagation(); } }} />;
}
