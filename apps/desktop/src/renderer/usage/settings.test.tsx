// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { defaultSettings } from '../../shared';
import { UsageSettings } from './settings';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('./dashboard', () => ({ UsageDashboard: () => null }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it('labels the budget fields and saves their values', async () => {
  invoke.mockImplementation(async (channel: string, value: unknown) =>
    channel === 'settings:get' ? defaultSettings : channel === 'settings:set' ? value : [],
  );
  const { container } = render(<UsageSettings />);
  await act(async () => {});
  const budget = screen.getByLabelText('Monthly budget (USD)') as HTMLInputElement;
  const cap = screen.getByLabelText('Monthly token cap') as HTMLInputElement;
  const warn = screen.getByLabelText('Warn at (%)') as HTMLInputElement;
  expect([budget.type, cap.type, warn.type]).toEqual(['number', 'number', 'number']);
  expect(container.querySelector('[data-slot=form-field]')).not.toBeNull();
  fireEvent.change(budget, { target: { value: '12.5' } });
  fireEvent.change(cap, { target: { value: '5000' } });
  fireEvent.change(warn, { target: { value: '70' } });
  expect(screen.getByLabelText('Price overrides (USD per 1M tokens)')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save usage settings' }));
  await act(async () => {});
  expect(invoke).toHaveBeenCalledWith(
    'settings:set',
    expect.objectContaining({ monthlyBudgetUsd: 12.5, monthlyTokenBudget: 5000, warnAtPercent: 70 }),
  );
  expect(screen.getByRole('status').textContent).toBe('Usage settings saved');
  expect(container.querySelector('h1, main')).toBeNull();
});
