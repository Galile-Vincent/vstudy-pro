// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { UpdateSettings } from './updates';
const state = vi.hoisted(() => ({invoke:vi.fn(),snapshot:{state:{status:'idle'},currentVersion:'0.4.5',lastCheckedAt:null,automatic:true}}));
vi.mock('../bridge', () => ({desktop:{invoke:state.invoke}}));
vi.mock('../shell/update-row', () => ({useUpdates:() => state.snapshot}));
afterEach(cleanup);
it('shows version and last check and routes the automatic switch and manual check', () => {
  state.invoke.mockResolvedValue(state.snapshot);
  render(<UpdateSettings />);
  expect(screen.getByText(/0.4.5/)).toBeTruthy();
  const toggle = screen.getByRole('switch');
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  fireEvent.click(toggle);
  expect(state.invoke).toHaveBeenCalledWith('updates:setAuto',{enabled:false});
  fireEvent.click(screen.getByRole('button'));
  expect(state.invoke).toHaveBeenCalledWith('updates:check',{});
});
