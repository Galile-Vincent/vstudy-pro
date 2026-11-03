import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { Settings } from "../shared";
import "./style.css";

function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    window.desktop
      .invoke("settings:get", {})
      .then((value) => {
        if (active) setSettings(value);
      })
      .catch(() => {
        if (active) setError("Could not load settings");
      });
    return () => {
      active = false;
    };
  }, []);
  const chat = (
    <section className="pane" aria-label="Chat">
      <h2>Chat</h2>
      <div className="placeholder">
        <h3>A place to think together</h3>
        <p>Conversations grounded in your documents will appear here.</p>
      </div>
      <div className="composer">Ask about your document…</div>
    </section>
  );
  const document = (
    <section className="pane" aria-label="Document">
      <h2>Document</h2>
      <div className="placeholder">
        <h3>Your reading space</h3>
        <p>Import a document to begin reading and exploring.</p>
      </div>
    </section>
  );
  return (
    <main className="h-screen flex flex-col">
      <header className="flex items-center justify-between border-b px-5 py-3">
        <h1 className="font-semibold tracking-tight">VStudy Pro</h1>
        <span className="text-xs opacity-60" data-testid="bridge-status">
          {error ?? (settings ? "Workspace connected" : "Connecting…")}
        </span>
      </header>
      <PanelGroup direction="horizontal" className="flex-1">
        <Panel minSize={25} defaultSize={42}>
          {settings?.chatSide === "right" ? document : chat}
        </Panel>
        <PanelResizeHandle
          className="resize-handle"
          aria-label="Resize panes"
        />
        <Panel minSize={25}>
          {settings?.chatSide === "right" ? chat : document}
        </Panel>
      </PanelGroup>
    </main>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
