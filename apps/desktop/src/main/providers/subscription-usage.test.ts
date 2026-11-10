import { expect, it, vi } from 'vitest';
import { parseClaudeWindows, parseCodexWindows } from './subscription-windows';
import { createSubscriptionReader } from './subscription-usage';

it('preserves both Codex windows and validates external values', () => {
  expect(parseCodexWindows({ rateLimits: { primary: { usedPercent: 28, windowDurationMins: 300, resetsAt: 1793715000 }, secondary: { usedPercent: 72, windowDurationMins: 10080 } } })).toEqual([
    { label: '5h', usedPercent: 28, resetsAt: '2026-11-03T14:10:00.000Z' }, { label: 'weekly', usedPercent: 72, resetsAt: null },
  ]);
  expect(parseCodexWindows({ rateLimits: { primary: { usedPercent: 0, windowDurationMins: 60 } } })).toEqual([]);
  expect(() => parseCodexWindows({ rateLimits: { primary: { usedPercent: 101 } } })).toThrow();
});
it('maps Claude percentages without scaling them and preserves missing windows', () => {
  expect(parseClaudeWindows({ five_hour: { utilization: 0, resets_at: '2026-11-09T08:00:00+08:00' }, seven_day: { utilization: 52 } })).toEqual([
    { label: '5h', usedPercent: 0, resetsAt: '2026-11-09T00:00:00.000Z' }, { label: 'weekly', usedPercent: 52, resetsAt: null },
  ]);
  expect(parseClaudeWindows({ five_hour: null })).toEqual([]);
  expect(() => parseClaudeWindows({ seven_day: { utilization: -1 } })).toThrow();
  expect(() => parseClaudeWindows({ five_hour: { utilization: 1, resets_at: 'bad' } })).toThrow();
});
it('deduplicates requests, caches success, retains stale data and backs off failures', async () => {
  let now = 1793715000000;
  let fail = false;
  const load = vi.fn(async () => {
    if (fail) throw new Error('offline');
    return { status: 'ready' as const, windows: [{ label: '5h' as const, usedPercent: 42, resetsAt: null }] };
  });
  const read = createSubscriptionReader(load, () => now);
  const [first, concurrent] = await Promise.all([read(), read()]);
  expect(concurrent).toEqual(first);
  expect(load).toHaveBeenCalledTimes(2);
  await read();
  expect(load).toHaveBeenCalledTimes(2);
  now += 60001; fail = true;
  const stale = await read();
  expect(stale[0]).toMatchObject({ status: 'stale', windows: first[0]!.windows, fetchedAt: first[0]!.fetchedAt });
  expect(Date.parse(stale[0]!.nextRefreshAt) - now).toBe(120000);
  await read({ refresh: true });
  expect(load).toHaveBeenCalledTimes(4);
  now += 120001;
  const retry = await read();
  expect(Date.parse(retry[0]!.nextRefreshAt) - now).toBe(240000);
  now += 240001; fail = false;
  expect((await read())[0]!.status).toBe('ready');
});
it('only enables keychain reads after explicit consent and clears unavailable data on sign-out', async () => {
  const load = vi.fn(async () => ({ status: 'not-signed-in' as const, windows: [] }));
  const read = createSubscriptionReader(load);
  await read();
  expect(load).toHaveBeenCalledWith('claude', false);
  await read({ allowClaudeKeychain: true });
  expect(load).toHaveBeenCalledWith('claude', true);
  expect((await read())[0]).toMatchObject({ status: 'not-signed-in', windows: [], fetchedAt: null });
});

it('does not run Codex when its integration is disabled', async () => {
  const load = vi.fn(async () => ({ status: 'not-signed-in' as const, windows: [] }));
  const read = createSubscriptionReader(load, Date.now, () => false);
  expect((await read())[1]).toMatchObject({ provider: 'codex', status: 'unsupported', windows: [] });
  expect(load).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledWith('claude', false);
});

it('starts a new load when consent changes during a pending request and its result wins', async () => {
  const settle: Record<string, (r: { status: 'ready' | 'unavailable'; windows: never[] }) => void> = {};
  const load = vi.fn((provider: string, consent: boolean) =>
    new Promise<{ status: 'ready' | 'unavailable'; windows: never[] }>((resolve) => {
      settle[`${provider}:${consent}`] = resolve;
    }),
  );
  const read = createSubscriptionReader(load as never, () => 1793715000000, () => false);
  const early = read();
  const consented = read({ allowClaudeKeychain: true, refresh: true });
  expect(load).toHaveBeenCalledWith('claude', false);
  expect(load).toHaveBeenCalledWith('claude', true);
  settle['claude:true']!({ status: 'ready', windows: [] });
  expect((await consented)[0]).toMatchObject({ status: 'ready' });
  settle['claude:false']!({ status: 'unavailable', windows: [] });
  expect((await early)[0]).toMatchObject({ status: 'unavailable' });
  const calls = load.mock.calls.length;
  expect((await read())[0]).toMatchObject({ status: 'ready' });
  expect(load).toHaveBeenCalledTimes(calls);
});

it('does not reuse a failure cached without consent once consent is granted', async () => {
  const load = vi.fn(async (_provider: string, consent: boolean) =>
    consent
      ? { status: 'ready' as const, windows: [] }
      : { status: 'unavailable' as const, windows: [] },
  );
  const read = createSubscriptionReader(load as never, () => 1793715000000, () => false);
  expect((await read())[0]).toMatchObject({ status: 'unavailable' });
  expect((await read({ allowClaudeKeychain: true }))[0]).toMatchObject({ status: 'ready' });
  expect((await read())[0]).toMatchObject({ status: 'ready' });
});
