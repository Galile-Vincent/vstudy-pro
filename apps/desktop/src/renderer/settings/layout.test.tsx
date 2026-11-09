// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SettingsRow } from './layout';
afterEach(cleanup);
it('associates the visible row label with its control', () => {
  render(<SettingsRow label="Idle minutes"><input type="number" /></SettingsRow>);
  expect(screen.getByLabelText('Idle minutes')).toBe(screen.getByRole('spinbutton'));
  expect(screen.queryByRole('group')).toBeNull();
});

it('names rows containing only plain buttons as a group', () => {
  render(<SettingsRow label="Converter mode"><button>Enable downloads</button><button>Offline</button></SettingsRow>);
  expect(screen.getByRole('group',{name:'Converter mode'})).toBe(screen.getByRole('button',{name:'Offline'}).parentElement?.parentElement);
});
