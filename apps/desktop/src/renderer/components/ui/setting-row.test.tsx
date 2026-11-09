// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SettingRow } from './setting-row';
import { Switch } from './switch';
afterEach(cleanup);
it('associates a visible label with an input', () => {
  render(<SettingRow label="Idle minutes" htmlFor="idle"><input id="idle" type="number" /></SettingRow>);
  const input = screen.getByLabelText('Idle minutes');
  expect((screen.getByText('Idle minutes') as HTMLLabelElement).control).toBe(input);
  expect(screen.queryByRole('group')).toBeNull();
});
it('toggles a switch by its visible label', () => {
  render(<SettingRow label="Analytics" htmlFor="analytics"><Switch id="analytics" /></SettingRow>);
  fireEvent.click(screen.getByText('Analytics'));
  expect(screen.getByRole('switch', {name:'Analytics'}).getAttribute('aria-checked')).toBe('true');
});
it('names a group when no htmlFor is supplied', () => {
  render(<SettingRow label="Actions"><button>Export</button></SettingRow>);
  expect(screen.getByRole('group', {name:'Actions'}).contains(screen.getByRole('button'))).toBe(true);
});
