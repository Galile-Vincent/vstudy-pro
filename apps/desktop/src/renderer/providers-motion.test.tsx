// @vitest-environment jsdom
vi.hoisted(() => { Object.defineProperty(window, 'AnimationEvent', { value: Event, configurable: true }); });
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { defaultSettings } from '../shared';
import { ProviderSettings } from './providers';
vi.mock('./bridge', () => ({ desktop: { invoke: vi.fn(async () => defaultSettings) } }));
vi.mock('./shell', () => ({ useOptionalNavigation: () => null }));
vi.mock('./components/ui/dialog', () => ({
  Dialog: ({ open, onOpenChange, children }: {open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode}) => <div data-open={open}><button onClick={() => onOpenChange(false)}>Escape</button>{children}</div>,
  DialogContent: ({children, showCloseButton: _show, ...props}: React.HTMLAttributes<HTMLDivElement> & {showCloseButton: boolean}) => { void _show; return <div {...props}>{children}</div>; },
  DialogTitle: ({children}: {children: React.ReactNode}) => <h2>{children}</h2>,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
beforeEach(() => { vi.useFakeTimers(); host=document.createElement('div'); document.body.append(host); root=createRoot(host); });
afterEach(async () => { await act(async()=>root.unmount()); host.remove(); vi.useRealTimers(); });
async function mount() { const onClose=vi.fn(); await act(async()=>root.render(<ProviderSettings providers={[]} onClose={onClose} onRefresh={async()=>{}} />)); return onClose; }
async function close() { await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Close settings"]')!.click()); }
it('keeps the owner mounted until the dialog exit ends, ignoring child animations', async()=>{
  const onClose=await mount(); await close();
  expect(onClose).not.toHaveBeenCalled(); expect(host.querySelector('[data-open=false]')).not.toBeNull();
  await act(async()=>host.querySelector('h2')!.dispatchEvent(new Event('animationend',{bubbles:true})));
  expect(onClose).not.toHaveBeenCalled();
  await act(async()=>host.querySelector('.settings-dialog')!.dispatchEvent(new Event('animationend',{bubbles:true})));
  expect(onClose).toHaveBeenCalledOnce();
  await act(async()=>vi.advanceTimersByTime(300)); expect(onClose).toHaveBeenCalledOnce();
});
it('finishes closing after 250ms when reduced motion provides no animationend', async()=>{
  const onClose=await mount(); await close();
  expect(onClose).not.toHaveBeenCalled();
  await act(async()=>vi.advanceTimersByTime(249)); expect(onClose).not.toHaveBeenCalled();
  await act(async()=>vi.advanceTimersByTime(1)); expect(onClose).toHaveBeenCalledOnce();
});
it('also delays dismissal requested by the dialog and cancels completion on unmount', async()=>{
  const onClose=await mount();
  await act(async()=>host.querySelector('button')!.click()); expect(onClose).not.toHaveBeenCalled();
  await act(async()=>root.render(null)); await act(async()=>vi.advanceTimersByTime(300));
  expect(onClose).not.toHaveBeenCalled();
});
