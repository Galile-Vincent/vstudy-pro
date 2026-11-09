// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSidebarOverlay } from './use-sidebar-overlay';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
let resize: () => void;
const observe = vi.fn();
const close = vi.fn();
function Frame() {
  const overlay = useSidebarOverlay(close, true);
  return <div className="app-shell" data-view="workspace" data-sidebar-overlay={overlay}>
    <aside className="shell-sidebar"><button id="inside">Inside</button><input /></aside>
    <main className="shell-main"><input id="search" /></main>
  </div>;
}
beforeEach(() => {
  close.mockClear(); observe.mockClear();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe = observe;
    unobserve() {}
    disconnect() {}
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals();
  document.querySelectorAll('style[data-test]').forEach(style => style.remove());
});
async function mountOverlay() {
  const style = document.createElement('style'); style.dataset.test = '';
  style.textContent = '.shell-sidebar { position:absolute; }'; document.head.append(style);
  await act(() => root.render(<Frame />)); close.mockClear();
}
it('observes chrome that mounts later and tracks its resizing', async () => {
  await mountOverlay();
  const topbar = document.createElement('header'); topbar.className = 'shell-topbar';
  let bottom = 70;
  topbar.getClientRects = () => [{}] as unknown as DOMRectList;
  topbar.getBoundingClientRect = () => ({ bottom }) as DOMRect;
  await act(async () => { host.querySelector('.shell-main')!.append(topbar); });
  expect(observe).toHaveBeenCalledWith(topbar);
  expect(host.querySelector<HTMLElement>('.shell-sidebar')!.style.getPropertyValue('--sidebar-overlay-top')).toBe('70px');
  bottom = 95; await act(() => resize());
  expect(host.querySelector<HTMLElement>('.shell-sidebar')!.style.getPropertyValue('--sidebar-overlay-top')).toBe('95px');
});
