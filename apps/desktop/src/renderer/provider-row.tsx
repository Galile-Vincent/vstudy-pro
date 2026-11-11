import { openAiCliSetup } from './ai-cli/entry';
import { Check } from 'lucide-react';
import { Button, Dialog, DialogHeader, Switch, TextInput } from '@astryxdesign/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '../shared/i18n';
import { desktop } from './bridge';
import { errorText } from './status';
import { providerName, type Providers } from './provider-metadata';
import { desktopPlatform, supportsIsolatedCodex } from '../shared/platform';

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
  const [removing,setRemoving] = useState(false);
  const [removeError,setRemoveError] = useState('');
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
  const unsupportedCli = provider.config.id === 'codex-cli' && !supportsIsolatedCodex(desktopPlatform());
  const isEnabled = provider.config.enabled;
  const isAvailable = provider.availability.available;
  const isReady = isCli ? (isEnabled && isAvailable) : hasKey || (isEnabled && isAvailable);
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
      : isEnabled && isAvailable
      ? tr('settings:session_ready')
      : tr('common:no_key_saved');

  return (
    <section className="provider-row" aria-busy={busy}>
      {busy && !waitingKeychain && <p role="status">{tr('common:checking_provider')}</p>}
      <div className="provider-heading"><div><span className="provider-name">{providerName[provider.config.id]}</span>
          <span className="muted provider-status">
            <span className={`provider-status-dot ${statusTone}`} aria-hidden="true" />
            {hasKey && !isCli && <Check size={14} aria-hidden="true" />}
            <span>{statusText}</span>
          </span>
        </div><span className="provider-actions">
          {isCli ? (
            <>
              <Button label={tr('settings:provider_action',{action:tr('ai-cli:wizard'),name:providerName[provider.config.id]})} variant="secondary" size="sm" isDisabled={busy || unsupportedCli} onClick={() => openAiCliSetup(provider.config.id === 'claude-cli' ? 'claude' : provider.config.id === 'codex-cli' ? 'codex' : 'agy')}>{tr('ai-cli:wizard')}</Button>
              <Button label={tr('settings:provider_action',{action:tr('settings:detect_again'),name:providerName[provider.config.id]})} variant="secondary" size="sm" isDisabled={busy || unsupportedCli} onClick={() => void perform(() => desktop.invoke('providers:list', { discover: true }))}>{tr('settings:detect_again')}</Button>
            </>
          ) : (
            <>
              <Button label={tr('settings:provider_action',{action:tr('settings:get_key'),name:providerName[provider.config.id]})} variant="ghost" size="sm" isDisabled={busy} onClick={() => void perform(() => desktop.invoke('shell:openExternal', { url: provider.config.id === 'anthropic-api' ? 'https://platform.claude.com/settings/keys' : provider.config.id === 'openai-api' ? 'https://platform.openai.com/api-keys' : new URL(baseUrl).origin }))}>{tr('settings:get_key')}</Button>
              <Button label={tr('settings:provider_action',{action:tr('settings:test_connection'),name:providerName[provider.config.id]})} variant="secondary" size="sm" isDisabled={busy} onClick={() => void perform(async () => {
                const id = provider.config.id;
                if (id !== 'anthropic-api' && id !== 'openai-api' && id !== 'openai-compatible') return;
                setTestResult('');
                const result = await desktop.invoke('providers:test', { providerId: id });
                setTestResult(tr(result === 'success' ? 'settings:connection_success' : `errors:connection_${result}`));
              })}>{tr('settings:test_connection')}</Button>
            </>
          )}
        </span></div>
      {isCli && (
        <>
          {unsupportedCli && <p role="note">{tr('distribution:codex_unavailable')}</p>}
          <p className="muted">{tr('ai-cli:row_help')}</p>
          <div className="provider-cli-label">
            <Switch
              label={tr('settings:enable_cli', { provider: providerName[provider.config.id] })}
              value={provider.config.enabled}
              isDisabled={busy || unsupportedCli}
              onChange={(enabled) => {
                void perform(() => desktop.invoke('providers:configure', { ...provider.config, enabled }));
              }}
            />
          </div>
          <p className="muted">{tr(provider.config.enabled ? 'settings:enabled' : 'settings:disabled')}</p>
          <p className="muted">
            {tr('settings:binary_path')}:{' '}
            <code title={provider.resolvedPath ?? tr('settings:not_found')}>
              {provider.resolvedPath ?? tr('settings:not_found')}
            </code>
          </p>
          <Button label={tr('settings:provider_action',{action:tr('settings:change'),name:providerName[provider.config.id]})}
            variant="secondary"
            size={settingsView ? 'sm' : 'md'}
            isDisabled={busy || unsupportedCli}
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
          {testResult && <p role="status">{testResult}</p>}
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
<TextInput
              label={tr('settings:api_key', { provider: providerName[provider.config.id] })}
              isLabelHidden
              size="sm"
              width="min(100%, 20rem)"
              type="password"
              autoComplete="off"
              placeholder={tr('common:enter_api_key')}
              value={key}
              onChange={setKey}
            />
            <Button label={tr('settings:provider_action',{action:tr(error && key.trim() ? 'settings:retry' : 'common:save_key'),name:providerName[provider.config.id]})} variant="secondary" size="sm" type="submit" isDisabled={busy || !key.trim()}>{tr(error && key.trim() ? 'settings:retry' : 'common:save_key')}</Button>
            <Button label={tr('settings:provider_action',{action:tr('settings:session_key'),name:providerName[provider.config.id]})} variant="ghost" size="sm" type="button" isDisabled={busy || !key.trim()} onClick={() =>
                void perform(async () => {
                  await desktop.invoke('secrets:session', { providerId: provider.config.id, key });
                  setKey('');
                })
              }>{tr('settings:session_key')}</Button>
            {hasKey && (
              <Button label={tr(error && !key.trim() ? 'settings:retry' : 'settings:unlock')} variant="ghost" size="sm" type="button" isDisabled={busy} onClick={() =>
                  void perform(() => desktop.invoke('secrets:unlock', { providerId: provider.config.id }), true)
                } />
            )}
            {hasKey && (
              <Button label={tr('settings:provider_action',{action:tr('common:remove'),name:providerName[provider.config.id]})} variant="ghost" size="sm" type="button" isDisabled={busy} onClick={() => {setRemoveError('');setRemoving(true);}}>{tr('common:remove')}</Button>
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
<TextInput
                label={tr('common:openai_compatible_base_url')}
                isLabelHidden
                size="sm"
              width="min(100%, 20rem)"
                type="url"
                isRequired
                value={baseUrl}
                onChange={setBaseUrl}
              />
              <Button label={tr('common:save_url')} variant="secondary" size="sm" type="submit" isDisabled={busy} />
            </form>
          )}
          <div className="provider-help">
            <p className="muted">{tr('settings:key_help')}</p>
            <p className="muted">{tr('settings:keychain_help')}</p>
          </div>
        </>
      )}
      <Dialog isOpen={removing} onOpenChange={value => {if (!busy) setRemoving(value);}} width={420} purpose="required">
        <DialogHeader title={tr('settings:remove_key_title',{name:providerName[provider.config.id]})} subtitle={tr('settings:remove_key_copy')} />
        <div className="dialog-body">
          {removeError && <p role="alert">{removeError}</p>}
          <div className="dialog-actions">
            <Button label={tr('common:cancel')} variant="secondary" isDisabled={busy} onClick={() => setRemoving(false)} />
            <Button label={tr('common:remove')} variant="destructive" isDisabled={busy} onClick={() => void perform(async () => {
              setRemoveError('');
              try {
                await desktop.invoke('secrets:delete',{providerId:provider.config.id});
                setHasKey(false);setRemoving(false);
              } catch (error) { setRemoveError(errorText(error)); }
            })} />
          </div>
        </div>
      </Dialog>
      {waitingKeychain && <p role="status">{tr('settings:waiting')}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
