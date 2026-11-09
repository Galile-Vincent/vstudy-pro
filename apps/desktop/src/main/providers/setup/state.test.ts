/** State and preview capability tests exercise the committed setup contract. @packageDocumentation */
import { expect, it } from 'vitest';
import { cliToolStateSchema, type CliToolState } from '../../../shared/ai-cli';
import { initialState, transition } from './types';
import { buildPlan, PreviewTokens } from './plans';
import { Owner } from './test-fixtures';
it('keeps discovery, auth, update, and failure states separate', () => {
  let state = initialState('claude');
  state = transition(state, { type: 'install' }); expect(state.status).toBe('installing');
  state = transition(state, { type: 'installed' }); expect(state.status).toBe('installed-not-signed-in');
  state = transition(state, { type: 'login' }); expect(state.status).toBe('signing-in');
  state = transition(state, { type: 'ready' }); expect(state.status).toBe('ready');
  state = transition(state, { type: 'available' }); expect(state.status).toBe('update-available');
  state = transition(state, { type: 'update' }); expect(state.status).toBe('updating');
  state = transition(state, { type: 'failed', code: 'checksum' });
  expect(cliToolStateSchema.parse(state)).toMatchObject({ status: 'error', error: { code: 'checksum', hint: 'checksum' } });
  expect(transition(state, { type: 'installed' }).status).toBe('installed-not-signed-in');
});
it('records which action was cancelled and stays additive for older errors', () => {
  const cancelled = transition({ ...initialState('claude'), status: 'signing-in', error: null } as CliToolState, { type: 'failed', code: 'cancelled', action: 'login' });
  expect(cliToolStateSchema.parse(cancelled)).toMatchObject({ status: 'error', error: { code: 'cancelled', hint: 'cancelled', action: 'login' } });
  const plain = transition(initialState('claude'), { type: 'failed', code: 'offline' });
  expect(plain.error).toEqual({ code: 'offline', hint: 'offline' });
  expect(cliToolStateSchema.safeParse({ ...plain, error: { code: 'cancelled', hint: 'cancelled' } }).success).toBe(true);
  expect(cliToolStateSchema.safeParse({ ...plain, error: { code: 'cancelled', hint: 'cancelled', action: 'update' } }).success).toBe(false);
});
it.each(['not-installed', 'installing', 'installed-not-signed-in', 'signing-in', 'ready', 'update-available', 'updating', 'error'] as const)('enforces transitions from %s', status => {
  const state: CliToolState = status === 'error' ? { ...initialState('claude'), status, error: { code: 'offline', hint: 'offline' } } : { ...initialState('claude'), status, error: null };
  const cases = {
    install: ['not-installed', 'installed-not-signed-in', 'error'], update: ['ready', 'update-available', 'installed-not-signed-in', 'error'],
    login: ['installed-not-signed-in', 'ready', 'update-available', 'error'], installed: ['installing', 'updating', 'error'],
    ready: ['installed-not-signed-in', 'signing-in', 'ready', 'update-available', 'error'], available: ['ready', 'update-available'],
    unsigned: ['installed-not-signed-in', 'signing-in', 'ready', 'update-available', 'error'], missing: ['not-installed', 'installed-not-signed-in', 'ready', 'update-available', 'error'],
  };
  for (const [type, from] of Object.entries(cases)) {
    const act = () => transition(state, { type: type as keyof typeof cases });
    if (from.includes(status)) expect(() => cliToolStateSchema.parse(act())).not.toThrow();
    else expect(act).toThrow('busy');
  }
});
it('consumes a main-issued preview exactly once and rejects another owner, action, or expired token', () => {
  const owner = new Owner(), other = new Owner(), tokens = new PreviewTokens<Owner>();
  const plan = buildPlan('login-claude', '/private/empty', '/private/cli with spaces', null, null, Date.now());
  const preview = tokens.issue(owner, plan);
  expect(() => tokens.consume(other, 'login-claude', preview.token, Date.now())).toThrow('blocked');
  expect(() => tokens.consume(owner, 'test-claude', preview.token, Date.now())).toThrow('blocked');
  expect(tokens.consume(owner, 'login-claude', preview.token, Date.now())).toBe(plan);
  expect(() => tokens.consume(owner, 'login-claude', preview.token, Date.now())).toThrow('blocked');
  const expired = tokens.issue(owner, buildPlan('status-claude', '/private/empty', '/private/bin', null, null, Date.now()));
  expect(() => tokens.consume(owner, 'status-claude', expired.token, expired.expiresAt)).toThrow('blocked');
});
it('keeps manual login tokens bound to their owner, action, and expiry', () => {
  const owner = new Owner(), other = new Owner(), tokens = new PreviewTokens<Owner>();
  const issue = () => tokens.issue(owner, buildPlan('login-claude', '/private/empty', '/private/cli', null, 'unsupported', Date.now()));
  const preview = issue();
  expect(() => tokens.consume(other, 'login-claude', preview.token, Date.now(), 'own-terminal')).toThrow('blocked');
  expect(() => tokens.consume(owner, 'status-claude', preview.token, Date.now(), 'own-terminal')).toThrow('blocked');
  expect(tokens.consume(owner, 'login-claude', preview.token, Date.now(), 'own-terminal').binary).toBe('/private/cli');
  expect(() => tokens.consume(owner, 'login-claude', preview.token, Date.now(), 'own-terminal')).toThrow('blocked');
  const expired = issue();
  expect(() => tokens.consume(owner, 'login-claude', expired.token, expired.expiresAt, 'own-terminal')).toThrow('unsupported');
});
it.each([
  ['login-claude', null, 'unsupported'],
  ['login-claude', '/private/cli', 'not-consented'],
  ['status-claude', '/private/cli', 'unsupported'],
] as const)('does not allow a manual terminal for %s with binary %s and reason %s', (actionId, binary, reason) => {
  const owner = new Owner(), tokens = new PreviewTokens<Owner>();
  const preview = tokens.issue(owner, buildPlan(actionId, '/private/empty', binary, null, reason, Date.now()));
  expect(() => tokens.consume(owner, actionId, preview.token, Date.now(), 'own-terminal')).toThrow(reason);
});

it.each(['claude', 'codex', 'agy'] as const)('never allows the manual %s installer capability to become an embedded action', provider => {
  const owner = new Owner(), tokens = new PreviewTokens<Owner>(), actionId = `terminal-${provider}` as const;
  const issue = () => tokens.issue(owner, buildPlan(actionId, '/private/empty', null, null, null, Date.now()));
  const embedded = issue();
  expect(() => tokens.consume(owner, actionId, embedded.token, Date.now())).toThrow('blocked');
  const external = issue();
  expect(tokens.consume(owner, actionId, external.token, Date.now(), 'own-terminal').verb).toBe('terminal');
  expect(() => tokens.consume(owner, actionId, external.token, Date.now(), 'own-terminal')).toThrow('blocked');
});
