/**
 * Coordinate consent, state transitions, immutable plans, action sessions, and idle-only updates.
 * Listing performs file IO only. A provider's enabled config is its sole execution consent.
 * @packageDocumentation
 */
import { recordEgress } from '../../services/egress';
import { tr } from '../../../shared/i18n';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import type { CliActionId, CliPreferences, CliProvider, CliToolState } from '../../../shared/ai-cli';
import { manualInstallCommand } from '../../../shared/ai-cli-manual';
import type { ProviderRegistry } from '../index';
import { configuredCliPath, type ExecutablePins } from '../executable-pins';
import { hasExecutableLeases, leaseExecutable } from './leases';
import { ReleaseSource, auditedCodex } from './releases';
import { SetupStore, privateDirectory } from './store';
import { actionArgs, actionParts, buildPlan, displayCommand, PreviewTokens, type ActionPlan, type PlanTarget } from './plans';
import { ActionSessions, type RunningAction, type SetupOwner } from './sessions';
import { authStatus, probeVersion, tinyTest } from './probes';
import { ActionPty } from './pty';
import { manualInstallation } from './authenticity';
import { failure, initialState, newer, providerId, providers, SetupError, transition, type Release } from './types';
export interface SetupDependencies {
  store: SetupStore; source: ReleaseSource; pins: ExecutablePins;
  registry: Pick<ProviderRegistry, 'config' | 'configure' | 'get'>;
  chatBusy: () => boolean; chatRevision: () => number;
  describe?: (provider: CliProvider) => Promise<string | null>;
  createPty?: () => ActionPty;
  version?: typeof probeVersion;
  now?: () => number;
  changed?: () => void;
  loginInterpreters?: readonly string[];
}
class BackgroundOwner extends EventEmitter implements SetupOwner { isDestroyed() { return false; } }
const fourHours = 4 * 60 * 60 * 1000;
export class AiCliSetup {
  readonly sessions: ActionSessions;
  private readonly tokens = new PreviewTokens<SetupOwner>();
  private readonly states = new Map<CliProvider, CliToolState>(providers.map(p => [p, initialState(p)]));
  private readonly owners = new Map<SetupOwner, () => void>();
  private readonly documentRevision = new WeakMap<SetupOwner, number>();
  private readonly background = new BackgroundOwner();
  private checking: Promise<CliToolState[]> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;
  private readonly shutdown = new AbortController();
  private automaticRevision = 0;
  constructor(private readonly deps: SetupDependencies) {
    this.sessions = new ActionSessions(deps.createPty, deps.changed);
    deps.pins.setManagedResolver(binary => deps.store.identity(binary), binary => deps.store.describe(binary));
    privateDirectory(join(deps.store.root, 'actions'));
  }
  private now() { return (this.deps.now ?? Date.now)(); }
  private enabled(provider: CliProvider) { return this.deps.registry.config(providerId(provider)).enabled; }
  private state(provider: CliProvider) { return this.states.get(provider)!; }
  private apply(provider: CliProvider, event: Parameters<typeof transition>[1]) { this.states.set(provider, transition(this.state(provider), event)); this.deps.changed?.(); }
  private attach(owner: SetupOwner) {
    if (owner.isDestroyed()) throw new SetupError('cancelled');
    if (this.owners.has(owner)) return;
    const destroyed = () => { this.tokens.remove(owner); this.owners.delete(owner); };
    owner.once('destroyed', destroyed); this.owners.set(owner, destroyed);
  }
  async list(): Promise<CliToolState[]> {
    return Promise.all(providers.map(async provider => {
      let state = this.state(provider);
      const consented = this.enabled(provider), cached = this.deps.store.cached(provider);
      const policy = { manualInstallRequired: manualInstallation(provider, null, this.deps.source.platform, this.deps.source.arch), manualUpdateRequired: manualInstallation(provider, cached, this.deps.source.platform, this.deps.source.arch) };
      state = { ...state, ...policy, consented, latestVersion: cached?.version ?? null, releaseNotesUrl: cached?.notes ?? null, checkedAt: this.deps.store.checkedAt(provider) };
      try {
        const path = await (this.deps.describe ?? configuredCliPath)(provider);
        state = { ...this.state(provider), ...policy, consented, latestVersion: cached?.version ?? null, releaseNotesUrl: cached?.notes ?? null, checkedAt: this.deps.store.checkedAt(provider) };
        if (this.sessions.providerBusy(provider)) { this.states.set(provider, state); return { ...state }; }
        const managed = this.deps.store.active(provider);
        const changed = state.path !== path;
        state = { ...state, path, managed: !!managed && managed.identity.path === path, previousVersion: managed?.previous ?? null,
          version: managed?.identity.path === path ? managed.release.version : changed ? null : state.version };
        if (!path) state = { ...state, status: 'not-installed', error: null, tested: false };
        else if (changed || !consented || state.status === 'not-installed') state = { ...state, status: 'installed-not-signed-in', error: null, tested: false };
        if (state.status === 'ready' && cached && newer(cached.version, state.version)) state = transition(state, { type: 'available' });
      } catch (error) { state = transition(state, { type: 'failed', code: failure(error) }); }
      this.states.set(provider, state);
      return { ...state };
    }));
  }
  async consent(provider: CliProvider, enabled: boolean) {
    this.deps.registry.configure({ ...this.deps.registry.config(providerId(provider)), enabled });
    if (!enabled) await this.sessions.cancelProvider(provider);
    await this.list(); this.deps.changed?.();
  }
  preferences() { return this.deps.store.preferences; }
  setPreferences(preferences: CliPreferences) {
    if (preferences.autoUpdateWhenIdle && !preferences.updateChecks) throw new SetupError('not-consented');
    const previous = this.preferences();
    const result = this.deps.store.setPreferences(preferences);
    if (previous.updateChecks !== result.updateChecks || previous.autoUpdateWhenIdle !== result.autoUpdateWhenIdle) this.automaticRevision++;
    if (!preferences.updateChecks || !preferences.autoUpdateWhenIdle) void this.sessions.resetOwner(this.background);
    if (!preferences.advancedShell) void this.sessions.cancelProvider('advanced-shell');
    this.deps.changed?.(); return result;
  }
  get actionsDirectory() { return join(this.deps.store.root, 'actions'); }
  async preview(owner: SetupOwner, actionId: CliActionId) {
    this.attach(owner);
    const revision = this.documentRevision.get(owner);
    if (this.stopped) throw new SetupError('cancelled');
    await this.list();
    const { provider, verb } = actionParts(actionId);
    let reason: ReturnType<typeof failure> | null = null, binary: string | null = null, release: Release | null = null;
    if (!provider) reason = this.preferences().advancedShell ? null : 'not-consented';
    else {
      const state = this.state(provider); binary = state.path;
      if (verb === 'terminal') reason = manualInstallCommand(provider, this.deps.source.platform) ? null : 'unsupported';
      else if (!this.enabled(provider)) reason = 'not-consented';
      else if (this.sessions.providerBusy(provider)) reason = 'busy';
      else if (provider === 'codex' && this.deps.source.platform !== 'darwin') reason = 'unsupported';
      else if (verb === 'login' && this.deps.source.platform !== 'darwin') reason = 'unsupported';
      else if (!['install', 'update'].includes(verb) && !binary) reason = 'wrong-version';
      else if (verb === 'rollback' && !state.previousVersion || verb === 'update' && !state.managed) reason = 'wrong-version';
      else if (verb === 'install' && !['not-installed', 'installed-not-signed-in', 'error'].includes(state.status)) reason = 'busy';
      if (!reason && ['install', 'update'].includes(verb)) {
        try {
          release = await this.deps.source.installable(provider, AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(30_000)]));
          if (provider === 'codex' && release.version !== auditedCodex) reason = 'wrong-version';
          if (verb === 'update' && !newer(release.version, state.version)) reason = 'wrong-version';
        } catch (error) { reason = failure(error); }
      }
    }
    if (owner.isDestroyed() || revision !== this.documentRevision.get(owner)) throw new SetupError('cancelled');
    return this.tokens.issue(owner, buildPlan(actionId, this.actionsDirectory, binary, release, reason, this.now(), this.deps.loginInterpreters));
  }
  private takePlan(owner: SetupOwner, actionId: CliActionId, token: string, target: PlanTarget = 'embedded') {
    if (this.stopped) throw new SetupError('cancelled');
    const plan = this.tokens.consume(owner, actionId, token, this.now(), target);
    if (plan.verb !== 'terminal' && (plan.provider && !this.enabled(plan.provider) || !plan.provider && !this.preferences().advancedShell)) throw new SetupError('not-consented');
    if (this.sessions.providerBusy(plan.provider)) throw new SetupError('busy');
    return plan;
  }
  async terminalPlan(owner: SetupOwner, actionId: CliActionId, token: string) {
    const revision = this.documentRevision.get(owner);
    const plan = this.takePlan(owner, actionId, token, 'own-terminal');
    await this.trustedPlan(plan);
    if (this.stopped || owner.isDestroyed() || revision !== this.documentRevision.get(owner)) throw new SetupError('cancelled');
    if (plan.verb !== 'terminal' && (plan.provider && !this.enabled(plan.provider) || !plan.provider && !this.preferences().advancedShell)) throw new SetupError('not-consented');
    if (this.sessions.providerBusy(plan.provider)) throw new SetupError('busy');
    const command = plan.verb === 'login' && plan.provider && plan.binary ? displayCommand(plan.binary, actionArgs(plan.provider, plan.verb)) : plan.public.command;
    const env = { ...plan.env };
    delete env.BROWSER;
    if (process.platform === 'linux') for (const key of ['DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR']) {
      if (process.env[key]) env[key] = process.env[key];
    }
    return { command, cwd: plan.cwd, env };
  }
  run(owner: SetupOwner, actionId: CliActionId, token: string) { return this.start(owner, this.takePlan(owner, actionId, token)); }
  async resetOwner(owner: SetupOwner) {
    this.documentRevision.set(owner, (this.documentRevision.get(owner) ?? 0) + 1);
    this.tokens.remove(owner);
    await this.sessions.resetOwner(owner);
  }
  private start(owner: SetupOwner, plan: ActionPlan, automatic = false) {
    const approvedConfig = plan.provider ? this.deps.registry.config(providerId(plan.provider)) : null;
    const revision = this.automaticRevision;
    const consented = () => !this.stopped && (plan.provider ? this.enabled(plan.provider) && this.deps.registry.config(providerId(plan.provider)) === approvedConfig : this.preferences().advancedShell) && (!automatic || revision === this.automaticRevision && this.preferences().updateChecks && this.preferences().autoUpdateWhenIdle);
    return this.sessions.start(owner, plan, async action => {
      const assertConsent = () => { if (!consented()) action.controller.abort(); action.controller.signal.throwIfAborted(); };
      const consentWatcher = setInterval(() => { if (!consented()) action.controller.abort(); }, 100);
      try { await this.execute(action, automatic, assertConsent); } finally { clearInterval(consentWatcher); }
    }, code => { if (plan.provider) this.apply(plan.provider, { type: 'failed', code }); });
  }
  private async trustedPlan(plan: ActionPlan) {
    if (!plan.provider || plan.verb === 'terminal') return;
    if (!this.enabled(plan.provider)) throw new SetupError('not-consented');
    if (['install', 'update', 'rollback'].includes(plan.verb)) return;
    const resolved = await this.deps.pins.resolve(plan.provider);
    if (!resolved || resolved !== plan.binary) throw new SetupError('blocked');
  }
  private async execute(action: RunningAction, automatic: boolean, assertConsent: () => void) {
    const { plan, controller, pty } = action, { provider, verb } = plan;
    const signal = controller.signal;
    assertConsent(); await this.trustedPlan(plan); assertConsent();
    if (provider && !this.enabled(provider)) throw new SetupError('not-consented');
    if (!provider) {
      const result = await pty.run(plan, signal, data => this.sessions.append(action, data), 30 * 60_000);
      action.session.exitCode = result.exitCode;
      if (result.exitCode !== 0) throw new SetupError('unknown');
      return;
    }
    if (['install', 'update', 'rollback'].includes(verb)) {
      if (verb !== 'rollback' && plan.release?.provider !== provider) throw new SetupError('signature');
      const hadAccount = ['ready', 'update-available'].includes(this.state(provider).status);
      const revision = this.deps.chatRevision();
      const canActivate = () => { assertConsent(); return !automatic || !this.deps.chatBusy() && this.deps.chatRevision() === revision && !hasExecutableLeases() && !this.sessions.otherBusy(action); };
      if (!canActivate()) throw new SetupError('busy');
      this.apply(provider, { type: verb === 'install' ? 'install' : 'update' });
      const watcher = automatic ? setInterval(() => { try { if (!canActivate()) controller.abort(); } catch { controller.abort(); } }, 100) : undefined;
      let lastBytes = 0;
      try {
        const installed = verb === 'rollback' ? await this.deps.store.rollback(provider, signal, canActivate) : await this.deps.store.install(plan.release!, this.deps.source.network, signal, bytes => {
          if (bytes - lastBytes > 4_000_000) { this.sessions.append(action, tr('ai-cli:download_progress', { bytes }) + '\r\n'); lastBytes = bytes; }
        }, canActivate, (binary, version) => (this.deps.version ?? probeVersion)(binary, provider, version, plan.cwd, signal).then(() => {}));
        assertConsent(); this.deps.pins.activateManaged(provider, installed.identity);
        this.states.set(provider, { ...this.state(provider), path: installed.identity.path, version: installed.release.version, previousVersion: installed.previous, managed: true, tested: false, appliesToNewChats: verb !== 'install' });
        this.apply(provider, { type: 'installed' });
        if (verb !== 'install' && hadAccount) this.apply(provider, { type: 'ready' });
        this.sessions.append(action, tr('ai-cli:installation_complete') + '\r\n');
      } finally { if (watcher) clearInterval(watcher); }
      return;
    }
    const providerPlan = { ...plan, executable: plan.binary! };
    const releaseLease = leaseExecutable(plan.binary!);
    try {
      assertConsent();
      const version = await (this.deps.version ?? probeVersion)(plan.binary!, provider, this.state(provider).version, plan.cwd, signal);
      assertConsent();
      this.states.set(provider, { ...this.state(provider), version });
      if (!this.enabled(provider)) throw new SetupError('not-consented');
      if (verb === 'login') {
        this.apply(provider, { type: 'login' });
        recordEgress('ai_cli_login', provider === 'claude' ? 'Anthropic / Claude CLI managed endpoints' : provider === 'codex' ? 'OpenAI / Codex CLI managed endpoints' : 'Google / Antigravity CLI managed endpoints');
        if (provider === 'agy') await this.loginAgy(action);
        else {
          const result = await pty.run(plan, signal, data => this.sessions.append(action, data));
          action.session.exitCode = result.exitCode;
          if (result.exitCode !== 0) throw new SetupError(/browser|open/i.test(result.output) ? 'browser-not-opened' : 'not-signed-in');
        }
      }
      if (!this.enabled(provider)) throw new SetupError('not-consented');
      const signedIn = await authStatus(provider, providerPlan, signal);
      assertConsent();
      this.apply(provider, { type: signedIn ? 'ready' : 'unsigned' });
      if (!signedIn) throw new SetupError(verb === 'test' ? 'login-expired' : 'not-signed-in');
      if (verb === 'test') {
        const timed = AbortSignal.any([signal, AbortSignal.timeout(90_000)]);
        const answer = await tinyTest(this.deps.registry, provider, timed);
        assertConsent();
        this.sessions.append(action, answer + '\r\n');
        this.states.set(provider, { ...this.state(provider), tested: true });
      }
      this.sessions.append(action, tr(verb === 'test' ? 'ai-cli:test_complete' : 'ai-cli:signin_verified') + '\r\n');
    } finally { releaseLease(); }
  }
  private async loginAgy(action: RunningAction) {
    const login = new AbortController(), signal = AbortSignal.any([action.controller.signal, login.signal]);
    const terminal = action.pty.run(action.plan, signal, data => this.sessions.append(action, data));
    let completed = false;
    void terminal.then(() => { completed = true; }, () => { completed = true; });
    try {
      while (!completed) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        action.controller.signal.throwIfAborted();
        if (completed) break;
        try {
          if (await authStatus('agy', { ...action.plan, executable: action.plan.binary! }, AbortSignal.any([action.controller.signal, AbortSignal.timeout(15_000)]))) { login.abort(); await terminal.catch(() => {}); return; }
        } catch { action.controller.signal.throwIfAborted(); }
      }
      await terminal;
    } finally { login.abort(); await terminal.catch(() => {}); }
  }
  checkUpdates(manual = true): Promise<CliToolState[]> {
    if (this.checking) return this.checking;
    if (!manual && !this.preferences().updateChecks || this.stopped || this.deps.store.lastAttempt > 0 && this.now() - this.deps.store.lastAttempt < (manual ? 60_000 : fourHours)) return this.list();
    this.deps.store.attempt(this.now());
    this.checking = (async () => {
      for (const provider of providers) {
        try {
          const release = await this.deps.source.latest(provider, AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(30_000)]));
          if (this.stopped || !manual && !this.preferences().updateChecks) break;
          this.deps.store.remember(release, this.now());
        } catch (error) { if (manual) this.apply(provider, { type: 'failed', code: failure(error) }); }
      }
      return this.list();
    })().finally(() => { this.checking = undefined; this.deps.changed?.(); });
    return this.checking;
  }
  startUpdates() {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick().catch(() => {}); }, 60_000); this.timer.unref();
    void this.tick().catch(() => {});
  }
  async tick() {
    if (this.stopped) return;
    await this.checkUpdates(false);
    if (!this.preferences().updateChecks || !this.preferences().autoUpdateWhenIdle || this.deps.chatBusy() || this.sessions.isBusy || hasExecutableLeases()) return;
    for (const provider of providers) {
      const state = this.state(provider), release = this.deps.store.cached(provider);
      if (!this.enabled(provider) || !state.managed || !release || manualInstallation(provider, release, this.deps.source.platform, this.deps.source.arch) || !newer(release.version, state.version) || provider === 'codex' && release.version !== auditedCodex) continue;
      const plan = buildPlan(`update-${provider}`, join(this.deps.store.root, 'actions'), state.path, release, null, this.now());
      this.start(this.background, plan, true); break;
    }
  }
  async dispose() {
    this.stopped = true; this.shutdown.abort(); if (this.timer) clearInterval(this.timer);
    this.tokens.clear();
    for (const [owner, listener] of this.owners) owner.removeListener('destroyed', listener);
    this.owners.clear(); await this.sessions.dispose(); await this.checking;
  }
}
