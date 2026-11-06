// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useBudgetGuard } from './meter';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const settings = { monthlyBudgetUsd: 1 };
const data = { settings } as never;
function mockUsage(costUsd: number, spent: number) {
  invoke.mockImplementation(async (channel: string) => {
    if (channel === 'usage:estimate') return { inputTokens: 10, outputTokens: 10, costUsd };
    if (channel === 'usage:summary') return { costUsd: spent, tokens: 0 };
    if (channel === 'settings:get') return settings;
    return {};
  });
}
it('sends a programmatic message straight away when no budget is set', () => {
  const send = vi.fn();
  const { result } = renderHook(() => useBudgetGuard({ settings: {} } as never, 'chat' as never, ''));
  act(() => result.current.guardSend('Just answer', send));
  expect(send).toHaveBeenCalledOnce();
  expect(invoke).not.toHaveBeenCalled();
});
it('estimates the programmatic message and sends it when it fits the budget', async () => {
  mockUsage(0.01, 0);
  const send = vi.fn();
  const { result } = renderHook(() => useBudgetGuard(data, 'chat' as never, 'a long unsent draft'));
  act(() => result.current.guardSend('Just answer', send));
  await waitFor(() => expect(send).toHaveBeenCalledOnce());
  expect(invoke).toHaveBeenCalledWith('usage:estimate', { conversationId: 'chat', userMessage: 'Just answer' });
});
it('holds the programmatic message at the budget warning until the student approves or dismisses it', async () => {
  mockUsage(5, 0.9);
  const send = vi.fn();
  const { result } = renderHook(() => useBudgetGuard(data, 'chat' as never, ''));
  act(() => result.current.guardSend('Just answer', send));
  await waitFor(() => expect(result.current.warning).toBe(true));
  expect(send).not.toHaveBeenCalled();
  act(() => result.current.dismiss());
  expect(send).not.toHaveBeenCalled();
  act(() => result.current.guardSend('Just answer', send));
  await waitFor(() => expect(result.current.warning).toBe(true));
  act(() => result.current.approve());
  expect(send).toHaveBeenCalledOnce();
});
it('does not send when the budget cannot be checked', async () => {
  invoke.mockRejectedValue(new Error('offline'));
  const send = vi.fn();
  const { result } = renderHook(() => useBudgetGuard(data, 'chat' as never, ''));
  act(() => result.current.guardSend('Just answer', send));
  await waitFor(() => expect(result.current.warning).toBe(true));
  expect(send).not.toHaveBeenCalled();
});
