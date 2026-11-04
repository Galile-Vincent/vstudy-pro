// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AnimatedText } from './animated-text';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.useRealTimers(); });
it('keeps a stable accessible phrase and reserves all visual text with reduced motion', async () => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener:vi.fn(), removeEventListener:vi.fn() });
  const host = document.createElement('div'); const root = createRoot(host);
  await act(async () => root.render(<AnimatedText texts={['First question', 'Longer second question']} variant="typewriter"/>));
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(host.querySelector('.motion-sr')?.textContent).toBe('First question');
  expect(host.querySelectorAll('[aria-hidden="true"] span')).toHaveLength(2);
  expect(host.querySelector('.motion-current')?.textContent).toBe('First question');
  await act(async () => root.unmount());
});
it('stops rotating after three cycles and pauses on hover', async () => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockReturnValue({ matches:false, addEventListener:vi.fn(), removeEventListener:vi.fn() });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<AnimatedText texts={['One','Two']}/>));
  await act(async () => host.firstElementChild!.dispatchEvent(new MouseEvent('mouseover', { bubbles:true })));
  await act(async () => vi.advanceTimersByTime(6500));
  expect(host.querySelector('.motion-current')?.textContent).toBe('One');
  await act(async () => host.firstElementChild!.dispatchEvent(new MouseEvent('mouseout', { bubbles:true })));
  for (let i=0;i<5;i++) await act(async () => vi.advanceTimersByTime(6500));
  expect(host.querySelector('.motion-current')?.textContent).toBe('Two');
  await act(async () => vi.advanceTimersByTime(65000));
  expect(host.querySelector('.motion-current')?.textContent).toBe('Two');
  await act(async () => root.unmount()); host.remove();
});
it('keeps the complete static phrase when matchMedia is unavailable', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', undefined);
  const host = document.createElement('div'); const root = createRoot(host);
  try {
    await act(async () => root.render(<AnimatedText texts={['One','Two']}/>));
    expect(host.querySelector('.motion-current')?.textContent).toBe('One');
    expect(vi.getTimerCount()).toBe(0);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
