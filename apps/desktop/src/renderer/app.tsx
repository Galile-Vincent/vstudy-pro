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
import { Chat, ModelPicker } from "./chat";
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
  const doc = documents.find((d) => d.id === documentId);
  const report = useCallback(
    (error: unknown) =>
      setNotice(
        error instanceof Error ? error.message : "Something went wrong",
      ),
    [],
  );
  const refreshProviders = useCallback(async () => {
    setProviders(await desktop.invoke("providers:list", {}));
  }, []);
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
        setDocumentId(d[0]?.id ?? null);
        const saved = p.find(
          (item) =>
            item.config.id === s.lastProviderId &&
            item.availability.available &&
            item.models.some((m) => m.id === s.lastModelId),
        );
        const first = p.find(
          (item) =>
            item.config.enabled &&
            item.availability.available &&
            item.models.length,
        );
        setModel(
          saved
            ? `${saved.config.id}/${s.lastModelId}`
            : first
              ? `${first.config.id}/${first.models[0]!.id}`
              : "",
        );
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
    if (
      conversation &&
      (conversation.providerId !== providerId ||
        conversation.modelId !== modelId)
    ) {
      setConversation(null);
      setHistory(null);
    }
  };
  const importing = useRef(false);
  const importDocument = async (paths?: string[]) => {
    if (importing.current) return;
    importing.current = true;
    setBusy(true);
    try {
      const imported = paths
        ? (await desktop.invoke("documents:importPaths", { paths }))[0]
        : await desktop.invoke("documents:import", {});
      if (imported) {
        setDocuments(await desktop.invoke("documents:list", {}));
        setDocumentId(imported.id);
      }
    } catch (error) {
      report(error);
    } finally {
      importing.current = false;
      setBusy(false);
    }
  };
  const newConversation = async () => {
    if (!doc || !model) return;
    setBusy(true);
    try {
      const slash = model.indexOf("/");
      const created = await desktop.invoke("conversations:create", {
        documentId: doc.id,
        providerId: model.slice(0, slash) as ProviderConfig["id"],
        modelId: model.slice(slash + 1),
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
          conversation={conversation}
          history={history}
          selection={selection}
          onClearSelection={() => setSelection(null)}
          providers={providers}
          model={model}
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
              <span>{selection.text}</span>
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
        <span className="muted">
          {doc?.status === "ready" ? "Markdown" : ""}
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
            Drop a file anywhere to choose it for import
          </small>
        </div>
      ) : doc.status === "converting" ? (
        <div className="empty" role="status">
          <div className="spinner" />
          <h3>Preparing your document</h3>
          <p>Converting {doc.sourceName} to Markdown…</p>
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
            if (!conversation && canChat && !busy) void newConversation();
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
