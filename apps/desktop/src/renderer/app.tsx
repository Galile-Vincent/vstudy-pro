import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type {
  Conversation,
  Document,
  Message,
  Selection,
  Settings,
  ProviderConfig,
} from "../shared";
import { defaultSettings } from "../shared";
import { desktop, isMock } from "./bridge";
import { resolveModel } from "./model";
import { Chat, ModelPicker, SelectionPreview } from "./chat";
import { DocumentMarkdown } from "./markdown";
import { ProviderSettings, type Providers } from "./providers";

export function App() {
  const [settings, setSettings] = useState<Settings>(defaultSettings),
    [connected, setConnected] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]),
    [documentId, setDocumentId] = useState<Document["id"] | null>(null),
    [source, setSource] = useState("");
  const [providers, setProviders] = useState<Providers>([]),
    [model, setModel] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]),
    [conversation, setConversation] = useState<Conversation | null>(null),
    [history, setHistory] = useState<Message[] | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null),
    [library, setLibrary] = useState(true),
    [showSettings, setShowSettings] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loadingSource, setLoadingSource] = useState(false);
  const [draft, setDraft] = useState("");
  const activeConversation = useRef(conversation);
  activeConversation.current = conversation;
  const [progress, setProgress] = useState<Record<string, string>>({});
  useEffect(() => desktop.onDocumentProgress?.(event => setProgress(current => ({ ...current, [event.documentId]: event.message }))), []);
  const doc = documents.find((d) => d.id === documentId);
  const report = useCallback(
    (error: unknown) =>
      setNotice(
        error instanceof Error ? error.message : "Something went wrong",
      ),
    [],
  );
  const refreshProviders = useCallback(async () => {
    const list = await desktop.invoke("providers:list", {});
    setProviders(list);
    if (!activeConversation.current) setModel(current => resolveModel(current, list));
  }, []);
  useEffect(() => { const timer = setInterval(() => { void refreshProviders().catch(report); }, 2000); return () => clearInterval(timer); }, [refreshProviders, report]);
  useEffect(() => {
    let active = true;
    void Promise.all([
      desktop.invoke("settings:get", {}),
      desktop.invoke("documents:list", {}),
      desktop.invoke("providers:list", {}),
    ])
      .then(([s, d, p]) => {
        if (!active) return;
        setSettings(s);
        setDocuments(d);
        setProviders(p);
        setConnected(true);
        setDocumentId(d.find(item => item.id === s.lastDocumentId)?.id ?? d[0]?.id ?? null);
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
          setConversation(list[0] ?? null);
          if (list[0]) setModel(`${list[0].providerId}/${list[0].modelId}`);
        }
      })
      .catch(report);
    return () => {
      active = false;
    };
  }, [documentId, report]);
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
      const saved = await desktop.invoke("settings:set", next);
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
    if (conversation && `${conversation.providerId}/${conversation.modelId}` !== value) void newConversation(value);

  };
  const importing = useRef(false);
  const importDocument = async (paths?: string[]) => {
    if (importing.current) return;
    importing.current = true;
    setBusy(true);
    try {
      const results = paths ? await desktop.invoke("documents:importPaths", { paths }) : null;
      const imported = results ? results.find(r => r.ok)?.document : await desktop.invoke("documents:import", {});
      if (results) setNotice(results.filter(r => !r.ok).map(r => `${r.path}: ${r.error}`).join("\n"));
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
    if (selection && !conversation && canChat && !busy) void newConversation();
  }, [selection, conversation, canChat, busy]);
  const chat = (
    <section className="pane chat-pane" aria-label="Chat">
      <div className="pane-toolbar">
        <span className="eyebrow">Conversation</span>
        <div className="row">
          <select
            aria-label="Conversation"
            value={conversation?.id ?? ""}
            onChange={(e) => {
              const c =
                conversations.find((item) => item.id === e.target.value) ??
                null;
              setConversation(c);
              if (c) setModel(`${c.providerId}/${c.modelId}`);
            }}
          >
            <option value="">Choose conversation</option>
            {conversations.map((c, index) => (
              <option key={c.id} value={c.id}>
                Chat {conversations.length - index} · {c.modelId}
              </option>
            ))}
          </select>
          {conversation && <button className="icon-button" title="Delete conversation" aria-label="Delete conversation" onClick={() => {
            if (!window.confirm("Delete this conversation?")) return;
            void desktop.invoke("conversations:delete", { conversationId: conversation.id }).then(() => {
              setConversations(list => list.filter(c => c.id !== conversation.id)); setConversation(null); setHistory(null);
            }).catch(report);
          }}>⌫</button>}
          <button
            disabled={!canChat || busy}
            onClick={() => void newConversation()}
            aria-label="New chat"
          >
            ＋
          </button>
        </div>
      </div>
      {conversation && history ? (
        <Chat
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
          onSettings={() => setShowSettings(true)}
          onProvidersChanged={refreshProviders}
        />
      ) : (
        <div className="chat-start">
          <div className="empty">
            <div className="empty-symbol">✦</div>
            <h3>A place to think together</h3>
            <p>
              {doc
                ? "Start a conversation to explore this document."
                : "Import a document, then follow your curiosity."}
            </p>
            <button
              className="primary"
              disabled={!canChat || busy}
              onClick={() => void newConversation()}
            >
              Start a conversation
            </button>
          </div>
          {selection && (
            <div className="selection-chip">
              <SelectionPreview selection={selection} />
              <button
                onClick={() => setSelection(null)}
                aria-label="Remove selection"
              >
                ×
              </button>
            </div>
          )}
          <ModelPicker
            providers={providers}
            model={model}
            onModel={chooseModel}
            onSettings={() => setShowSettings(true)}
            onProvidersChanged={refreshProviders}
          />
        </div>
      )}
    </section>
  );
  const reading = (
    <section className="pane reading-pane" aria-label="Document">
      <div className="pane-toolbar">
        <span className="eyebrow">{doc?.sourceName ?? "Reading space"}</span>
        {doc && <button className="icon-button" title="Delete document" aria-label="Delete document" onClick={() => {
          if (!window.confirm(`Delete ${doc.title} and its conversations?`)) return;
          void desktop.invoke("documents:delete", { documentId: doc.id }).then(async () => {
            const list = await desktop.invoke("documents:list", {}); setDocuments(list); setDocumentId(list[0]?.id ?? null);
          }).catch(report);
        }}>⌫</button>}
        <span className="muted">
          {doc?.status === "ready" ? `Markdown · ${doc.converter}` : ""}
        </span>
      </div>
      {!doc ? (
        <div className="empty">
          <div className="empty-symbol">▤</div>
          <h3>Your next idea starts here</h3>
          <p>Import a document to read, select, and ask questions.</p>
          <button onClick={() => void importDocument()} disabled={busy}>
            Import document
          </button>
          <small className="muted">
            Drop a file anywhere to import it
          </small>
        </div>
      ) : doc.status === "converting" ? (
        <div className="empty" role="status">
          <div className="spinner" />
          <h3>Preparing your document</h3>
          <p>{progress[doc.id] ?? "Converting…"} {doc.sourceName} to Markdown…</p>
        </div>
      ) : doc.status === "failed" ? (
        <div className="empty" role="alert">
          <h3>Couldn’t prepare this document</h3>
          <p>{doc.error}</p>
          <button
            disabled={busy}
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
            Retry conversion
          </button>
        </div>
      ) : loadingSource ? (
        <div className="empty" role="status">
          Loading document…
        </div>
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
      className="workspace"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        try {
          const paths = Array.from(e.dataTransfer.files, (file) => desktop.getPathForFile?.(file) ?? "");
          if (!paths.length || paths.some((path) => !path)) throw new Error("Dropped files have no accessible local path");
          void importDocument(paths);
        } catch (error) { report(error); }
      }}
    >
      <header className="app-header">
        <div className="row">
          <button
            aria-label="Toggle document library"
            aria-expanded={library}
            onClick={() => setLibrary(!library)}
          >
            ☰
          </button>
          <h1>
            VStudy <span>Pro</span>
          </h1>
          <span className="header-divider" />
          <span className="muted workspace-title">
            {doc?.title ?? "Your workspace"}
          </span>
        </div>
        <div className="row">
          <span className="connection-status" data-testid="bridge-status">
            {isMock
              ? "Preview · mock bridge"
              : connected
                ? "Workspace connected"
                : "Connecting…"}
          </span>
          <button
            aria-label="Swap chat side"
            title="Swap chat side"
            onClick={() =>
              void saveSettings({
                ...settings,
                chatSide: settings.chatSide === "left" ? "right" : "left",
              })
            }
          >
            ⇄
          </button>
          <button
            aria-label="Open settings"
            onClick={() => setShowSettings(true)}
          >
            ⚙
          </button>
        </div>
      </header>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      <div className="workspace-body">
        {library && (
          <aside className="library" aria-label="Document library">
            <div className="library-heading">
              <span className="eyebrow">Library</span>
              <span className="muted">{documents.length}</span>
            </div>
            <button
              className="import-button"
              disabled={busy}
              onClick={() => void importDocument()}
            >
              ＋ Import document
            </button>
            <div className="document-list">
              {documents.length ? (
                documents.map((d) => (
                  <button
                    className={`document-item ${d.id === documentId ? "active" : ""}`}
                    key={d.id}
                    onClick={() => setDocumentId(d.id)}
                  >
                    <span>▤</span>
                    <span>
                      <strong>{d.title}</strong>
                      <small>
                        {d.status === "ready" ? d.sourceName : d.status}
                      </small>
                    </span>
                  </button>
                ))
              ) : (
                <p className="library-empty">
                  Keep your reading in one place.
                  <br />
                  Import a file to begin.
                </p>
              )}
            </div>
            <div className="library-footer">Documents stay on this Mac</div>
          </aside>
        )}
        <PanelGroup direction="horizontal" className="panels">
          {(settings.chatSide === "left"
            ? ["chat", "divider", "reading"]
            : ["reading", "divider", "chat"]
          ).map((pane, index) =>
            pane === "divider" ? (
              <PanelResizeHandle
                key="divider"
                className="resize-handle"
                aria-label="Resize panes"
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
          providers={providers}
          onClose={() => setShowSettings(false)}
          onRefresh={refreshProviders}
        />
      )}
    </main>
  );
}
