/** Guided setup coordinates explicit provider consent and previewed named actions in one sheet. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import type { CliActionId, CliActionPlan, CliProvider } from '../../shared/ai-cli';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { aiCliChanged, aiCliSetupEvent } from './entry';
import { cliNames, cliProviders, currentStep, setupAction, setupSteps } from './model';
import { useCliTools } from './use-tools';
import { useCliAction } from './use-action';
import { ActionPreview } from './preview';
import { CliTerminal } from './terminal';
import { AdvancedShell } from './preferences';
import './setup.css';

export function AiCliSetupHost() {
  const [request, setRequest] = useState<{ provider?: CliProvider }>();
  useEffect(() => {
    const show = (event: Event) => {
      const provider = (event as CustomEvent<{ provider?: CliProvider }>).detail?.provider;
      setRequest(provider && cliProviders.includes(provider) ? { provider } : {});
    };
    window.addEventListener(aiCliSetupEvent, show);
    return () => window.removeEventListener(aiCliSetupEvent, show);
  }, []);
  return request ? <AiCliSetup key={request.provider ?? 'choose'} initialProvider={request.provider} onClose={() => setRequest(undefined)} /> : null;
}

export function AiCliSetup({ initialProvider, onClose }: { initialProvider?: CliProvider | undefined; onClose: () => void }) {
  useTranslation();
  const { tools, error: loadError, loaded, refresh } = useCliTools();
  const [provider, setProvider] = useState<CliProvider>(initialProvider ?? 'claude');
  const [savingConsent, setSavingConsent] = useState(false);
  const [localError, setLocalError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [updatePlan, setUpdatePlan] = useState<CliActionPlan>();
  const runner = useCliAction(refresh);
  const tool = tools.find(item => item.provider === provider);
  const step = tool ? currentStep(tool) : 'install';
  const running = runner.session?.phase === 'running';
  const busy = running || runner.busy || savingConsent;
  const failed = runner.error ?? (runner.plan && !runner.plan.available ? runner.plan.reason : undefined) ?? runner.session?.error ?? (tool?.status === 'error' ? tool.error.hint : undefined);
  useEffect(() => {
    if (tool?.consented && !tool.tested && !running) void runner.preview(setupAction(provider, step));
  }, [provider, step, tool?.consented, tool?.tested, running, runner.preview]);
  useEffect(() => {
    let disposed = false;
    setUpdatePlan(undefined);
    if (tool?.consented && tool.status === 'update-available') void desktop.invoke('ai-cli:preview', { actionId: `update-${provider}` }).then(plan => { if (!disposed) setUpdatePlan(plan); }).catch(() => { if (!disposed) setLocalError(true); });
    return () => { disposed = true; };
  }, [provider, tool?.consented, tool?.status, tool?.latestVersion]);
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
  const choose = async (next: CliProvider) => {
    try { await runner.close(); setProvider(next); setCopied(false); setLocalError(false); }
    catch { setLocalError(true); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent showCloseButton={false} className="ai-cli-sheet" aria-describedby="ai-cli-intro" onPointerDownOutside={event => event.preventDefault()}>
      <header className="ai-cli-header"><div><p className="ai-cli-eyebrow">{tr('ai-cli:eyebrow')}</p><DialogTitle className="ai-cli-title">{tr('ai-cli:title')}</DialogTitle><DialogDescription id="ai-cli-intro">{tr('ai-cli:intro')}</DialogDescription></div><Button variant="ghost" aria-label={tr('ai-cli:close')} onClick={close}><X size={20} aria-hidden="true" /></Button></header>
      <div className="ai-cli-scroll">
        <fieldset className="ai-cli-chooser" disabled={busy}><legend>{tr('ai-cli:choose')}</legend>{cliProviders.map(id => <label key={id} data-selected={provider === id}><input type="radio" name="ai-cli-provider" checked={provider === id} onChange={() => void choose(id)} /><strong>{cliNames[id]}</strong><span>{tr(`ai-cli:account_${id}`)}</span></label>)}</fieldset>
        {loadError && <div role="alert"><p>{tr('ai-cli:load_error')}</p><Button variant="secondary" onClick={() => void refresh()}>{tr('ai-cli:retry')}</Button></div>}
        {!loaded && !loadError && <p role="status">{tr('ai-cli:loading')}</p>}
        {tool && <>
          <div className="ai-cli-tool-heading"><strong>{cliNames[provider]}</strong><span className="ai-cli-chip" role="status" data-status={tool.status}>{tr(`ai-cli:status_${tool.status}`)}</span>{tool.version && <code>{tool.version}</code>}</div>
          <ol className="ai-cli-steps" aria-label={tr('ai-cli:steps')}>{setupSteps.map((item, index) => <li key={item} aria-current={step === item ? 'step' : undefined} data-done={setupSteps.indexOf(step) > index || tool.tested}><span className="ai-cli-step-number" aria-hidden="true">{setupSteps.indexOf(step) > index || tool.tested ? <Check size={16} /> : index + 1}</span><span><strong>{tr(`ai-cli:step_${item}`)}</strong>{step === item && !tool.tested && <small>{tr('ai-cli:you_are_here')}</small>}</span></li>)}</ol>
          <div className="ai-cli-workarea"><div className="ai-cli-instructions">
            <p className="ai-cli-eyebrow">{tr('ai-cli:next_result')}</p><h2>{tr(tool.tested ? 'ai-cli:ready_title' : `ai-cli:heading_${step}`)}</h2>
            <p>{tr(tool.tested ? 'ai-cli:ready_body' : `ai-cli:instruction_${provider}_${step}`)}</p>
            <div className="ai-cli-account"><strong>{tr('ai-cli:account_title')}</strong><p>{tr(`ai-cli:cost_${provider}`)}</p><p>{tr('ai-cli:privacy_copy')}</p></div>
            <label className="ai-cli-consent"><input type="checkbox" checked={tool.consented} disabled={busy} onChange={event => void consent(event.target.checked)} /><span>{tr('ai-cli:consent', { provider: cliNames[provider] })}<small>{tr('ai-cli:consent_help')}</small></span></label>
          </div><div className="ai-cli-action-area" aria-busy={busy}>
            {!tool.consented && <p className="ai-cli-preview">{tr('ai-cli:consent_first')}</p>}
            {runner.busy && <p role="status">{tr('ai-cli:preparing')}</p>}
            {runner.plan && (tool.consented || runner.plan.actionId === 'advanced-shell') && <ActionPreview key={runner.plan.token} plan={runner.plan} busy={busy} run={runner.run} />}
            {!runner.plan && !busy && tool.consented && <Button variant="secondary" onClick={() => void runner.preview(setupAction(provider, step))}>{tr('ai-cli:review_next')}</Button>}
            {running && <Button variant="secondary" onClick={() => void runner.close(false).catch(() => setLocalError(true))}>{tr('ai-cli:cancel')}</Button>}
            {failed && <div className="ai-cli-recovery" role="alert"><strong>{tr('ai-cli:needs_attention')}</strong><p>{tr(`ai-cli:failure_${failed}`)}</p><p>{tr(`ai-cli:recovery_${provider}`)}</p>{!busy && <Button variant="secondary" onClick={() => void runner.preview(runner.session?.actionId ?? setupAction(provider, step))}>{tr('ai-cli:retry')}</Button>}</div>}
            {runner.session?.phase === 'succeeded' && <p role="status" className="ai-cli-success">{tr(runner.session.actionId.startsWith('test-') ? 'ai-cli:test_success' : 'ai-cli:action_success')}</p>}
            {runner.session?.phase === 'cancelled' && <p role="status">{tr('ai-cli:phase_cancelled')}</p>}
            {tool.appliesToNewChats && <p role="status">{tr('ai-cli:new_chats')}</p>}
          </div></div>
          {runner.session && <CliTerminal session={runner.session} />}
          <section className="ai-cli-maintenance" aria-label={tr('ai-cli:manage')}><h3>{tr('ai-cli:manage')}</h3><p>{tr('ai-cli:new_chats')}</p><div className="ai-cli-actions">
            <Button variant="secondary" disabled={busy || !tool.consented || (!tool.version && !tool.path)} onClick={() => void review(`status-${provider}`)}>{tr('ai-cli:check_status')}</Button>
            <Button variant="ghost" disabled={busy || !tool.consented || (!tool.version && !tool.path)} onClick={() => void review(`login-${provider}`)}>{tr('ai-cli:sign_in_again')}</Button>
            {updatePlan?.available && <Button variant="secondary" disabled={busy} onClick={() => void review(`update-${provider}`)}>{tr('ai-cli:update', { version: tool.latestVersion })}</Button>}
            {tool.managed && tool.previousVersion && <Button variant="secondary" disabled={busy || !tool.consented} onClick={() => void review(`rollback-${provider}`)}>{tr('ai-cli:rollback', { version: tool.previousVersion })}</Button>}
            {tool.releaseNotesUrl && <Button variant="link" disabled={busy} onClick={() => void desktop.invoke('shell:openExternal', { url: tool.releaseNotesUrl! }).catch(() => setLocalError(true))}>{tr('ai-cli:release_notes')}</Button>}
          </div>{updatePlan && !updatePlan.available && <p>{tr(`ai-cli:failure_${updatePlan.reason ?? 'unsupported'}`)}</p>}</section>
        </>}
        <AdvancedShell busy={busy} onPreview={() => void review('advanced-shell')} />
        <details className="ai-cli-help"><summary>{tr('ai-cli:ask_title')}</summary><p>{tr('ai-cli:ask_body')}</p><blockquote>{tr('ai-cli:school_request', { provider: cliNames[provider] })}</blockquote><Button variant="secondary" onClick={() => void navigator.clipboard.writeText(tr('ai-cli:school_request', { provider: cliNames[provider] })).then(() => setCopied(true)).catch(() => setLocalError(true))}>{tr(copied ? 'ai-cli:copied' : 'ai-cli:copy_request')}</Button></details>
        {localError && <p role="alert">{tr('ai-cli:load_error')}</p>}
      </div><footer className="ai-cli-footer"><p>{tr('ai-cli:optional')}</p><Button variant="ghost" onClick={close}>{tr('ai-cli:continue_reading')}</Button></footer>
    </DialogContent>
  </Dialog>;
}
