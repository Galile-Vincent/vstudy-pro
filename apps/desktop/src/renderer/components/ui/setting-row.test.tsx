// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SettingRow } from './setting-row';
import { useState } from 'react';
import { Switch } from '@astryxdesign/core';
afterEach(cleanup);
it('associates a visible label with an input', () => {
  render(<SettingRow label="Idle minutes" htmlFor="idle"><input id="idle" type="number" /></SettingRow>);
  const input = screen.getByLabelText('Idle minutes');
  expect((screen.getByText('Idle minutes') as HTMLLabelElement).control).toBe(input);
  expect(screen.queryByRole('group')).toBeNull();
});
it('toggles a switch by its visible label', () => {
  function Row() {
    const [on, setOn] = useState(false);
    return <SettingRow label="Analytics" htmlFor="analytics"><Switch label="Analytics" isLabelHidden value={on} onChange={setOn} /></SettingRow>;
  }
  const { container } = render(<Row />);
  fireEvent.click(container.querySelector('label[for=analytics]')!);
  expect((screen.getByRole('switch', {name:'Analytics'}) as HTMLInputElement).checked).toBe(true);
});
it('names a group when no htmlFor is supplied', () => {
  render(<SettingRow label="Actions"><button>Export</button></SettingRow>);
  expect(screen.getByRole('group', {name:'Actions'}).contains(screen.getByRole('button'))).toBe(true);
});
