import { useReadingActivity } from '../home/use-reading-activity';
import { BlankChat } from '../motion/blank-chat';
import { useNavigate } from '../shell';
import { Settings as SettingsIcon, ArrowLeftRight, Plus, Trash2, X, FileText } from "lucide-react";
import { errorText, statusText } from "../status";
import { conversionStatus } from "../../shared/status";
import { useTranslation } from "react-i18next";
import { applyLanguage } from "../i18n";
import { tr } from '../../shared/i18n';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type {
  Conversation,
  Document,
  Message,
  Selection,
  Settings,
  ProviderConfig,
} from "../../shared";
import { defaultSettings } from "../../shared";
import { desktop, isMock } from "../bridge";
import { resolveModel } from "../model";
import { ModelControls } from "../model-controls";
import { SelectionPreview } from "../selection-preview-view";
const Chat=lazy(()=>import("../chat").then(module=>({default:module.Chat})));
import { DocumentMarkdown } from "../lazy-reader";
import { ConversationList } from "../conversation-list";
import { ProviderSettings, type Providers } from "../providers";

export function Workspace() {
  const { route, navigate } = useNavigate();
  useTranslation();
  const [settings, setSettings] = useState<Settings>(defaultSettings),
    [connected, setConnected] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]),
    [documentId, setDocumentId] = useState<Document["id"] | null>(null),
    [source, setSource] = useState("");
  const documentPageCount = useMemo(() => {let pages=0;for(const match of source.matchAll(/<!-- page (\d+) -->/g)){const value=Number(match[1]);if(Number.isSafeInteger(value)&&value>pages)pages=value;}return pages;},[source]);
  const [providers, setProviders] = useState<Providers>([]),
    [model, setModel] = useState("");
  const [settingsTab, setSettingsTab] = useState("providers");
  const [conversations, setConversations] = useState<Conversation[]>([]),
    [conversation, setConversation] = useState<Conversation | null>(null),
    [history, setHistory] = useState<Message[] | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null),
    [showSettings, setShowSettings] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loadingSource, setLoadingSource] = useState(false);

  const [compactPane, setCompactPane] = useState(() => sessionStorage.getItem("workspace-pane") ?? "reading");
  useEffect(() => { sessionStorage.setItem("workspace-pane",compactPane); }, [compactPane]);
  const [draft, setDraft] = useState("");
  const activeConversation = useRef(conversation);
  activeConversation.current = conversation;
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [partialSource, setPartialSource] = useState("");
  useEffect(() => {
    setPartialSource("");
    let active = true;
    const unsubscribe = desktop.onDocumentProgress?.(event => {
      setProgress(current => ({ ...current, [event.documentId]: event.message }));
      if (event.message === "Conversion complete") {
        void desktop.invoke("documents:list", {}).then(list => { if (active) setDocuments(list); }).catch(() => undefined);
      }
      const page = /^Converting page (\d+)\/(\d+)/.exec(event.message);
      if (event.documentId === documentId && page && (Number(page[1]) === 1 || Number(page[1]) === 5)) {
        void desktop.invoke("documents:read", { documentId: event.documentId }).then(text => {
          if (active) setPartialSource(text);
        }).catch(() => undefined);
      }
    });
    return () => { active = false; unsubscribe?.(); };
  }, [documentId]);
  const partialPreview = useMemo(() => partialSource && documentId ? <DocumentMarkdown source={partialSource} documentId={documentId}
    onSelect={() => setNotice(tr('common:selection_and_chat_are_available_when_conversion_finishes'))}
    onNotice={setNotice} /> : null, [partialSource, documentId]);
  useEffect(() => { if (route.documentId) setDocumentId(route.documentId); }, [route.documentId]);
  const doc = documents.find((d) => d.id === documentId);
  const [chatDocument,setChatDocument] = useState<Document['id'] | null>(null);
  useEffect(()=>{
    if(!doc) return;
    let second=0;
    // Cached chat code can still have an expensive first mount; paint metadata first.
    const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>setChatDocument(doc.id));});
    return ()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};
  },[doc?.id]);
  useReadingActivity(doc?.id ?? null, doc?.status === "ready" && !loadingSource);
  const pageProgress = /^Converting page (\d+)\/(\d+)/.exec(doc ? progress[doc.id] ?? "" : "");
  const report = useCallback(
    (error: unknown) =>
      setNotice(
        errorText(error),
      ),
    [],
  );
  const refreshProviders = useCallback(async () => {
    const list = await desktop.invoke("providers:list", {});
    setProviders(list);
    if (!activeConversation.current) setModel(current => resolveModel(current, list));
  }, []);
  useEffect(() => {
    const refresh = () => { void desktop.invoke('providers:list',{discover:false}).then(setProviders).catch(report); };
    window.addEventListener('vstudy:providers-changed',refresh);
    return () => window.removeEventListener('vstudy:providers-changed',refresh);
  },[report]);
  useEffect(() => {
    let active = true;
    void Promise.all([
      desktop.invoke("settings:get", {}),
      (route.documentId
        ? desktop.invoke("documents:get", {documentId:route.documentId}).then(doc => doc ? [doc] : [])
        : desktop.invoke("documents:list", {})).then(rows => { if (active) setDocuments(rows); return rows; }),
      desktop.invoke("providers:list", {discover:false}),
    ])
      .then(([s, d, p]) => {
        if (!active) return;
        setSettings(s);
        void applyLanguage(s.language);
        void desktop.invoke('settings:appearance',{}).then(a => {document.documentElement.dataset.reducedTransparency=String(a.reducedTransparency);});
        setDocuments(d);
        setProviders(p);
        setConnected(true);
        setDocumentId(route.documentId ?? d.find(item => item.id === s.lastDocumentId)?.id ?? null);
        setModel(resolveModel(s.lastProviderId && s.lastModelId ? `${s.lastProviderId}/${s.lastModelId}` : "", p));
      })
      .catch(report);
    return () => {
      active = false;
    };
  }, [report]);
  useEffect(() => {
    if (!documents.some((d) => d.status === "converting")) return;
    const timer = setInterval(() => {
      void desktop
        .invoke("documents:list", {})
        .then(setDocuments)
        .catch(report);
    }, 1000);
    return () => clearInterval(timer);
  }, [documents, report]);
  useEffect(() => {
    let active = true;
    setSource("");
    setSelection(null);
    setConversation(null);
    setHistory(null);
    setConversations([]);
    if (!documentId) return;
    void desktop
      .invoke("conversations:list", { documentId })
      .then((list) => {
        if (active) {
          setConversations(list);
          let remembered: string | null = null;
          try { remembered = localStorage.getItem(`vstudy-conversation:${documentId}`); } catch { /* Persistence is optional when renderer storage is unavailable. */ }
          const selected = list.find(c => c.id === remembered) ?? list[0] ?? null;
          setConversation(selected);
          if (selected) setModel(`${selected.providerId}/${selected.modelId}`);
        }
      })
      .catch(report);
    return () => {
      active = false;
    };
  }, [documentId, report]);
  useEffect(() => {
    if (!conversation) return;
    try { localStorage.setItem(`vstudy-conversation:${conversation.documentId}`, conversation.id); } catch { /* Persistence is optional when renderer storage is unavailable. */ }
  }, [conversation?.id]);
  useEffect(() => {
    let active = true;
    setSource("");
    if (doc?.status !== "ready") return;
    setLoadingSource(true);
    void desktop
      .invoke("documents:read", { documentId: doc.id })
      .then((value) => {
        if (active) setSource(value);
      })
      .catch(report)
      .finally(() => {
        if (active) setLoadingSource(false);
      });
    return () => {
      active = false;
    };
  }, [doc?.id, doc?.status, report]);
  useEffect(() => {
    let active = true;
    setHistory(null);
    if (!conversation) return;
    void desktop
      .invoke("messages:list", { conversationId: conversation.id })
      .then((value) => {
        if (active) setHistory(value);
      })
      .catch(report);
    return () => {
      active = false;
    };
  }, [conversation?.id, report]);
  const saveSettings = async (next: Settings) => {
    try {
      const latest = await desktop.invoke("settings:get", {});
      const saved = await desktop.invoke("settings:set", { ...next, language:latest.language, replyLanguage:latest.replyLanguage, favoriteModels: latest.favoriteModels, recentModels: latest.recentModels, enableGenerativeUI: latest.enableGenerativeUI, converterIdleMinutes:latest.converterIdleMinutes,converterOffline:latest.converterOffline,modelDisplayNames: latest.modelDisplayNames });
      setSettings(saved);
    } catch (error) {
      report(error);
    }
  };
  useEffect(() => {
    if (connected && settings.lastDocumentId !== documentId) void saveSettings({ ...settings, lastDocumentId: documentId });
  }, [documentId, connected]);
  const chooseModel = (value: string) => {
    setModel(value);
    const slash = value.indexOf("/"),
      providerId = value.slice(0, slash) as ProviderConfig["id"],
      modelId = value.slice(slash + 1);
    void saveSettings({
      ...settings,
      lastProviderId: providerId,
      lastModelId: modelId,
    });
    if (conversation && `${conversation.providerId}/${conversation.modelId}` !== value) {
      void desktop.invoke('messages:list',{conversationId:conversation.id}).then(async messages => {
        if (messages.length) { await newConversation(value); return; }
        try {
          const next = await desktop.invoke('conversations:model',{conversationId:conversation.id,providerId,modelId});
          setConversation(next); setConversations(list => list.map(c => c.id === next.id ? next : c));
        } catch (error) {
          if (error instanceof Error && error.message.includes('errors.conversation_not_empty')) await newConversation(value);
          else throw error;
        }
      }).catch(report);
    }

  };
  const importing = useRef(false);
  const importDocument = async (paths?: string[]) => {
    if (!connected) { setNotice(tr('common:workspace_is_still_connecting_try_importing_again_in_a_moment')); return; }
    if (importing.current) return;
    importing.current = true;
    setBusy(true);
    try {
      const results = paths ? await desktop.invoke("documents:importPaths", { paths }) : null;
      const imported = results ? results.find(r => r.ok)?.document : await desktop.invoke("documents:import", {});
      if (results) setNotice(results.filter(r => !r.ok).map(r => `${r.path}: ${tr('errors:conversion_failed')}`).join("\n"));
      if (imported) {
        setDocuments(await desktop.invoke("documents:list", {}));
        setDocumentId(imported.id);
      }
    } catch (error) {
      report(error);
    } finally {
      setDocuments(await desktop.invoke("documents:list", {}));
      importing.current = false;
      setBusy(false);
    }
  };
  const newConversation = async (value = model) => {
    if (!doc || !model) return;
    setBusy(true);
    try {
      const slash = value.indexOf("/");
      const created = await desktop.invoke("conversations:create", {
        documentId: doc.id,
        providerId: value.slice(0, slash) as ProviderConfig["id"],
        modelId: value.slice(slash + 1),
      });
      setConversations((list) => [created, ...list]);
      setCompactPane("chat");
      setConversation(created);
      setHistory([]);
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  const selectedModel = providers.find(
    (p) => `${p.config.id}/` === model.slice(0, p.config.id.length + 1),
  );
  const canChat =
    doc?.status === "ready" &&
    !!model &&
    selectedModel?.availability.available &&
    selectedModel.config.enabled;
  useEffect(() => {
    if (selection) { setCompactPane("chat"); requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".aui-composer-input")?.focus()); }
    if (selection && !conversation && canChat && !busy) void newConversation();
  }, [selection, conversation, canChat, busy]);
  const chatControls = (
      <div className="workspace-conversations">

        <div className="row">
          <ConversationList conversations={conversations} current={conversation} providers={providers} canCreate={!!canChat && !busy} onSelect={c => {setConversation(c);setModel(`${c.providerId}/${c.modelId}`);}} onNew={() => newConversation()} onDelete={async id => {if (!window.confirm(tr('common:delete_this_conversation'))) return; await desktop.invoke('conversations:delete',{conversationId:id});setConversations(list=>list.filter(c=>c.id!==id));if(conversation?.id===id){setConversation(null);setHistory(null);}}}/>

          <button
            disabled={!canChat || busy}
            onClick={() => void newConversation()}
            aria-label={tr('common:new_chat')}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
  );
  const chat = (
    <section className="pane chat-pane" aria-label={tr('common:chat')}>
      {conversation && history ? (
        <Suspense fallback={<p role="status">{tr("common:loading_conversation")}</p>}>{chatDocument === documentId ? <Chat
          documentPageCount={documentPageCount}
          documentTitle={doc?.sourceName ?? tr('common:document')}
            onUsage={() => { setSettingsTab("usage"); setShowSettings(true); }}
          key={conversation.id}
          draft={draft}
          onDraft={setDraft}
          conversation={conversation}
          history={history}
          selection={selection}
          onClearSelection={() => setSelection(null)}
          providers={providers}
          model={`${conversation.providerId}/${conversation.modelId}`}
          onModel={chooseModel}
          onSettings={() => { setSettingsTab("providers"); setShowSettings(true); }}
          onProvidersChanged={refreshProviders}
        /> : <p role="status">{tr("common:loading_conversation")}</p>}</Suspense>
      ) : (
        <div className="chat-start">
          <BlankChat documentOpen={!!doc} hasSelection={!!selection} replyLanguage={settings.replyLanguage} disabled={!canChat || busy} onStart={() => void newConversation()} onQuestion={text => { setDraft(text); void newConversation(); }} />
          {selection && (
            <div className="selection-chip">
              <SelectionPreview selection={selection} />
              <button
                onClick={() => setSelection(null)}
                aria-label={tr('common:remove_selection')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <ModelControls
            providers={providers}
            model={model}
            onModel={chooseModel}
            onSettings={() => { setSettingsTab("providers"); setShowSettings(true); }}
            onProvidersChanged={refreshProviders}
          />
        </div>
      )}
    </section>
  );
  const reading = (
    <section id="reading-content" tabIndex={-1} className="pane reading-pane" aria-label={tr('common:document')}>
      <div className="pane-toolbar">
        <span className="eyebrow">{doc?.sourceName ?? tr('common:reading_space')}</span>
        {doc && <button className="icon-button" title={tr('common:delete_document')} aria-label={tr('common:delete_document')} onClick={() => {
          if (!window.confirm(tr('library:delete_document',{title:doc.title}))) return;
          void desktop.invoke("documents:delete", { documentId: doc.id }).then(async () => {
            const list = await desktop.invoke("documents:list", {}); setDocuments(list); setDocumentId(list[0]?.id ?? null);
          }).catch(report);
        }}><Trash2 size={16} /></button>}
        <span className="muted">
          {doc?.status === "ready" ? tr('common:converter_label',{converter:doc.converter}) : ""}
        </span>
      </div>
      {!doc ? (
        <div className="empty">
          <div className="empty-symbol"><FileText size={28}/></div>
          <h3>{tr('common:your_next_idea_starts_here')}</h3>
          <p>{tr('common:import_a_document_to_read_select_and_ask_questions')}</p>
          <button onClick={() => void importDocument()} disabled={busy || !connected}>
            {tr('common:import_document')}</button>
          <small className="muted">
            {tr('common:drop_a_file_anywhere_to_import_it')}</small>
        </div>
      ) : doc.status === "converting" ? (
        <>
          <div role="status" className={partialSource ? "pane-toolbar" : "empty"}>
            <p>{statusText(conversionStatus(progress[doc.id] ?? ''))}</p>
            {pageProgress && <progress aria-label={tr('common:conversion_progress')} value={Number(pageProgress[1])} max={Number(pageProgress[2])} />}
            {partialSource && <small>{tr('common:preview_of_first_pages_selection_and_chat_available_when_conversion_finishes')}</small>}
          </div>
          {partialPreview}
        </>
      ) : doc.status === "failed" ? (
        <div className="empty" role="alert">
          <h3>{tr('common:couldn_t_prepare_this_document')}</h3>
          <p>{errorText(new Error(doc.error))}</p>
          <button
            disabled={busy || !connected}
            onClick={() => {
              setBusy(true);
              void desktop
                .invoke("documents:retry", { documentId: doc.id })
                .then((updated) =>
                  setDocuments((list) =>
                    list.map((d) => (d.id === updated.id ? updated : d)),
                  ),
                )
                .catch(report)
                .finally(() => setBusy(false));
            }}
          >
            {tr('common:retry_conversion')}</button>
        </div>
      ) : loadingSource ? (
        <div className="empty" role="status">
          {tr('common:loading_document')}</div>
      ) : (
        <DocumentMarkdown
          key={doc.id}
          source={source}
          documentId={doc.id}
          onSelect={(value) => {
            setSelection(value);

          }}
          onNotice={setNotice}
        />
      )}
    </section>
  );
  return (
    <main
      className="workspace" data-compact-pane={compactPane} onFocusCapture={event=>{const target=event.target as HTMLElement;const pane=target.closest('.chat-pane')?'chat':target.closest('.reading-pane')?'reading':null;if(pane&&pane!==compactPane)setCompactPane(pane);}}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        try {
          const paths = Array.from(e.dataTransfer.files, (file) => desktop.getPathForFile?.(file) ?? "");
          if (!paths.length || paths.some((path) => !path)) throw new Error(tr('common:dropped_files_have_no_accessible_local_path'));
          void importDocument(paths);
        } catch (error) { report(error); }
      }}
    >
      <h1 className="sr-only">{tr("common:document_library")}</h1><header className="app-header">
        <div className="row">
          <button className="ghost" onClick={() => navigate("library")}>{tr("common:library")}</button>
          <button data-testid="import-document" aria-label={tr('common:import_document')} disabled={busy||!connected} onClick={()=>void importDocument()}><Plus size={16}/></button>
          <span className="muted workspace-title">
            {doc?.title ?? tr('common:your_workspace')}
          </span>
        </div>
        {chatControls}
        <div className="row">
          <span className={`connection-status ${connected && !isMock ? "motion-sr" : ""}`} data-testid="bridge-status">
            {isMock
              ? tr('common:preview_mock_bridge')
              : connected
                ? tr('common:workspace_connected')
                : tr('common:connecting')}
          </span>
          <button
            aria-label={tr('common:swap_chat_side')}
            title={tr('common:swap_chat_side')}
            onClick={() =>
              void saveSettings({
                ...settings,
                chatSide: settings.chatSide === "left" ? "right" : "left",
              })
            }
          >
            <ArrowLeftRight size={16} />
          </button>
          <button
            aria-label={tr('common:open_settings')}
            onClick={() => setShowSettings(true)}
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </header>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button
            aria-label={tr('common:dismiss_notification')}
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      <div className="workspace-tabs" role="tablist" aria-label={tr('common:your_workspace')}>
        <button role="tab" aria-selected={compactPane === 'reading'} onClick={() => setCompactPane('reading')}>{tr('common:document')}</button>
        <button role="tab" aria-selected={compactPane === 'chat'} onClick={() => setCompactPane('chat')}>{tr('common:chat')}</button>
      </div>
      <div className="workspace-body">
        <PanelGroup direction="horizontal" className="panels">
          {(settings.chatSide === "left"
            ? ["chat", "divider", "reading"]
            : ["reading", "divider", "chat"]
          ).map((pane, index) =>
            pane === "divider" ? (
              <PanelResizeHandle
                key="divider"
                className="resize-handle"
                aria-label={tr('common:resize_panes')}
              />
            ) : (
              <Panel
                key={pane}
                id={pane}
                order={index}
                minSize={25}
                defaultSize={pane === "chat" ? 42 : 58}
              >
                {pane === "chat" ? chat : reading}
              </Panel>
            ),
          )}
        </PanelGroup>
      </div>
      {showSettings && (
        <ProviderSettings
          initialTab={settingsTab}
          providers={providers}
          onClose={() => setShowSettings(false)}
          onRefresh={refreshProviders}
        />
      )}
    </main>
  );
}
