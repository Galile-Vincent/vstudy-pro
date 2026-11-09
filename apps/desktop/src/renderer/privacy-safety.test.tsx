// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrivacySettings } from './privacy-settings';
import { tr } from '../shared/i18n';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('./bridge', () => ({ desktop: {invoke} }));
vi.mock('./analytics-ui', () => ({AnalyticsSettings:()=>null}));
vi.mock('./review/memory-settings', () => ({MemorySettings:()=>null}));
vi.mock('./ai-cli/preferences', () => ({CliPrivacyPreferences:()=>null}));
afterEach(() => {cleanup();vi.resetAllMocks();});
it('commits idle minutes on blur and associates invalid input errors', async () => {
  invoke.mockImplementation(async channel => channel === 'settings:networkActivity' ? [] : {converterIdleMinutes:5,converterOffline:false});
  render(<PrivacySettings/>);
  const field = await screen.findByRole('spinbutton');
  await waitFor(() => expect((field as HTMLInputElement).disabled).toBe(false));
  fireEvent.change(field,{target:{value:'4'}});
  fireEvent.change(field,{target:{value:'45'}});
  expect(invoke.mock.calls.filter(([c]) => c === 'settings:set')).toHaveLength(0);
  fireEvent.blur(field);
  await waitFor(() => expect(invoke.mock.calls.filter(([c]) => c === 'settings:set')).toHaveLength(1));
  fireEvent.change(field,{target:{value:'99'}});
  const error = screen.getByText(tr('settings:idle_range'));
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(field.getAttribute('aria-describedby')).toBe(error.id);
});
