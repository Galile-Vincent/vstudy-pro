// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Onboarding } from './onboarding';
import { defaultSettings } from '../../shared';
import { tr } from '../../shared/i18n';
import { saveProgress } from './progress';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('../bridge', () => ({ desktop: { invoke }, isMock: false }));
vi.mock('../analytics', () => ({ track: vi.fn() }));
vi.mock('./product-preview', () => ({ ProductPreview: () => null }));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
afterEach(() => { cleanup(); localStorage.clear(); invoke.mockReset(); });
it('states the local-first promise on the welcome step', async () => {
  invoke.mockImplementation(async channel => channel === 'settings:get' ? defaultSettings : channel === 'settings:systemLocale' ? 'en-US' : channel === 'analytics:getState' ? { onboarding_completed: false } : {});
  render(<Onboarding onComplete={() => {}} />);
  expect(await screen.findByText(tr('onboarding:welcome_body'))).toBeTruthy();
  expect(tr('onboarding:welcome_body')).toMatch(/stays on this computer.*AI is optional.*until you ask/);
});

it('returns focus to the opener when setup closes with Escape', async () => {
  invoke.mockImplementation(async channel => channel === 'settings:get' ? defaultSettings : channel === 'settings:systemLocale' ? 'en-US' : channel === 'analytics:getState' ? { onboarding_completed: true } : {});
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const { rerender } = render(<Onboarding onComplete={() => rerender(<></>)} />);
  await screen.findByText(tr('onboarding:welcome_body'));
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(opener));
  opener.remove();
});

type Gate = { resolve: () => void; reject: () => void };
function fakeMain(initial: Record<string, unknown>, gate?: { current?: Gate }) {
  const stored = { enabled: false, consent_decided: false, onboarding_completed: false, onboarding: null, installation_id_present: true, acquisition_source: null, deletion_pending: false, ...initial };
  invoke.mockImplementation(async (channel: string, request: { enabled?: boolean }) => {
    if (channel === 'settings:get') return defaultSettings;
    if (channel === 'settings:systemLocale') return 'en-US';
    if (channel === 'analytics:getState') {
      if (gate) await new Promise<void>((resolve, reject) => { gate.current = { resolve, reject: () => reject(new Error('unavailable')) }; });
      return { ...stored };
    }
    if (channel === 'analytics:setConsent') { stored.consent_decided = true; stored.enabled = request.enabled!; return { ...stored }; }
    if (channel === 'analytics:completeOnboarding') { stored.onboarding_completed = true; return { ...stored }; }
    return {};
  });
  return stored;
}
function replay(state: Record<string, unknown>) {
  saveProgress({ step: 'privacy', status: 'active' });
  fakeMain(state);
}
const consentCalls = () => invoke.mock.calls.filter(([channel]) => String(channel).startsWith('analytics:set') || channel === 'analytics:completeOnboarding');

it.each([[true, 'on'], [false, 'off']] as const)('shows the saved usage sharing choice when the guide is replayed (%s)', async (enabled, key) => {
  replay({ onboarding_completed: true, consent_decided: true, enabled });
  const opened = vi.fn();
  window.addEventListener('vstudy:open-settings', opened);
  render(<Onboarding onComplete={() => {}} />);
  expect(await screen.findByText(tr('analytics:saved_state', { state: tr(`analytics:state_${key}`) }))).toBeTruthy();
  expect(screen.queryByRole('button', { name: tr('analytics:share') })).toBeNull();
  expect(screen.queryByRole('button', { name: tr('analytics:decline') })).toBeNull();
  expect((screen.getByRole('button', { name: tr('onboarding:next') }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: tr('analytics:open_privacy') }));
  await waitFor(() => expect(opened).toHaveBeenCalledOnce());
  expect((opened.mock.calls[0]![0] as CustomEvent).detail).toEqual({ tab: 'privacy' });
  expect(consentCalls()).toEqual([]);
  window.removeEventListener('vstudy:open-settings', opened);
  saveProgress({ step: 'welcome' });
});

it('keeps equal accept and decline choices for an undecided user', async () => {
  replay({ onboarding_completed: false, consent_decided: false, enabled: false });
  render(<Onboarding onComplete={() => {}} />);
  const share = await screen.findByRole('button', { name: tr('analytics:share') }) as HTMLButtonElement;
  const decline = screen.getByRole('button', { name: tr('analytics:decline') }) as HTMLButtonElement;
  expect(share.disabled || decline.disabled).toBe(false);
  expect(share.dataset.variant).toBe(decline.dataset.variant);
  expect(screen.queryByText(/Usage sharing:/)).toBeNull();
  saveProgress({ step: 'welcome' });
});

const choiceButtons = () => [tr('analytics:share'), tr('analytics:decline')].flatMap(name => screen.queryAllByRole('button', { name }));

describe.each([
  ['Escape', () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })],
  ['Later', () => fireEvent.click(screen.getByRole('button', { name: tr('onboarding:later') }))],
] as const)('leaving a replay before the saved choice is known (%s)', (_name, leave) => {
  it('never writes consent while the state is still loading', async () => {
    saveProgress({ step: 'privacy', status: 'active' });
    const gate: { current?: Gate } = {};
    const stored = fakeMain({ enabled: true, consent_decided: true, onboarding_completed: true }, gate);
    const onComplete = vi.fn();
    render(<Onboarding onComplete={onComplete} />);
    await screen.findByText(tr('analytics:checking'));
    expect(choiceButtons()).toEqual([]);
    leave();
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    gate.current!.resolve();
    expect(consentCalls()).toEqual([]);
    expect(stored.enabled).toBe(true);
  });

  it('never writes consent after the state failed to load', async () => {
    saveProgress({ step: 'privacy', status: 'active' });
    const gate: { current?: Gate } = {};
    const stored = fakeMain({ enabled: true, consent_decided: true, onboarding_completed: true }, gate);
    const onComplete = vi.fn();
    render(<Onboarding onComplete={onComplete} />);
    await screen.findByText(tr('analytics:checking'));
    gate.current!.reject();
    await screen.findByRole('alert');
    expect(choiceButtons()).toEqual([]);
    leave();
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(consentCalls()).toEqual([]);
    expect(stored.enabled).toBe(true);
  });
});

it('shows neutral loading, then the saved choice, when resuming at privacy', async () => {
  saveProgress({ step: 'privacy', status: 'active' });
  const gate: { current?: Gate } = {};
  fakeMain({ enabled: true, consent_decided: true, onboarding_completed: true }, gate);
  render(<Onboarding onComplete={() => {}} />);
  await screen.findByText(tr('analytics:checking'));
  expect(choiceButtons()).toEqual([]);
  expect(screen.queryByRole('button', { name: tr('onboarding:next') })).toBeNull();
  gate.current!.resolve();
  expect(await screen.findByText(tr('analytics:saved_state', { state: tr('analytics:state_on') }))).toBeTruthy();
  expect(choiceButtons()).toEqual([]);
});

it('offers a retry when the saved choice could not be read', async () => {
  saveProgress({ step: 'privacy', status: 'active' });
  const gate: { current?: Gate } = {};
  fakeMain({ enabled: false, consent_decided: false }, gate);
  render(<Onboarding onComplete={() => {}} />);
  await screen.findByText(tr('analytics:checking'));
  gate.current!.reject();
  fireEvent.click(await screen.findByRole('button', { name: tr('analytics:retry') }));
  await screen.findByText(tr('analytics:checking'));
  gate.current!.resolve();
  expect(await screen.findByRole('button', { name: tr('analytics:share') })).toBeTruthy();
  expect(consentCalls()).toEqual([]);
});

it('does not write consent when an undecided user leaves without choosing', async () => {
  replay({ onboarding_completed: false, consent_decided: false });
  const onComplete = vi.fn();
  render(<Onboarding onComplete={onComplete} />);
  await screen.findByRole('button', { name: tr('analytics:share') });
  fireEvent.click(screen.getByRole('button', { name: tr('onboarding:later') }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
  expect(consentCalls()).toEqual([]);
});

describe.each([
  [false, false], [false, true], [true, false], [true, true],
] as const)('onboarding_completed=%s consent_decided=%s', (completed, decided) => {
  const flags = { onboarding_completed: completed, consent_decided: decided, enabled: decided };

  it('shows the choices only when no decision is saved', async () => {
    replay(flags);
    render(<Onboarding onComplete={() => {}} />);
    if (decided) {
      expect(await screen.findByText(tr('analytics:saved_state', { state: tr('analytics:state_on') }))).toBeTruthy();
      expect(choiceButtons()).toEqual([]);
    } else {
      await screen.findByRole('button', { name: tr('analytics:share') });
      expect(screen.queryByText(/Usage sharing:/)).toBeNull();
    }
  });

  it('keeps the saved decision when the guide is dismissed', async () => {
    saveProgress({ step: 'privacy', status: 'active' });
    const stored = fakeMain(flags);
    const onComplete = vi.fn();
    render(<Onboarding onComplete={onComplete} />);
    await waitFor(() => expect(screen.queryByText(tr('analytics:checking'))).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: tr('onboarding:later') }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(consentCalls()).toEqual([]);
    expect(stored.enabled).toBe(decided);
    expect(stored.consent_decided).toBe(decided);
  });
});
