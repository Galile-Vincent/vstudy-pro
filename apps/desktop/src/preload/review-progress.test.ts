import { expect, it, vi } from 'vitest';
const { listeners, desktop, send } = vi.hoisted(() => ({ listeners: new Map<string, (event: unknown, payload: unknown) => void>(), desktop: { value: undefined as unknown }, send: vi.fn() }));
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: (_key: string, value: unknown) => { desktop.value = value; } }, ipcRenderer: { send, on: (channel: string, listener: (event: unknown, payload: unknown) => void) => { listeners.set(channel, listener); }, removeListener: (channel: string) => { listeners.delete(channel); } }, webUtils: {} }));
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
    const api = desktop.value as {
        onDraftFlushRequest(listener: () => Promise<'clean' | 'pending'>): () => void;
    };
    for (const status of ['clean', 'pending', 'reject'] as const) {
        api.onDraftFlushRequest(async () => {
            if (status === 'reject') throw new Error('offline');
            return status;
        });
        listeners.get('review:drafts-flush')?.({}, payload.requestId);
        await vi.waitFor(() => expect(send).toHaveBeenLastCalledWith('review:drafts-flushed', {
            requestId: payload.requestId, status: status === 'reject' ? 'pending' : status,
        }));
    }
    unsubscribe();
    expect(listeners.has('review:progress')).toBe(false);
}
finally {
    vi.unstubAllGlobals();
    Object.defineProperty(process, 'isMainFrame', { value: original, configurable: true });
} });
