// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HistorySwipeNavigation } from './history-swipe-navigation';
const bridge = vi.hoisted(() => ({ begin: () => {}, end: () => {} }));
vi.mock('../bridge', () => ({ desktop: {
  onTrackpadScrollBegin: (listener: () => void) => { bridge.begin = listener; return vi.fn(); },
  onTrackpadScrollEnd: (listener: () => void) => { bridge.end = listener; return vi.fn(); },
} }));
let root: Root, host: HTMLDivElement;
const navigate = vi.fn();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); navigate.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function mount(canGoBack = true) {
  await act(async () => root.render(<HistorySwipeNavigation canGoBack={canGoBack} canGoForward onNavigate={navigate} />));
}
async function wheel(x: number, target: Element = host, extra: WheelEventInit = {}) {
  await act(async () => { target.dispatchEvent(new WheelEvent('wheel', { deltaX: x, bubbles: true, ...extra })); vi.advanceTimersByTime(17); });
}
it('peeks from the left, arms, and fades on native release without navigating twice', async () => {
  await mount(); bridge.begin(); await wheel(-70);
  const node = host.querySelector<HTMLElement>('.history-swipe-viewport')!;
  expect(node.dataset.tracking).toBe('true'); expect(node.dataset.armed).toBe('false');
  expect((node.firstElementChild as HTMLElement).style.transform).toContain('-67.');
  await wheel(-65); expect(node.dataset.armed).toBe('true'); expect(navigate).not.toHaveBeenCalled();
  bridge.end(); await act(async () => { vi.advanceTimersByTime(17); });
  expect(navigate).toHaveBeenCalledWith('back'); expect(node.dataset.tracking).toBe('false');
  expect((node.firstElementChild as HTMLElement).style.opacity).toBe('0');
  await wheel(-300); bridge.end(); expect(navigate).toHaveBeenCalledTimes(1);
});
it('never shows an indicator at the first entry and never commits a short gesture', async () => {
  await mount(false); bridge.begin(); await wheel(-150); bridge.end();
  expect(host.querySelector<HTMLElement>('.history-swipe-viewport')!.dataset.tracking).toBe('false');
  expect(navigate).not.toHaveBeenCalled();
  bridge.begin(); await wheel(80); bridge.end(); expect(navigate).not.toHaveBeenCalled();
});
it.each(['dialog', 'scroller', 'shadow-scroller', 'editable', 'pinch', 'line-mode', 'vertical'])('leaves %s alone', async kind => {
  await mount();
  let target: Element = host;
  if (kind === 'dialog') { const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); host.append(dialog); }
  if (kind.includes('scroller')) {
    const panel = document.createElement('div'); host.append(panel);
    const scroller = document.createElement('div'); scroller.style.overflowX = 'auto';
    (kind.startsWith('shadow') ? panel.attachShadow({ mode: 'open' }) : panel).append(scroller);
    Object.defineProperties(scroller, { scrollWidth: { value: 800 }, clientWidth: { value: 200 } }); scroller.scrollLeft = 200;
    target = scroller;
    scroller.dispatchEvent(new Event('pointermove', { bubbles: true, composed: true }));
  }
  if (kind === 'editable') { const input = document.createElement('textarea'); host.append(input); input.focus(); target = input; }
  bridge.begin(); await wheel(-140, target, { composed: true, ctrlKey: kind === 'pinch', deltaMode: kind === 'line-mode' ? 1 : 0, deltaY: kind === 'vertical' ? 200 : 0 }); bridge.end();
  expect(navigate).not.toHaveBeenCalled();
});
it('finishes with the idle fallback when native boundaries are unavailable', async () => {
  await mount(); await wheel(135); await act(async () => { vi.advanceTimersByTime(160); });
  expect(navigate).toHaveBeenCalledWith('forward');
});

it('locks from accumulated intent before deciding whether a scroller can consume it', async () => {
  await mount();
  const scroller = document.createElement('div'); scroller.style.overflowX = 'auto'; host.append(scroller);
  Object.defineProperties(scroller, { scrollWidth: { value: 800 }, clientWidth: { value: 200 } });
  scroller.dispatchEvent(new Event('pointermove', { bubbles: true }));
  bridge.begin(); await wheel(0, scroller, { deltaY: 2 }); await wheel(-130, scroller); bridge.end();
  expect(navigate).toHaveBeenCalledWith('back');
});
