import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '../shared/i18n';
import { desktop } from './bridge';
import { errorText } from './status';
import { providerName, type Providers } from './provider-metadata';
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
  const [waitingKeychain,setWaitingKeychain] = useState(false);
  const perform = async (action: () => Promise<unknown>, waitForKeychain = false) => {
    setBusy(true);
    setWaitingKeychain(waitForKeychain);
    setError("");
    try {
      await action();
      await onRefresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setWaitingKeychain(false);
      setBusy(false);
    }
  };
  return (
    <section className="provider-row">
      <div className="row">
        <strong>{providerName[provider.config.id]}</strong>
        <span className="muted">
          {provider.config.kind === "cli"
            ? !provider.config.enabled
              ? tr(provider.resolvedPath ? "settings:found" : "settings:not_found")
              : provider.availability.available
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
              }, true);
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
            <button disabled={busy || !key.trim()}>{tr(error && key.trim() ? 'settings:retry' : 'common:save_key')}</button>
            <button type="button" disabled={busy || !key.trim()} onClick={() => void perform(async () => { await desktop.invoke('secrets:session',{providerId:provider.config.id,key}); setKey(''); })}>{tr('settings:session_key')}</button>
            {hasKey && <button type="button" disabled={busy} onClick={() => void perform(() => desktop.invoke('secrets:unlock',{providerId:provider.config.id}), true)}>{tr(error && !key.trim() ? 'settings:retry' : 'settings:unlock')}</button>}
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
      {waitingKeychain && <p role="status">{tr("settings:waiting")}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
