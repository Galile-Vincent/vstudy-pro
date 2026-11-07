// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Onboarding } from './onboarding';
import { defaultSettings } from '../../shared';
import { tr } from '../../shared/i18n';
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
