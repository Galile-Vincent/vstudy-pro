import { Panel } from './components/panel';
import { SettingRow, Toolbar } from './components/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnalyticsState } from '../shared/analytics';
import type { IpcResponse } from '../shared';
import { WEBSITE_URL } from '../shared/website';
import { tr } from '../shared/i18n';
import { desktop } from './bridge';
import { Button, Switch } from '@astryxdesign/core';

import './analytics.css';
export function PolicyLinks() {
  useTranslation();
  const lang = document.documentElement.lang === 'ja' ? 'ja' : document.documentElement.lang.startsWith('zh') ? 'zh-Hant' : 'en';
  const [error, setError] = useState(false);
  return <nav className="analytics-links" aria-label={tr('analytics:policies')}>{(['privacy','terms'] as const).map(page => <a key={page} href={`${WEBSITE_URL}/${lang}/${page}`} onClick={event => { event.preventDefault(); void desktop.invoke('shell:openExternal', {url:event.currentTarget.href}).catch(() => setError(true)); }}>{tr(`analytics:${page}`)}</a>)}{error && <span role="alert">{tr('errors:generic')}</span>}</nav>;
}
export function AnalyticsDisclosure() {
  return <div className="analytics-disclosure"><p>{tr('analytics:intro')}</p><details><summary>{tr('analytics:details_toggle')}</summary><p>{tr('analytics:summary')}</p><p>{tr('analytics:excluded')}</p><p>{tr('analytics:pseudonymous')}</p></details><PolicyLinks/></div>;
}
export function ConsentChoice({ onChoose, busy = false }: { onChoose: (enabled: boolean) => void; busy?: boolean }) {
  return (
    <Toolbar
      center={[false, true].map(enabled => (
        <Button label={tr(enabled ? 'analytics:share' : 'analytics:decline')} variant="secondary" key={String(enabled)} className="flex-1 basis-44" isDisabled={busy} onClick={() => onChoose(enabled)} />
      ))}
    />
  );
}
export function ConsentSaved({ enabled, onOpenPrivacy, busy = false }: { enabled: boolean; onOpenPrivacy: () => void; busy?: boolean }) {
  return (
    <div className="grid gap-[var(--space-1)]">
      <Toolbar
        left={<strong>{tr('analytics:saved_state', { state: tr(enabled ? 'analytics:state_on' : 'analytics:state_off') })}</strong>}
        right={<Button label={tr('analytics:open_privacy')} variant="ghost" isDisabled={busy} onClick={onOpenPrivacy} />}
      />
      <p className="text-[var(--muted)]">{tr('analytics:saved_hint')}</p>
    </div>
  );
}
export async function completeAnalyticsOnboarding(enabled: boolean, input: import('../shared/analytics').Onboarding) {
  await desktop.invoke('analytics:setConsent', { enabled });
  await desktop.invoke('analytics:completeOnboarding', input);
  window.dispatchEvent(new Event('analytics-consent-changed'));
}
export function ExistingAnalyticsPrompt() {
  useTranslation();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => { void Promise.all([desktop.invoke('settings:get', {}), desktop.invoke('analytics:getState', {})]).then(([settings,state]) => { if (active) setVisible(!!settings.onboardingCompleted && !state.consent_decided); }).catch(() => {}); };
    refresh();
    window.addEventListener('analytics-consent-changed', refresh);
    return () => { active = false; window.removeEventListener('analytics-consent-changed', refresh); };
  }, []);
  if (!visible) return null;
  return <aside className="analytics-banner" aria-labelledby="analytics-invitation"><h2 id="analytics-invitation">{tr('analytics:invitation')}</h2><AnalyticsDisclosure/><ConsentChoice busy={busy} onChoose={enabled => {
    setBusy(true); setError(false);
    void desktop.invoke('analytics:setConsent', {enabled}).then(() => setVisible(false)).catch(() => setError(true)).finally(() => setBusy(false));
  }}/>{error && <p role="alert">{tr('errors:generic')}</p>}</aside>;
}
export function AnalyticsSettings() {
  useTranslation();
  const [state, setState] = useState<AnalyticsState>();
  const [id, setId] = useState<string | null>(null);
  const [deletion, setDeletion] = useState<IpcResponse<'analytics:requestDeletion'>>();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const load = () => { setError(false); void Promise.all([desktop.invoke('analytics:getState', {}), desktop.invoke('analytics:getInstallationId', {})]).then(([s,i]) => {setState(s); setId(i.installation_id);}).catch(() => setError(true)); };
  useEffect(load, []);
  return <Panel title={tr('analytics:title')}><div className="settings-stack settings-general-rows">
    <SettingRow label={tr('analytics:enabled')} description={tr('analytics:off_hint')}><Switch label={tr('analytics:enabled')} isLabelHidden value={state?.enabled ?? false} isDisabled={!state || busy} onChange={enabled => {
      setBusy(true); setError(false);
      void desktop.invoke('analytics:setConsent', {enabled}).then(async next => {
        setState(next);
        const identity=await desktop.invoke('analytics:getInstallationId', {});
        setId(identity.installation_id);
        if (!next.deletion_pending) setDeletion(undefined);
        window.dispatchEvent(new Event('analytics-consent-changed'));
      }).catch(() => setError(true)).finally(() => setBusy(false));
    }}/></SettingRow>
    <div className="analytics-details !p-0 text-[length:var(--type-sm)] leading-normal"><AnalyticsDisclosure/><details><summary>{tr('analytics:exact')}</summary><ul>{['device','activity','ai','school'].map(key => <li key={key}>{tr(`analytics:collect_${key}`)}</li>)}</ul></details>
    <p>{tr('analytics:installation')}</p><div className="analytics-id"><code>{id ?? tr('analytics:unavailable')}</code><Button label={tr('analytics:copy')} size="sm" variant="secondary" isDisabled={!id} onClick={() => { if (id) void navigator.clipboard.writeText(id).then(() => setCopied(true)).catch(() => setError(true)); }} /></div>
    {copied && <p role="status">{tr('analytics:copied')}</p>}
    {(state?.deletion_pending || deletion) && <p role="status">{tr('analytics:pending')}</p>}
    <SettingRow label={tr('analytics:delete')} description={tr('analytics:delete_hint')}><Button label={tr('analytics:delete')} variant="destructive" size="sm" isDisabled={!state || busy} onClick={() => setConfirm(true)} /></SettingRow>
    {confirm && <div className="analytics-deletion"><p>{tr('analytics:delete_hint')}</p><Button label={tr('analytics:instructions')} variant="secondary" isDisabled={busy} onClick={() => {
      setBusy(true); setError(false);
      void desktop.invoke('analytics:requestDeletion', {}).then(result => { setDeletion(result); setId(result.installation_id); setState(s => s ? {...s, enabled:false, deletion_pending:true} : s); setConfirm(false); }).catch(() => setError(true)).finally(() => setBusy(false));
    }} /><Button label={tr('analytics:cancel')} variant="ghost" onClick={() => setConfirm(false)} /></div>}
    {deletion && <div role="status"><p>{tr('analytics:contact_instructions')}</p><blockquote lang="en">{deletion.instructions}</blockquote><a href={deletion.contact_url} onClick={e => {e.preventDefault(); void desktop.invoke('shell:openExternal', {url:deletion.contact_url}).catch(() => setError(true));}}>{tr('analytics:publisher')}</a></div>}
    {error && <p role="alert">{tr('errors:generic')} <Button label={tr('analytics:retry')} variant="ghost" onClick={load} /></p>}</div>
  </div></Panel>;
}
