// @vitest-environment jsdom
import { version } from '../../package.json';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { defaultSettings } from '../shared';
import { ProviderSettings } from './providers';
vi.mock('./bridge', () => ({ desktop: { invoke: vi.fn(async (channel: string) => channel === 'updates:state'
  ? {state:{status:'idle'},currentVersion:version,lastCheckedAt:null,automatic:true} : defaultSettings) } }));
vi.mock('./shell', () => ({ useOptionalNavigation: () => null }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
beforeEach(() => { vi.useFakeTimers(); host=document.createElement('div'); document.body.append(host); root=createRoot(host); });
afterEach(async () => { await act(async()=>root.unmount()); host.remove(); vi.useRealTimers(); });
async function mount() { const onClose=vi.fn(); await act(async()=>root.render(<ProviderSettings providers={[]} onClose={onClose} onRefresh={async()=>{}} />)); return onClose; }
async function close() { await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Close settings"]')!.click()); }
it('keeps the owner mounted until the dialog exit ends', async()=>{
  const onClose=await mount(); await close();
  expect(onClose).not.toHaveBeenCalled(); expect(host.querySelector('dialog')).not.toBeNull();
  await act(async()=>vi.advanceTimersByTime(159)); expect(onClose).not.toHaveBeenCalled();
  await act(async()=>vi.advanceTimersByTime(1)); expect(onClose).toHaveBeenCalledOnce();
  await act(async()=>vi.advanceTimersByTime(300)); expect(onClose).toHaveBeenCalledOnce();
});
it('also delays dismissal requested by the dialog and cancels completion on unmount', async()=>{
  const onClose=await mount();
  await act(async()=>{host.querySelector('dialog')!.dispatchEvent(new Event('cancel',{cancelable:true}));}); expect(onClose).not.toHaveBeenCalled();
  await act(async()=>root.render(null)); await act(async()=>vi.advanceTimersByTime(300));
  expect(onClose).not.toHaveBeenCalled();
});

it('shows the version and beta badge in General settings', async () => {
  await mount();
  expect(host.querySelector('.app-version')?.textContent).toBe(`v${version} beta`);
});
it('scrolls the selected tab into view on mount and change', async () => {
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:scroll});
  await mount();
  expect(scroll).toHaveBeenCalled();
  scroll.mockClear();
  await act(() => [...host.querySelectorAll<HTMLElement>('[role=tab]')].find(tab=>tab.textContent?.includes('Privacy'))!.click());
  expect(scroll).toHaveBeenCalled();
});
