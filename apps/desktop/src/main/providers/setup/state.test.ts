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
