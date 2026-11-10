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
it('keeps an empty live region mounted and clears check feedback', async () => {
  vi.useFakeTimers();
  try {
    const view = render(<UpdateSettings />);
    const live = screen.getByRole('status');
    expect(live.textContent).toBe('');
    Object.assign(state.snapshot, {result:'current'});
    view.rerender(<UpdateSettings />);
    expect(screen.getByRole('status')).toBe(live);
    expect(live.textContent).not.toBe('');
    await import('@testing-library/react').then(({act}) => act(() => vi.advanceTimersByTimeAsync(5000)));
    expect(live.textContent).toBe('');
  } finally {delete (state.snapshot as {result?:string}).result; vi.useRealTimers();}
});
