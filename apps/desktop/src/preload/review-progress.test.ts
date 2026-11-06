import { expect, it, vi } from 'vitest';
const { listeners, desktop } = vi.hoisted(() => ({ listeners: new Map<string, (event: unknown, payload: unknown) => void>(), desktop: { value: undefined as unknown } }));
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: (_key: string, value: unknown) => { desktop.value = value; } }, ipcRenderer: { on: (channel: string, listener: (event: unknown, payload: unknown) => void) => { listeners.set(channel, listener); }, removeListener: (channel: string) => { listeners.delete(channel); } }, webUtils: {} }));
it('validates review progress and unsubscribes the exact listener', async () => { const original = process.isMainFrame; Object.defineProperty(process, 'isMainFrame', { value: true, configurable: true }); vi.stubGlobal('MutationObserver', class {
    observe() { }
}); vi.stubGlobal('document', {}); vi.stubGlobal('window', { addEventListener() { } }); try {
    await import('./index');
    const receive = vi.fn();
    const unsubscribe = (desktop.value as {
        onReviewProgress: (fn: typeof receive) => () => void;
    }).onReviewProgress(receive);
    listeners.get('review:progress')?.({}, {});
    expect(receive).not.toHaveBeenCalled();
    const payload = { requestId: '10000000-0000-4000-8000-000000000001', artifactId: '10000000-0000-4000-8000-000000000002', stage: 'ready', completed: 1, total: 1, errorCode: null };
    listeners.get('review:progress')?.({}, payload);
    expect(receive).toHaveBeenCalledWith(payload);
    unsubscribe();
    expect(listeners.has('review:progress')).toBe(false);
}
finally {
    vi.unstubAllGlobals();
    Object.defineProperty(process, 'isMainFrame', { value: original, configurable: true });
} });
