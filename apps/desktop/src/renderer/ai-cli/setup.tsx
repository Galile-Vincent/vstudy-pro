/** Guided setup coordinates explicit provider consent and previewed named actions in one sheet. */
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import type { CliActionId, CliActionPlan, CliProvider } from '../../shared/ai-cli';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { aiCliChanged } from './entry';
import { cliNames, cliProviders, currentStep, setupAction, setupSteps, recommendedProvider } from './model';
import { useCliTools } from './use-tools';
import { useCliAction } from './use-action';
import { ActionPreview } from './preview';
import { ProviderChoice } from './choice';
import { ManualInstall, ManualInstallReason, manualNoticeText, type ManualNotice } from './manual-install';
const CliTerminal = lazy(() => import('./terminal').then(module => ({ default: module.CliTerminal })));
import { SetupRecovery } from './recovery';
import { AdvancedShell } from './preferences';
import { SignInAction } from './sign-in';
import './setup.css';

export { AiCliSetupHost } from './setup-host';

export function AiCliSetup({ initialProvider, onClose }: { initialProvider?: CliProvider | undefined; onClose: () => void }) {
  useTranslation();
  const { tools, error: loadError, loaded, refresh } = useCliTools();
  const [selectedProvider, setProvider] = useState<CliProvider | undefined>(initialProvider);
  const provider = selectedProvider ?? recommendedProvider(tools);
  const [savingConsent, setSavingConsent] = useState(false);
  const [localError, setLocalError] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [updatePlan, setUpdatePlan] = useState<CliActionPlan>();
  const [manualResult, setManualResult] = useState<{ provider: CliProvider; notice: ManualNotice }>();
  const runner = useCliAction(refresh);
  useEffect(() => { if (loaded && !selectedProvider) setProvider(provider); }, [loaded, selectedProvider, provider]);
  const tool = tools.find(item => item.provider === provider);
  const toolCancelled = tool?.status === 'error' && tool.error.hint === 'cancelled';
  const loginCancelled = runner.session?.phase === 'cancelled' && runner.session.actionId.startsWith('login-');
  const step = tool ? loginCancelled && toolCancelled ? 'login' : currentStep(tool) : 'install';
  const manualStep = !!tool?.manualInstallRequired && step === 'install';
  const running = runner.session?.phase === 'running';
  const busy = running || runner.busy || savingConsent;
  const failed = runner.error ?? (runner.plan && !runner.plan.available ? runner.plan.reason : undefined) ?? (!runner.plan ? (loginCancelled ? undefined : runner.session?.error) ?? (tool?.status === 'error' && !toolCancelled ? tool.error.hint : undefined) : undefined);
  useEffect(() => {
    if (tool?.consented && !tool.tested && !running && !manualStep && !savingConsent && !runner.session?.error) void runner.preview(setupAction(provider, step));
  }, [provider, step, tool?.consented, tool?.tested, running, manualStep, savingConsent, runner.session?.error, runner.preview]);
  useEffect(() => {
    let disposed = false;
    setUpdatePlan(undefined);
    if (tool?.consented && tool.status === 'update-available' && !tool.manualUpdateRequired) void desktop.invoke('ai-cli:preview', { actionId: `update-${provider}` }).then(plan => { if (!disposed) setUpdatePlan(plan); }).catch(() => { if (!disposed) setLocalError(true); });
    return () => { disposed = true; };
  }, [provider, tool?.consented, tool?.status, tool?.latestVersion, tool?.manualUpdateRequired]);
  const runningStatus = { install: 'installing', login: 'signing-in', test: 'testing' }[step];
  const neutralStatus = { install: 'not-installed', login: 'installed-not-signed-in', test: 'not_tested' }[step];
  const displayStatus = failed ? 'error' : running && !tool?.tested ? runningStatus : toolCancelled ? neutralStatus : tool?.status === 'ready' && !tool.tested ? 'not_tested' : tool?.status;
  const doneStep = setupSteps.find(item => runner.session?.actionId.startsWith(`${item}-`));
  const announcement = running && !tool?.tested && step !== 'login' ? tr('ai-cli:announce_running', { step: tr(`ai-cli:step_${step}`) })
    : !failed && runner.session?.phase === 'succeeded' && doneStep && doneStep !== 'login' ? tr(doneStep === 'test' ? 'ai-cli:test_success' : 'ai-cli:announce_done', { step: tr(`ai-cli:step_${doneStep}`) }) : '';
  const reportManual = (notice: ManualNotice | undefined) => setManualResult(notice ? { provider, notice } : undefined);
  const review = async (actionId: CliActionId) => {
    await runner.preview(actionId);
    requestAnimationFrame(() => document.getElementById('ai-cli-preview')?.focus());
  };
  const close = () => { void runner.close().then(onClose).catch(() => setLocalError(true)); };
  const consent = async (enabled: boolean) => {
    setSavingConsent(true); setLocalError(false);
    try { await desktop.invoke('ai-cli:consent', { provider, enabled }); await refresh(); aiCliChanged(); }
    catch { setLocalError(true); }
    finally { setSavingConsent(false); }
  };
  const start = async () => {
    setSavingConsent(true); setLocalError(false);
    try {
      await desktop.invoke('ai-cli:consent', { provider, enabled: true });
      await refresh(); aiCliChanged();
      const plan = await runner.preview(setupAction(provider, step));
      if (plan) await runner.run(false, plan);
    } catch { setLocalError(true); }
    finally { setSavingConsent(false); }
  };
  const choose = async (next: CliProvider) => {
    try { await runner.close(); setProvider(next); setCopied(false); setLocalError(false); }
    catch { setLocalError(true); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent showCloseButton={false} className="ai-cli-sheet" aria-describedby="ai-cli-intro" onPointerDownOutside={event => event.preventDefault()}>
      <header className="ai-cli-header"><div><DialogTitle className="ai-cli-title">{tr('ai-cli:title')}</DialogTitle><DialogDescription id="ai-cli-intro">{tr('ai-cli:intro')}</DialogDescription></div><Button variant="ghost" aria-label={tr('ai-cli:close')} onClick={close}><X size={20} aria-hidden="true" /></Button></header>
      <div className="ai-cli-scroll">
        <div className="ai-cli-manual-live" role="status">{manualResult?.provider === provider && <p>{manualNoticeText(manualResult.notice)}</p>}</div>
        {loadError && <div role="alert"><p>{tr('ai-cli:load_error')}</p><Button variant="secondary" onClick={() => void refresh()}>{tr('ai-cli:retry')}</Button></div>}
        {!loaded && !loadError && <p role="status">{tr('ai-cli:loading')}</p>}
        {tool && <>
          <div className="ai-cli-tool-heading"><strong>{cliNames[provider]}</strong><span className="ai-cli-chip" data-status={displayStatus}>{tr(`ai-cli:status_${displayStatus}`)}</span><span className="ai-cli-live" role="status">{announcement}</span></div>
          <ol className="ai-cli-steps" aria-label={tr('ai-cli:steps')}>{setupSteps.map((item, index) => {
            const done = setupSteps.indexOf(step) > index || tool.tested;
            const current = !tool.tested && step === item;
            const state = done ? 'done' : !current ? 'pending' : failed ? 'failed' : running ? 'running' : 'pending';
            return <li key={item} aria-current={current ? 'step' : undefined} data-state={state}>
              <span className="ai-cli-step-number" aria-hidden="true">{done ? <Check size={16} /> : index + 1}</span>
              <span><strong>{tr(`ai-cli:step_${item}`)}</strong><small>{tr(`ai-cli:step_state_${current && state === 'pending' ? 'next' : state}`)}</small></span>
            </li>;
          })}</ol>
          <div className="ai-cli-workarea"><div className={`ai-cli-instructions${tool.tested ? ' ai-cli-complete' : ''}`}>
            {tool.tested && <Check className="ai-cli-complete-icon" size={28} aria-hidden="true" />}
            <h2>{tr(tool.tested ? 'ai-cli:ready_title' : `ai-cli:heading_${step}`)}</h2>
            {manualStep ? <ManualInstallReason key={provider} provider={provider} /> : <p>{tr(tool.tested ? 'ai-cli:ready_body' : `ai-cli:instruction_${provider}_${step}`)}</p>}
          </div><div className="ai-cli-action-area" aria-busy={busy}>
            {!tool.consented && !manualStep && <Button className="ai-cli-consent" disabled={busy} onClick={() => void start()}>{tr(`ai-cli:step_${step}`)}</Button>}
            {!tool.consented && !manualStep && <p>{tr('ai-cli:first_click_consent', { action: tr(`ai-cli:step_${step}`), provider: cliNames[provider] })}</p>}
            {runner.busy && <p role="status">{tr('ai-cli:preparing')}</p>}
            {runner.externalOpened && <p role="status">{tr('ai-cli:own_terminal_opened')}</p>}
            {manualStep && <ManualInstall key={provider} provider={provider} required busy={busy} onCheck={refresh} onNotice={reportManual} />}
            {runner.plan && (!manualStep || runner.plan.actionId === 'advanced-shell') && (tool.consented || runner.plan.actionId === 'advanced-shell') && <ActionPreview key={runner.plan.token} plan={runner.plan} hideAction={!!failed} busy={busy} run={runner.run} guided={/^(install|login|test)-/.test(runner.plan.actionId)} />}
            {!failed && !runner.plan && !busy && tool.consented && !tool.tested && !manualStep && <Button variant="secondary" onClick={() => void start()}>{tr(`ai-cli:step_${step}`)}</Button>}
            {running && <Button variant="secondary" onClick={() => void runner.close(false).catch(() => setLocalError(true))}>{tr('ai-cli:cancel')}</Button>}
            {failed && <SetupRecovery failure={failed} tool={tool} session={runner.session} busy={busy} onAction={action => void runner.preview(action ? `${action}-${provider}` : runner.session?.actionId ?? setupAction(provider, step))} />}

            {runner.session?.phase === 'succeeded' && runner.session.actionId === setupAction(provider, step) && <p className="ai-cli-success">{tr(runner.session.actionId.startsWith('test-') ? 'ai-cli:test_success' : 'ai-cli:action_success')}</p>}
            {runner.session?.phase === 'cancelled' && !loginCancelled && <p role="status">{tr('ai-cli:phase_cancelled')}</p>}
            {tool.appliesToNewChats && <p role="status">{tr('ai-cli:new_chats')}</p>}
          </div></div>
          {runner.session?.actionId.startsWith('login-') && <SignInAction key={runner.session.id} session={runner.session} onRetry={() => void runner.preview(`login-${provider}`)} />}
          {runner.session && <details className="ai-cli-details" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary>{tr('ai-cli:terminal')}</summary>{detailsOpen && <Suspense fallback={null}><CliTerminal session={runner.session} /></Suspense>}</details>}
        </>}
        <details className="ai-cli-more"><summary>{tr('ai-cli:more_options')}</summary><p>{tr('ai-cli:pick_hint')}</p>
        <fieldset className="ai-cli-chooser" disabled={busy}><legend>{tr('ai-cli:choose')}</legend>{cliProviders.map(id => <label key={id} data-selected={provider === id}><input type="radio" name="ai-cli-provider" checked={provider === id} onChange={() => void choose(id)} /><strong>{cliNames[id]}</strong><span>{tr(`ai-cli:account_${id}`)}</span></label>)}</fieldset>
            <details className="ai-cli-account"><summary>{tr('ai-cli:account_title')}</summary><p>{tr(`ai-cli:cost_${provider}`)}</p><p>{tr('ai-cli:privacy_copy')}</p></details>
          {tool && <>
          <label className="ai-cli-consent"><input type="checkbox" checked={tool.consented} disabled={busy} onChange={event => void consent(event.target.checked)} /><span>{tr('ai-cli:consent_manual', { provider: cliNames[provider] })}</span></label>
          <section className="ai-cli-maintenance" aria-label={tr('ai-cli:manage')}><h3>{tr('ai-cli:manage')}</h3><p>{tr('ai-cli:new_chats')}</p><div className="ai-cli-actions">
            <Button variant="secondary" disabled={busy || !tool.consented || (!tool.version && !tool.path)} onClick={() => void review(`status-${provider}`)}>{tr('ai-cli:check_status')}</Button>
            <Button variant="ghost" disabled={busy || !tool.consented || (!tool.version && !tool.path)} onClick={() => void review(`login-${provider}`)}>{tr('ai-cli:sign_in_again')}</Button>
            {updatePlan?.available && <Button variant="secondary" disabled={busy} onClick={() => void review(`update-${provider}`)}>{tr('ai-cli:update', { version: tool.latestVersion })}</Button>}
            {tool.managed && tool.previousVersion && <Button variant="secondary" disabled={busy || !tool.consented} onClick={() => void review(`rollback-${provider}`)}>{tr('ai-cli:rollback', { version: tool.previousVersion })}</Button>}
            {tool.releaseNotesUrl && <Button variant="link" disabled={busy} onClick={() => void desktop.invoke('shell:openExternal', { url: tool.releaseNotesUrl! }).catch(() => setLocalError(true))}>{tr('ai-cli:release_notes')}</Button>}
          </div>{updatePlan && !updatePlan.available && <p>{tr(`ai-cli:failure_${updatePlan.reason ?? 'unsupported'}`)}</p>}</section>
          {tool.status === 'update-available' && tool.manualUpdateRequired && <p role="status">{tr('ai-cli:manual_update')}</p>}
          </>}
        <ProviderChoice />
        {!manualStep && <ManualInstall key={provider} provider={provider} busy={busy} onCheck={refresh} onNotice={reportManual} />}
        <AdvancedShell busy={busy} onPreview={() => void review('advanced-shell')} />
        <details className="ai-cli-help"><summary>{tr('ai-cli:ask_title')}</summary><p>{tr('ai-cli:ask_body')}</p><blockquote>{tr('ai-cli:school_request', { provider: cliNames[provider] })}</blockquote><Button variant="secondary" onClick={() => void navigator.clipboard.writeText(tr('ai-cli:school_request', { provider: cliNames[provider] })).then(() => setCopied(true)).catch(() => setLocalError(true))}>{tr(copied ? 'ai-cli:copied' : 'ai-cli:copy_request')}</Button></details>
          <Button variant="link" onClick={() => void runner.close().then(() => { onClose(); window.dispatchEvent(new CustomEvent('vstudy:open-settings', { detail: { tab: 'providers' } })); }).catch(() => setLocalError(true))}>{tr('ai-cli:api_options')}</Button>
        </details>
        {localError && <p role="alert">{tr('ai-cli:load_error')}</p>}
      </div><footer className="ai-cli-footer"><p>{tr('ai-cli:optional')}</p><Button variant={tool?.tested ? 'default' : 'ghost'} onClick={close}>{tr(tool?.tested ? 'ai-cli:continue' : 'ai-cli:continue_reading')}</Button></footer>
    </DialogContent>
  </Dialog>;
}
