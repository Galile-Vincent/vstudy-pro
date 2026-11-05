import { Check } from 'lucide-react';
import { Checkbox } from './components/checkbox';
import { Switch } from './components/ui/switch';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '../shared/i18n';
import { desktop } from './bridge';
import { errorText } from './status';
import { providerName, type Providers } from './provider-metadata';

export function ProviderRow({
  provider,
  onRefresh,
  settingsView = false,
}: {
  provider: Providers[number];
  settingsView?: boolean;
  onRefresh: () => Promise<void>;
}) {
  useTranslation();
  const [hasKey, setHasKey] = useState(false);
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(
    provider.config.kind === 'compatible' ? provider.config.baseUrl : '',
  );
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (provider.config.kind !== 'cli') {
      void desktop
        .invoke('secrets:has', { providerId: provider.config.id })
        .then((value) => setHasKey(value.hasKey))
        .catch(() => setError(tr('common:could_not_check_key_status')));
    }
  }, [provider.config.id, provider.config.kind]);

  const [waitingKeychain, setWaitingKeychain] = useState(false);
  const perform = async (action: () => Promise<unknown>, waitForKeychain = false) => {
    setBusy(true);
    setWaitingKeychain(waitForKeychain);
    setError('');
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

  const isCli = provider.config.kind === 'cli';
  const isEnabled = provider.config.enabled;
  const isAvailable = provider.availability.available;
  const isReady = isCli ? (isEnabled && isAvailable) : hasKey;
  const isError = isCli ? (isEnabled && !isAvailable) : Boolean(error);
  const statusTone = isReady ? 'ready' : isError ? 'error' : 'idle';
  const statusText = isCli
    ? !isEnabled
      ? tr(provider.resolvedPath ? 'settings:found' : 'settings:not_found')
      : isAvailable
      ? tr('common:detected')
      : tr('errors:provider_unavailable')
    : hasKey
      ? tr('common:key_saved')
      : tr('common:no_key_saved');

  return (
    <section className={settingsView ? 'provider-row settings-row' : 'provider-row'} data-layout={settingsView ? 'stack' : undefined} aria-busy={busy}>
      {busy && !waitingKeychain && <p role="status">{tr('common:checking_provider')}</p>}
      <div className="row">
        <strong>{providerName[provider.config.id]}</strong>
        <span className="muted provider-status">
          <span className={`provider-status-dot ${statusTone}`} aria-hidden="true" />
          {hasKey && !isCli && <Check size={14} aria-hidden="true" />}
          <span>{statusText}</span>
        </span>
      </div>
      {isCli && (
        <>
          <p className="muted">{tr('settings:cli_help', { command: provider.config.id === 'claude-cli' ? 'claude' : provider.config.id === 'codex-cli' ? 'codex login' : 'agy' })}</p>
          <Button disabled={busy} onClick={() => void perform(() => desktop.invoke('providers:list', { discover: true }))}>{tr('settings:detect_again')}</Button>
          <label className="provider-cli-label">
            {settingsView ? (
              <Switch
                aria-label={tr('settings:enable_cli', { provider: providerName[provider.config.id] })}
                checked={provider.config.enabled}
                disabled={busy}
                onCheckedChange={(enabled) => {
                  void perform(() => desktop.invoke('providers:configure', { ...provider.config, enabled }));
                }}
              />
            ) : (
              <Checkbox
                checked={provider.config.enabled}
                disabled={busy}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  void perform(() => desktop.invoke('providers:configure', { ...provider.config, enabled }));
                }}
              />
            )}
            <span>{tr('settings:enable_cli', { provider: providerName[provider.config.id] })}</span>
          </label>
          <p className="muted">{tr(provider.config.enabled ? 'settings:enabled' : 'settings:disabled')}</p>
          <p className="muted">
            {tr('settings:binary_path')}:{' '}
            <code title={provider.resolvedPath ?? tr('settings:not_found')}>
              {provider.resolvedPath ?? tr('settings:not_found')}
            </code>
          </p>
          <Button
            variant={settingsView ? 'secondary' : 'outline'}
            size={settingsView ? 'sm' : 'default'}
            disabled={busy}
            onClick={() =>
              void perform(() =>
                desktop.invoke('providers:chooseExecutable', {
                  binary:
                    provider.config.id === 'claude-cli'
                      ? 'claude'
                      : provider.config.id === 'codex-cli'
                      ? 'codex'
                      : 'agy',
                }),
              )
            }
          >
            {tr('settings:change')}
          </Button>
        </>
      )}
      {!isCli && (
        <>
          <Button variant="link" onClick={() => void perform(() => desktop.invoke('shell:openExternal', { url: provider.config.id === 'anthropic-api' ? 'https://platform.claude.com/settings/keys' : provider.config.id === 'openai-api' ? 'https://platform.openai.com/api-keys' : new URL(baseUrl).origin }))}>{tr('settings:get_key')}</Button>
          <Button disabled={busy} onClick={() => void perform(async () => {
            const id = provider.config.id;
            if (id !== 'anthropic-api' && id !== 'openai-api' && id !== 'openai-compatible') return;
            setTestResult('');
            const result = await desktop.invoke('providers:test', { providerId: id });
            setTestResult(tr(result === 'success' ? 'settings:connection_success' : `errors:connection_${result}`));
          })}>{tr('settings:test_connection')}</Button>
          {testResult && <p role="status">{testResult}</p>}
          <p className="muted">{tr('settings:key_help')}</p>
          <p className="muted">{tr('settings:keychain_help')}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await desktop.invoke('secrets:set', {
                  providerId: provider.config.id,
                  key,
                });
                setKey('');
                setHasKey(true);
              }, true);
            }}
          >
            <Input
              aria-label={tr('settings:api_key', { provider: providerName[provider.config.id] })}
              type="password"
              autoComplete="off"
              placeholder={tr('common:enter_api_key')}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <Button variant="default" size="sm" disabled={busy || !key.trim()}>
              {tr(error && key.trim() ? 'settings:retry' : 'common:save_key')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={busy || !key.trim()}
              onClick={() =>
                void perform(async () => {
                  await desktop.invoke('secrets:session', { providerId: provider.config.id, key });
                  setKey('');
                })
              }
            >
              {tr('settings:session_key')}
            </Button>
            {hasKey && (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={busy}
                onClick={() =>
                  void perform(() => desktop.invoke('secrets:unlock', { providerId: provider.config.id }), true)
                }
              >
                {tr(error && !key.trim() ? 'settings:retry' : 'settings:unlock')}
              </Button>
            )}
            {hasKey && (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await desktop.invoke('secrets:delete', {
                      providerId: provider.config.id,
                    });
                    setHasKey(false);
                  })
                }
              >
                {tr('common:remove')}
              </Button>
            )}
          </form>
          {provider.config.kind === 'compatible' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform(() =>
                  desktop.invoke('providers:configure', {
                    kind: 'compatible',
                    id: 'openai-compatible',
                    enabled: true,
                    baseUrl,
                  }),
                );
              }}
            >
              <Input
                type="url"
                required
                aria-label={tr('common:openai_compatible_base_url')}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
              <Button variant="secondary" size="sm" disabled={busy}>
                {tr('common:save_url')}
              </Button>
            </form>
          )}
        </>
      )}
      {waitingKeychain && <p role="status">{tr('settings:waiting')}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
