import { UsageSettings } from "./usage/settings";
import { useEffect, useRef, useState } from "react";
import { desktop } from "./bridge";
import type { IpcResponse, ProviderConfig } from "../shared";
export type Providers = IpcResponse<"providers:list">;
export const providerName: Record<ProviderConfig["id"], string> = {
  "openai-api": "OpenAI",
  "anthropic-api": "Anthropic",
  "openai-compatible": "OpenAI compatible",
  "codex-cli": "Codex CLI",
  "claude-cli": "Claude CLI",
  "agy-cli": "Antigravity CLI",
};
export function ProviderSettings({
  providers,
  onClose,
  onRefresh,
}: {
  providers: Providers;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [tab,setTab] = useState("providers");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-title">
        <h2>{tab === "usage" ? "Usage" : "Providers & API keys"}</h2>
        <button onClick={onClose} aria-label="Close settings">
          ×
        </button>
      </div>
      <div className="settings-tabs" role="tablist" aria-label="Settings"><button role="tab" aria-selected={tab === "providers"} onClick={() => setTab("providers")}>Providers</button><button role="tab" aria-selected={tab === "usage"} onClick={() => setTab("usage")}>Usage</button></div>
      {tab === "usage" ? <UsageSettings /> : <>
      <p className="muted">
        Keys are saved securely in the desktop app and never read back.
      </p>
      {providers.map((provider) => (
        <ProviderRow
          key={provider.config.id}
          provider={provider}
          onRefresh={onRefresh}
        />
      ))}
      </>}
    </dialog>
  );
}
function ProviderRow({
  provider,
  onRefresh,
}: {
  provider: Providers[number];
  onRefresh: () => Promise<void>;
}) {
  const [hasKey, setHasKey] = useState(false),
    [key, setKey] = useState(""),
    [baseUrl, setBaseUrl] = useState(
      provider.config.kind === "compatible" ? provider.config.baseUrl : "",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (provider.config.kind !== "cli")
      void desktop
        .invoke("secrets:has", { providerId: provider.config.id })
        .then((value) => setHasKey(value.hasKey))
        .catch(() => setError("Could not check key status"));
  }, [provider.config.id, provider.config.kind]);
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save provider");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="provider-row">
      <div className="row">
        <strong>{providerName[provider.config.id]}</strong>
        <span className="muted">
          {provider.config.kind === "cli"
            ? provider.availability.available
              ? "Detected"
              : provider.availability.reason
            : hasKey
              ? "Key saved"
              : "No key saved"}
        </span>
      </div>
      {provider.config.kind !== "cli" && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await desktop.invoke("secrets:set", {
                  providerId: provider.config.id,
                  key,
                });
                setKey("");
                setHasKey(true);
              });
            }}
          >
            <input
              aria-label={`${providerName[provider.config.id]} API key`}
              type="password"
              autoComplete="off"
              placeholder="Enter API key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button disabled={busy || !key.trim()}>Save key</button>
            {hasKey && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await desktop.invoke("secrets:delete", {
                      providerId: provider.config.id,
                    });
                    setHasKey(false);
                  })
                }
              >
                Remove
              </button>
            )}
          </form>
          {provider.config.kind === "compatible" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform(() =>
                  desktop.invoke("providers:configure", {
                    kind: "compatible",
                    id: "openai-compatible",
                    enabled: true,
                    baseUrl,
                  }),
                );
              }}
            >
              <input
                type="url"
                required
                aria-label="OpenAI compatible base URL"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
              <button disabled={busy}>Save URL</button>
            </form>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
