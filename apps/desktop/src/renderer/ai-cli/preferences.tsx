/** Explicit opt-ins for network update checks, idle updates, and the separate advanced shell capability. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CliPreferences } from '../../shared/ai-cli';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import { SettingsGroup } from '../settings/layout';
import { aiCliChanged } from './entry';
import './setup.css';

export function CliPrivacyPreferences() {
  useTranslation();
  const [preferences, setPreferences] = useState<CliPreferences>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [checked, setChecked] = useState(false);
  const load = () => desktop.invoke('ai-cli:preferences', {}).then(value => { setPreferences(value); setError(false); }).catch(() => setError(true));
  useEffect(() => { void load(); }, []);
  const save = async (key: keyof CliPreferences, enabled: boolean) => {
    if (!preferences) return;
    setBusy(true); setError(false);
    try { setPreferences(await desktop.invoke('ai-cli:setPreferences', { ...preferences, [key]: enabled, ...(key === 'updateChecks' && !enabled ? { autoUpdateWhenIdle: false } : {}) })); aiCliChanged(); }
    catch { setError(true); }
    finally { setBusy(false); }
  };
  const check = async () => {
    setBusy(true); setError(false); setChecked(false);
    try { await desktop.invoke('ai-cli:checkUpdates', {}); setChecked(true); aiCliChanged(); }
    catch { setError(true); }
    finally { setBusy(false); }
  };
  return <SettingsGroup title={tr('ai-cli:privacy_title')}>
    <div className="ai-cli-preferences"><p>{tr('ai-cli:inventory')}</p>
      {preferences && <>{(['updateChecks', 'autoUpdateWhenIdle', 'advancedShell'] as const).map(key => <label className="ai-cli-consent" key={key}><input type="checkbox" checked={preferences[key]} disabled={busy || key === 'autoUpdateWhenIdle' && !preferences.updateChecks} onChange={event => void save(key, event.target.checked)} /><span>{tr(`ai-cli:pref_${key}`)}<small>{tr(`ai-cli:pref_${key}_help`)}</small></span></label>)}
      <Button variant="secondary" disabled={busy} onClick={() => void check()}>{tr('ai-cli:check_now')}</Button></>}
      {busy && <p role="status">{tr('ai-cli:checking')}</p>}{checked && <p role="status">{tr('ai-cli:checked')}</p>}
      {error && <div role="alert"><p>{tr('ai-cli:preferences_error')}</p>{!preferences && <Button variant="secondary" onClick={() => void load()}>{tr('ai-cli:retry')}</Button>}</div>}
    </div>
  </SettingsGroup>;
}

export function AdvancedShell({ busy, onPreview }: { busy: boolean; onPreview: () => void }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const load = () => { void desktop.invoke('ai-cli:preferences', {}).then(value => setEnabled(value.advancedShell)).catch(() => setEnabled(false)); };
    load(); window.addEventListener('vstudy:ai-cli-changed', load);
    return () => window.removeEventListener('vstudy:ai-cli-changed', load);
  }, []);
  return <details className="ai-cli-help"><summary>{tr('ai-cli:advanced_title')}</summary><p>{tr('ai-cli:pref_advancedShell_help')}</p><p>{tr('ai-cli:advanced_warning')}</p><Button variant="secondary" disabled={!enabled || busy} onClick={onPreview}>{tr('ai-cli:advanced_preview')}</Button>{!enabled && <p>{tr('ai-cli:advanced_enable')}</p>}</details>;
}
