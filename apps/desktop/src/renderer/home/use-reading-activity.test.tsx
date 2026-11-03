// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReadingActivity } from './use-reading-activity';
import type { Document } from '../../shared';
const invoke = vi.hoisted(() => vi.fn().mockResolvedValue({ok:true}));
vi.mock('../bridge', () => ({desktop:{invoke}}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('counts only visible reading with recent interaction, caps heartbeats and cleans up', async () => {
  vi.useFakeTimers(); vi.spyOn(document,'hasFocus').mockReturnValue(true);
  Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
  const host=document.createElement('div'),root=createRoot(host);
  function Reader({visible}:{visible:boolean}) { useReadingActivity('00000000-0000-4000-8000-000000000001' as Document['id'],visible); return null; }
  try {
    await act(async()=>root.render(<Reader visible/>));
    await act(async()=>vi.advanceTimersByTime(60_000)); expect(invoke).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('keydown'));
    await act(async()=>vi.advanceTimersByTime(60_000));
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls.every(call=>call[1].seconds===15)).toBe(true);
    Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});
    window.dispatchEvent(new Event('keydown'));
    await act(async()=>vi.advanceTimersByTime(60_000)); expect(invoke).toHaveBeenCalledTimes(2);
    await act(async()=>root.render(<Reader visible={false}/>));
    await act(async()=>vi.advanceTimersByTime(60_000)); expect(invoke).toHaveBeenCalledTimes(2);
  } finally { await act(async()=>root.unmount()); vi.useRealTimers(); vi.restoreAllMocks(); }
});
