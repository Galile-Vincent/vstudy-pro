import { randomUUID } from 'node:crypto';

type Outcome = 'flushed' | 'timeout' | 'unavailable';

/** Asks the renderer to write its pending drafts and waits, within a bound, for it to say so. */
export function createDraftFlush(
  io: { send(requestId: string): boolean; listen(acknowledged: (requestId: string) => void): () => void },
  timeoutMs = 2000,
): () => Promise<Outcome> {
  return () => new Promise<Outcome>(resolve => {
    const requestId = randomUUID();
    let settled = false;
    let stop = () => {};
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    const finish = (outcome: Outcome) => {
      if (settled) return;
      settled = true; clearTimeout(timer); stop(); resolve(outcome);
    };
    stop = io.listen(id => { if (id === requestId) finish('flushed'); });
    if (!io.send(requestId)) finish('unavailable');
  });
}
