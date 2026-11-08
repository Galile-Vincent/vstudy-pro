/**
 * Window-owned setup action sessions with bounded output, cancellation, and provider exclusion.
 * @packageDocumentation
 */
import { randomUUID } from 'node:crypto';
import type { CliActionSession, CliFailure } from '../../../shared/ai-cli';
import type { ActionPlan } from './plans';
import { ActionPty, TerminalText } from './pty';
import { log } from '../../logging';
import { failure, SetupError } from './types';
export interface SetupOwner {
  isDestroyed(): boolean;
  once(event: 'destroyed', listener: () => void): unknown;
  removeListener(event: 'destroyed', listener: () => void): unknown;
}
export interface RunningAction {
  owner: SetupOwner; plan: ActionPlan; session: CliActionSession; controller: AbortController; pty: ActionPty;
  filter: TerminalText; done: Promise<void>; detach: () => void;
}
export class ActionSessions {
  private readonly actions = new Map<string, RunningAction>();
  private disposed = false;
  constructor(private readonly createPty = () => new ActionPty(), private readonly changed = () => {}) {}
  get isBusy() { return [...this.actions.values()].some(action => action.session.phase === 'running'); }
  otherBusy(action: RunningAction) { return [...this.actions.values()].some(a => a !== action && a.session.phase === 'running'); }
  providerBusy(provider: string | null) { return [...this.actions.values()].some(a => a.session.phase === 'running' && a.plan.provider === provider); }
  append(action: RunningAction, data: string) {
    const next = action.session.output + action.filter.filter(data);
    action.session.truncated ||= next.length > 262144;
    action.session.output = next.slice(-262144);
  }
  start(owner: SetupOwner, plan: ActionPlan, work: (action: RunningAction) => Promise<void>, onFailure: (code: CliFailure) => void): CliActionSession {
    if (this.disposed || owner.isDestroyed()) throw new SetupError('cancelled');
    if (this.providerBusy(plan.provider)) throw new SetupError('busy');
    for (const [id, action] of this.actions) if (action.session.phase !== 'running' && this.actions.size >= 50) this.actions.delete(id);
    if (this.actions.size >= 100) throw new SetupError('busy');
    const session: CliActionSession = { id: randomUUID(), actionId: plan.public.actionId, phase: 'running', output: '', truncated: false, exitCode: null, error: null };
    const controller = new AbortController();
    const destroyed = () => controller.abort();
    const action: RunningAction = { owner, plan, session, controller, filter: new TerminalText(), pty: this.createPty(), done: Promise.resolve(), detach: () => owner.removeListener('destroyed', destroyed) };
    owner.once('destroyed', destroyed); this.actions.set(session.id, action); this.changed();
    action.done = Promise.resolve().then(() => work(action)).then(() => {
      controller.signal.throwIfAborted(); session.phase = 'succeeded'; session.exitCode = 0;
    }).catch(error => {
      const code = controller.signal.aborted ? 'cancelled' : failure(error);
      if (code !== 'cancelled') log({ phase: 'ai-cli-action-failed', provider: plan.provider, verb: plan.verb, code, error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : String(error).slice(0, 300) });
      session.error = code; session.phase = code === 'cancelled' ? 'cancelled' : 'failed'; session.exitCode ??= -1;
      onFailure(code);
    }).finally(() => { action.detach(); if (owner.isDestroyed()) this.actions.delete(session.id); this.changed(); });
    return { ...session };
  }
  owned(owner: SetupOwner, id: string) {
    const action = this.actions.get(id);
    if (!action || action.owner !== owner || owner.isDestroyed()) throw new SetupError('blocked');
    return action;
  }
  read(owner: SetupOwner, id: string) { return { ...this.owned(owner, id).session }; }
  input(owner: SetupOwner, id: string, data: string) {
    const action = this.owned(owner, id);
    if (action.session.phase !== 'running' || !['login', 'advanced-shell'].includes(action.plan.verb)) throw new SetupError('blocked');
    action.pty.write(data);
  }
  resize(owner: SetupOwner, id: string, columns: number, rows: number) { this.owned(owner, id).pty.resize(columns, rows); }
  async close(owner: SetupOwner, id: string) {
    const action = this.owned(owner, id); action.controller.abort(); await action.done; this.actions.delete(id);
  }
  async cancelProvider(provider: string) {
    const actions = [...this.actions.values()].filter(a => (a.plan.provider === provider || a.plan.verb === provider) && a.session.phase === 'running');
    for (const action of actions) action.controller.abort();
    await Promise.all(actions.map(a => a.done));
  }
  async resetOwner(owner: SetupOwner) {
    const actions = [...this.actions.values()].filter(action => action.owner === owner);
    for (const action of actions) action.controller.abort();
    await Promise.all(actions.map(action => action.done));
    for (const action of actions) this.actions.delete(action.session.id);
  }
  async dispose() {
    this.disposed = true;
    for (const action of this.actions.values()) action.controller.abort();
    await Promise.all([...this.actions.values()].map(a => a.done)); this.actions.clear();
  }
}
