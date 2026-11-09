// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { UpdateSnapshot } from '../../shared/updates';
import { UpdateRow } from './update-row';
const mock = vi.hoisted(() => ({invoke:vi.fn(),listener:undefined as ((s:UpdateSnapshot)=>void)|undefined}));
vi.mock('../bridge', () => ({desktop:{invoke:mock.invoke,onUpdateState:(fn:(s:UpdateSnapshot)=>void) => {mock.listener=fn;return () => {mock.listener=undefined;};}}}));
afterEach(() => {cleanup();vi.clearAllMocks();});
function start(state:UpdateSnapshot['state']) {
  mock.invoke.mockResolvedValue({state,currentVersion:'0.4.4',automatic:true,lastCheckedAt:null});
  return render(<UpdateRow />);
}
it('keeps one live region while idle and renders no row', async () => {
  const {container} = start({status:'idle'});
  await waitFor(() => expect(mock.invoke).toHaveBeenCalled());
  expect(screen.queryByTestId('update-row')).toBeNull();
  expect(container.querySelectorAll('[aria-live=polite]').length).toBe(1);
});
it('downloads, exposes notes, announces progress, then offers restart', async () => {
  const view = start({status:'available',version:'0.4.5',releaseUrl:'https://github.com/ava-apple/vstudy-pro/releases/tag/v0.4.5'});
  const button = await screen.findByRole('button',{name:/0.4.5/});
  fireEvent.click(button); expect(mock.invoke).toHaveBeenCalledWith('updates:download',{});
  fireEvent.click(screen.getAllByRole('button')[1]!); expect(mock.invoke).toHaveBeenCalledWith('updates:notes',{});
  const live = view.container.querySelector('[aria-live]');
  mock.listener?.({state:{status:'downloading',percent:42},currentVersion:'0.4.4',automatic:true,lastCheckedAt:null});
  await screen.findByRole('progressbar');
  expect(view.container.querySelector('[aria-live]')).toBe(live);
  mock.listener?.({state:{status:'ready',version:'0.4.5'},currentVersion:'0.4.4',automatic:true,lastCheckedAt:null});
  await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
  fireEvent.click(screen.getByRole('button'));expect(mock.invoke).toHaveBeenCalledWith('updates:install',{});
});
it('keeps checking focus and hides unsupported sidebar state',async () => {
  start({status:'checking'});
  const button = await screen.findByRole('button');
  expect(button.getAttribute('aria-disabled')).toBe('true');
  expect((button as HTMLButtonElement).disabled).toBe(false);
});
it('does not show unsupported in the sidebar',async () => {
  start({status:'unsupported',reason:'unsigned'});
  await waitFor(()=>expect(mock.invoke).toHaveBeenCalled());
  expect(screen.queryByTestId('update-row')).toBeNull();
});
