import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnalyticsState } from '../shared/analytics';
import type { IpcResponse } from '../shared';
import { WEBSITE_URL } from '../shared/website';
import { tr } from '../shared/i18n';
import { desktop } from './bridge';
import { Button } from './components/ui/button';
import { Toolbar } from './components/ui';
import { Switch } from './components/ui/switch';
import { SettingsGroup, SettingsRow } from './settings/layout';
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
        <Button
          key={String(enabled)}
          variant="secondary"
          className="h-auto min-h-[var(--control-height)] flex-1 basis-44 whitespace-normal"
          disabled={busy}
          onClick={() => onChoose(enabled)}
        >
          {tr(enabled ? 'analytics:share' : 'analytics:decline')}
        </Button>
      ))}
    />
  );
}
export function ConsentSaved({ enabled, onOpenPrivacy, busy = false }: { enabled: boolean; onOpenPrivacy: () => void; busy?: boolean }) {
  return (
    <div className="grid gap-[var(--space-1)]">
      <Toolbar
        left={<strong>{tr('analytics:saved_state', { state: tr(enabled ? 'analytics:state_on' : 'analytics:state_off') })}</strong>}
        right={<Button variant="link" disabled={busy} onClick={onOpenPrivacy}>{tr('analytics:open_privacy')}</Button>}
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
  return <SettingsGroup title={tr('analytics:title')}>
    <SettingsRow label={tr('analytics:enabled')} description={tr('analytics:off_hint')}><Switch aria-label={tr('analytics:enabled')} checked={state?.enabled ?? false} disabled={!state || busy} onCheckedChange={enabled => {
      setBusy(true); setError(false);
      void desktop.invoke('analytics:setConsent', {enabled}).then(async next => {
        setState(next);
        const identity=await desktop.invoke('analytics:getInstallationId', {});
        setId(identity.installation_id);
        if (!next.deletion_pending) setDeletion(undefined);
        window.dispatchEvent(new Event('analytics-consent-changed'));
      }).catch(() => setError(true)).finally(() => setBusy(false));
    }}/></SettingsRow>
    <div className="analytics-details"><AnalyticsDisclosure/><details><summary>{tr('analytics:exact')}</summary><ul>{['device','activity','ai','school'].map(key => <li key={key}>{tr(`analytics:collect_${key}`)}</li>)}</ul></details>
    <p>{tr('analytics:installation')}</p><div className="analytics-id"><code>{id ?? tr('analytics:unavailable')}</code><Button variant="secondary" disabled={!id} onClick={() => { if (id) void navigator.clipboard.writeText(id).then(() => setCopied(true)).catch(() => setError(true)); }}>{tr('analytics:copy')}</Button></div>
    {copied && <p role="status">{tr('analytics:copied')}</p>}
    {(state?.deletion_pending || deletion) && <p role="status">{tr('analytics:pending')}</p>}
    <Button variant="secondary" disabled={!state || busy} onClick={() => setConfirm(true)}>{tr('analytics:delete')}</Button>
    {confirm && <div className="analytics-deletion"><p>{tr('analytics:delete_hint')}</p><Button variant="secondary" disabled={busy} onClick={() => {
      setBusy(true); setError(false);
      void desktop.invoke('analytics:requestDeletion', {}).then(result => { setDeletion(result); setId(result.installation_id); setState(s => s ? {...s, enabled:false, deletion_pending:true} : s); setConfirm(false); }).catch(() => setError(true)).finally(() => setBusy(false));
    }}>{tr('analytics:instructions')}</Button><Button variant="ghost" onClick={() => setConfirm(false)}>{tr('analytics:cancel')}</Button></div>}
    {deletion && <div role="status"><p>{tr('analytics:contact_instructions')}</p><blockquote lang="en">{deletion.instructions}</blockquote><a href={deletion.contact_url} onClick={e => {e.preventDefault(); void desktop.invoke('shell:openExternal', {url:deletion.contact_url}).catch(() => setError(true));}}>{tr('analytics:publisher')}</a></div>}
    {error && <p role="alert">{tr('errors:generic')} <Button variant="ghost" onClick={load}>{tr('analytics:retry')}</Button></p>}</div>
  </SettingsGroup>;
}
