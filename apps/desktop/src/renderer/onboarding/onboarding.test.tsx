// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
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

function replay(state: Record<string, unknown>) {
  saveProgress({ step: 'privacy', status: 'active' });
  invoke.mockImplementation(async channel => channel === 'settings:get' ? defaultSettings : channel === 'settings:systemLocale' ? 'en-US' : channel === 'analytics:getState' ? state : {});
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
