import { MemoryConsentCard } from './review/memory-consent';
import { ChatTutorModeControl, useTutorMode } from "./tutor-mode-control";
import { chatHistoryMessages, EarlierMessages, type MessageCursor } from './chat-history';
import { useChatMotion } from './motion/chat-motion';
import { FileText } from 'lucide-react';
import { ChatAnnouncement, CopyAnswerButton } from './chat-accessibility';
import { ReaderOfflineNotice } from './workspace/offline-notice';
import { ReaderWelcome } from './workspace/reader-welcome';
import { MarkdownText } from './document-markdown';
import { useTranslation } from "react-i18next";
import { tr } from '../shared/i18n';
import { ModelControls } from "./model-controls";
export { ModelControls } from "./model-controls";
import { MessageUsage } from "./usage/chip";
import { UsageMeter, useUsage, useBudgetGuard } from "./usage/meter";
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
import { SelectionPreview } from "./selection-preview-view";
export { SelectionPreview } from "./selection-preview-view";
import { desktop } from "./bridge";
import { documentCitationSchema } from "../shared";
import { DocumentReference } from "./components/assistant-ui/elements/document-reference";
import { DocumentSource, DocumentTool, jumpToCitation } from './document-elements';
import { createChatAdapter } from "./chat-adapter";
import { type Providers } from "./providers";

export function Chat({
  conversation,
  jumpMessageId,
  onProposals = () => {},
  promptRequest,
  autoFocus = true,
  draft,
  onDraft,
  history,
  historyCursor,
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
  jumpMessageId?: string | undefined;
  onProposals?: (actions: import("../shared/moodle").MoodleAgentAction[]) => void;
  promptRequest?: {text:string; id:number; materials?: import("../shared/planner").MaterialRequest};
  autoFocus?: boolean;
  draft: string;
  onDraft: (value: string) => void;
  history: Message[];
  historyCursor?: MessageCursor | null | undefined;
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
  const [tutorMode, setTutorMode] = useTutorMode(conversation.id);
  const [earlierHistory, setEarlierHistory] = useState<Message[]>([]);
  const restoredHistory = useMemo(() => [...earlierHistory, ...history], [earlierHistory, history]);
  const motion = useChatMotion(restoredHistory);
  const [options, setOptions] = useState<Record<string,string|boolean>>(conversation.options ?? {});
  useEffect(() => setOptions(conversation.options ?? {}), [conversation.providerId,conversation.modelId]);
  const declared = providers.find(p => p.config.id === conversation.providerId)?.models.find(m => m.id === conversation.modelId || m.resolvedId === conversation.modelId)?.options ?? [];
  const effectiveOptions = Object.fromEntries(declared.map(o => [o.id, options[o.id] ?? o.default]));
  const usage = useUsage(conversation.id, conversation.modelId);
  const budget = useBudgetGuard(usage.data, conversation.id, draft);
  const available = providers.find(p => p.config.id === conversation.providerId);
  const unavailable = !available?.config.enabled || !available.availability.available;
  const current = useRef({ conversation, selection, onClearSelection, onProposals, tutorMode });
  current.current = { conversation: { ...conversation, options: effectiveOptions }, selection, onClearSelection, onProposals, tutorMode };
  const partialHistory = useRef(!!historyCursor);
  const connection = useMemo(
    () =>
      createChatAdapter(
        desktop,
        async () => {
          const { conversation: c, selection: s } = current.current;
          return {
            tutorMode: current.current.tutorMode,
            conversationId: c.id,
            ...(c.scope === "course" ? {scope:"course" as const,courseId:c.courseId} : c.scope === "general" ? {scope:"general" as const} : {documentId:c.documentId}),
            providerId: c.providerId,
            modelId: c.modelId,
            options: c.options,
            ...(c.scope !== "course" && s ? { selection: s } : {}),
          };
        },
        id => {
          if (current.current.selection) selections.current.set(id, current.current.selection);
          current.current.onClearSelection();
        },
        actions => current.current.onProposals(actions),
        () => partialHistory.current,
      ),
    [],
  );
  useEffect(() => () => connection.dispose(), [connection]);
  const speech = useMemo(() => typeof window !== 'undefined' && 'speechSynthesis' in window ? new WebSpeechSynthesisAdapter() : undefined, []);
  const suggestion = useMemo(() => ({generate: async () => [{prompt:tr('common:which_passages_support_this_answer')},{prompt:tr('common:explain_this_more_simply')}]}), []);
  const runtime = useLocalRuntime(connection.adapter, {
    adapters: { suggestion, ...(speech ? {speech} : {}) },
    initialMessages: chatHistoryMessages(history),
  });
  useEffect(() => { if (promptRequest) { runtime.thread.append({role:"user",content:[{type:"text",text:promptRequest.text}],metadata:{custom:{materials:promptRequest.materials}}}); } }, [promptRequest?.id]);
  useEffect(() => { runtime.thread.composer.setText(draft); return runtime.thread.composer.subscribe(() => onDraft(runtime.thread.composer.getState().text)); }, [runtime, onDraft]);
  useEffect(() => {
    if (!jumpMessageId) return;
    let frame=0,remaining=60;
    const jump=()=>{const element=Array.from(document.querySelectorAll<HTMLElement>('[data-message-id]')).find(el=>el.dataset.messageId===jumpMessageId);
      if(element){element.scrollIntoView({block:'center',behavior:'instant'});element.classList.add('history-jump');element.tabIndex=-1;element.focus({preventScroll:true});}
      else if(--remaining>0)frame=requestAnimationFrame(jump);
    };
    frame=requestAnimationFrame(jump);
    return()=>{cancelAnimationFrame(frame);document.querySelectorAll('.history-jump').forEach(el=>el.classList.remove('history-jump'));};
  },[jumpMessageId, earlierHistory.length]);
  const statuses = new Map([...earlierHistory, ...history].flatMap(m => m.parts.flatMap(p => p.status && p.status !== "complete" ? [[m.id, p.status] as const] : [])));
  const selections = useRef(new Map<string, Selection>(history.flatMap(m => m.parts.flatMap(p => p.selection ? [[m.id, p.selection] as const] : []))));
  const extensions = {
    selection, onClearSelection, usage, budget, unavailable, onUsage, onSettings, isCourse: conversation.scope === "course", isGeneral: conversation.scope === "general",
    picker: <><ChatTutorModeControl mode={tutorMode} onChange={setTutorMode} unavailable={unavailable} onAnswer={() => budget.guardSend(tr('chat:answer_directly_request'), () => { if (!runtime.thread.getState().isRunning) runtime.thread.append({role:"user",content:[{type:"text",text:tr('chat:answer_directly_request')}],metadata:{custom:{tutorMode:"direct"}}}); })}/><ModelControls providers={providers} model={model} onModel={onModel} onSettings={onSettings} onProvidersChanged={onProvidersChanged} values={options} onChange={next => { setOptions(next); void desktop.invoke('conversations:options', { conversationId: conversation.id, options: next }).catch(() => {}); }} /></>,
    documentPageCount, documentTitle, models: providers.flatMap(p => p.models), selections: selections.current, statuses, subscription: conversation.providerId.endsWith('-cli'),
  };
  return <AssistantRuntimeProvider runtime={runtime}><DocumentChatContext.Provider value={extensions}>
    <EarlierMessages jumpMessageId={jumpMessageId} runtime={runtime} conversationId={conversation.id} cursor={historyCursor} onLoaded={(messages, nextCursor) => {
      partialHistory.current = !!nextCursor;
      setEarlierHistory(current => [...messages, ...current]);
      for (const message of messages) for (const part of message.parts) if (part.selection) selections.current.set(message.id, part.selection);
    }}/>
    <div className="chat-motion" ref={motion}><Thread components={documentComponents} autoFocus={autoFocus} /></div>
    <p className="composer-note">{conversation.scope === 'course' ? tr('planner:agent_scope') : tr(conversation.scope==='general'?'history:general_note':'common:grounded_in_your_document_check_important_details')}</p>
  </DocumentChatContext.Provider></AssistantRuntimeProvider>;
}

type DocumentChat = {
  isCourse: boolean; isGeneral: boolean;
  selection: Selection | null; onClearSelection: () => void;
  usage: ReturnType<typeof useUsage>; budget: ReturnType<typeof useBudgetGuard>;
  unavailable: boolean; onUsage: () => void; onSettings: () => void; picker: React.ReactNode;
  documentPageCount: number; documentTitle: string; models: Providers[number]["models"]; selections: Map<string, Selection>; statuses: Map<string, string>; subscription: boolean;
};
const DocumentChatContext = createContext<DocumentChat | null>(null);
const useDocumentChat = () => useContext(DocumentChatContext)!;
function ComposerSelection() {
  useTranslation();
  const {selection,onClearSelection,isGeneral,documentTitle} = useDocumentChat();
  return <><div className="art-reader-context"><FileText size={14} aria-hidden="true"/><span>{isGeneral ? tr('history:general_context') : selection ? tr('library:context_selection') : documentTitle}</span></div>{selection && <div className="selection-chip"><SelectionPreview selection={selection} /><button type="button" aria-label={tr('common:remove_selection')} onClick={onClearSelection}>×</button></div>}</>;
}
function ComposerBanner() {
  useTranslation();
  const {usage,budget} = useDocumentChat();
  return <><MemoryConsentCard /><UsageMeter {...usage} />{budget.warning && <div className="usage-warning" role="alert" title={tr('common:the_estimate_allows_1_024_output_tokens_actual_usage_can_be_higher')}><span>{budget.reason}</span><div className="usage-warning-actions"><Button type="button" variant="outline" size="sm" onClick={budget.approve}>{tr('common:send_anyway')}</Button><Button type="button" variant="ghost" size="sm" onClick={budget.dismiss}>{tr('common:cancel')}</Button></div></div>}</>;
}
function ComposerModel() {
  useTranslation(); return useDocumentChat().picker; }
function MessageSelection() {
  useTranslation();
  const id = useAuiState(s => s.message.id), {selections} = useDocumentChat();
  const selected = selections.get(id);
  return selected && <SelectionPreview selection={selected} />;
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
  return <div className="document-message-footer">{documentPageCount > 0 && citations.length > 0 && <details><summary>{tr('common:document_references')}</summary><DocumentReference title={documentTitle} pages={documentPageCount} anchors={citations.map(c => ({page:c.page!,quote:c.quote}))} activePage={activePage || citations[0]!.page!} onJump={page => {setActivePage(page);const citation=citations.find(c => c.page === page);if(citation) jumpToCitation(citation);}} /></details>}<MessageUsage subscription={subscription} models={models} fallbackUsage={fallbackUsage} />{(stopped || statuses.get(id) === "aborted") && <p role="status" className="muted">{tr('common:stopped_partial_response_excluded_from_future_context')}</p>}</div>;
}
function useComposerBindings() {
  useTranslation(); const {budget,unavailable} = useDocumentChat(); return { onSubmitCapture: budget.guard, disabled: unavailable }; }
function DocumentWelcome() {
  const aui = useAui();
  const { selection, documentTitle } = useDocumentChat();
  return <ReaderWelcome title={documentTitle} hasSelection={!!selection} onQuestion={prompt => aui.composer().setText(prompt)}/>;
}
function DocumentNotice() {
  const { unavailable } = useDocumentChat();
  return unavailable ? <ReaderOfflineNotice/> : null;
}
const documentComponents = { Announcement: ChatAnnouncement, CopyAction: CopyAnswerButton, Text: MarkdownText, Welcome:DocumentWelcome, ThreadNotice:DocumentNotice, Source:DocumentSource, ToolFallback:DocumentTool, ComposerExtra: ComposerModel, ComposerPrefix: ComposerSelection, ComposerBanner, UserMessagePrefix: MessageSelection, MessageFooter: DocumentMessageFooter, ComposerInput: ChatComposerInput, useComposerBindings };

export function ChatComposerInput() {
  useTranslation();
  const context=useContext(DocumentChatContext);
  const selection=context?.selection;
  const input=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{if(selection) input.current?.focus();},[selection]);
  const composing = useRef(false);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = () => { composing.current = false; clearTimeout(expiry.current); };
  const refresh = () => { composing.current = true; clearTimeout(expiry.current); expiry.current = setTimeout(clear,1500); };
  useEffect(() => () => clearTimeout(expiry.current), []);
  return <ComposerPrimitive.Input ref={input} className="aui-composer-input" aria-label={context?.isCourse ? tr('moodle:ask_course') : tr('common:ask_about_your_document')} placeholder={context?.isCourse ? tr('moodle:ask_course') : tr('common:ask_document_placeholder')} rows={2}
    onCompositionStart={refresh}
    onCompositionUpdate={refresh}
    onBlur={clear}
    onCompositionEnd={clear}
    onKeyDown={e => { if (e.key === 'Enter' && (composing.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) { e.preventDefault(); e.stopPropagation(); } }} />;
}
