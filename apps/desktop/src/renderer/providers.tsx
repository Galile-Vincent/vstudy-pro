import { useOptionalNavigation } from "./shell";
import { PrivacySettings } from "./privacy-settings";
import { Onboarding } from './onboarding/onboarding';
import { errorText } from "./status";
import { useTranslation } from "react-i18next";
import { LanguageSettings } from './language-settings';
import { tr } from '../shared/i18n';
import { UsageSettings } from "./usage/settings";
import { useEffect, useRef, useState } from "react";
import { desktop } from "./bridge";
import type { IpcResponse, ProviderConfig } from "../shared";
export type Providers = IpcResponse<"providers:list">;
export const providerName: Record<ProviderConfig["id"], string> = {
  "openai-api": "OpenAI",
  "anthropic-api": "Anthropic",
  get "openai-compatible"() { return tr('common:openai_compatible'); },
  "codex-cli": "Codex CLI",
  "claude-cli": "Claude CLI",
  "agy-cli": "Antigravity CLI",
};
export function ProviderSettings({
  providers,
  onClose,
  onRefresh,
  initialTab = "providers",
}: {
  providers: Providers;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  initialTab?: string;
}) {
  useTranslation();
  const navigation = useOptionalNavigation();
  const [guide, setGuide] = useState(false);
  const [structuredTables, setStructuredTables] = useState(false);
  const [featureError,setFeatureError] = useState('');
  const [tab,setTab] = useState(initialTab);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    void desktop.invoke('settings:get',{}).then(s => setStructuredTables(s.enableGenerativeUI)).catch(() => {});
    return () => { if (previous?.isConnected) previous.focus(); else document.getElementById('shell-content')?.focus(); };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={tr("common:settings")}
      className={`settings-dialog ${tab === "usage" ? "usage-dashboard-dialog" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-title">
        <h2>{tab === "privacy" ? tr("settings:privacy") : tab === "usage" ? tr("common:usage") : tr("common:providers_api_keys")}</h2>
        <button onClick={onClose} aria-label={tr('common:close_settings')}>
          ×
        </button>
      </div>
      <LanguageSettings />
      <button onClick={() => setGuide(true)}>{tr("onboarding:replay")}</button>
      <button id="welcome-settings-entry" onClick={() => { navigation?.navigate("welcome"); onClose(); }}>{tr("welcome:entry")}</button>
      {guide && <Onboarding onComplete={() => setGuide(false)}/>}
      <div className="settings-tabs" role="tablist" aria-label={tr('common:settings')}><button role="tab" aria-selected={tab === "providers"} onClick={() => setTab("providers")}>{tr('common:providers')}</button><button role="tab" aria-selected={tab === "usage"} onClick={() => setTab("usage")}>{tr('common:usage')}</button><button role="tab" aria-selected={tab === "privacy"} onClick={() => setTab("privacy")}>{tr("settings:privacy")}</button></div>
      {tab === "privacy" ? <PrivacySettings /> : tab === "usage" ? <UsageSettings /> : <>
      <p className="muted">
        {tr('common:keys_are_saved_securely_in_the_desktop_app_and_never_read_back')}</p>
      <label className="generative-setting"><input type="checkbox" checked={structuredTables} onChange={e => { const enabled=e.target.checked; setStructuredTables(enabled); void desktop.invoke('settings:get',{}).then(s => desktop.invoke('settings:set',{...s,enableGenerativeUI:enabled})).catch(() => {setStructuredTables(!enabled);setFeatureError(tr('common:could_not_save_structured_table_setting'));}); }} />{tr('common:read_only_structured_tables_api_providers_only')}</label>
      <p className="muted">{tr('common:optional_table_presentations_off_by_default_cli_tools_remain_disabled')}</p>
      {featureError && <p role="alert">{featureError}</p>}
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
export function ProviderRow({
  provider,
  onRefresh,
}: {
  provider: Providers[number];
  onRefresh: () => Promise<void>;
}) {
  useTranslation();
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
        .catch(() => setError(tr('common:could_not_check_key_status')));
  }, [provider.config.id, provider.config.kind]);
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await onRefresh();
    } catch (e) {
      setError(errorText(e));
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
              ? tr('common:detected')
              : tr('errors:provider_unavailable')
            : hasKey
              ? tr('common:key_saved')
              : tr('common:no_key_saved')}
        </span>
      </div>
      {provider.config.kind === "cli" && <>
        <label><input type="checkbox" checked={provider.config.enabled} disabled={busy} onChange={e => { const enabled=e.target.checked; void perform(() => desktop.invoke('providers:configure',{...provider.config,enabled})); }} />{tr('settings:enable_cli',{provider:providerName[provider.config.id]})}</label>
        <p>{tr(provider.config.enabled ? 'settings:enabled' : 'settings:disabled')}</p>
        <p>{tr('settings:binary_path')}: <code>{provider.resolvedPath ?? tr('settings:not_found')}</code></p>
        <button disabled={busy} onClick={() => void perform(() => desktop.invoke('providers:chooseExecutable',{binary:provider.config.id === 'claude-cli' ? 'claude' : provider.config.id === 'codex-cli' ? 'codex' : 'agy'}))}>{tr('settings:change')}</button>
      </>}
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
              aria-label={tr('settings:api_key',{provider:providerName[provider.config.id]})}
              type="password"
              autoComplete="off"
              placeholder={tr('common:enter_api_key')}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button disabled={busy || !key.trim()}>{tr('common:save_key')}</button>
            <button type="button" disabled={busy || !key.trim()} onClick={() => void perform(async () => { await desktop.invoke('secrets:session',{providerId:provider.config.id,key}); setKey(''); })}>{tr('settings:session_key')}</button>
            {hasKey && <button type="button" disabled={busy} onClick={() => void perform(() => desktop.invoke('secrets:unlock',{providerId:provider.config.id}))}>{tr('settings:unlock')}</button>}
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
                {tr('common:remove')}</button>
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
                aria-label={tr('common:openai_compatible_base_url')}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
              <button disabled={busy}>{tr('common:save_url')}</button>
            </form>
          )}
        </>
      )}
      {busy && provider.config.kind !== "cli" && <p role="status">{tr("settings:waiting")}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
