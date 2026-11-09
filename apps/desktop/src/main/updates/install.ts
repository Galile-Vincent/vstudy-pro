import type {EventEmitter} from 'node:events';
export function cancellableInstall(updater: {quitAndInstall: () => void}, native: EventEmitter | undefined) {
  let pending: (() => void)[] = [];
  let cancelled = false;
  const quitAndInstall = updater.quitAndInstall.bind(updater);
  const cancelInstall = () => {
    cancelled = true;
    for (const listener of pending) native?.removeListener('update-downloaded', listener);
    pending = [];
  };
  return {
    cancelInstall,
    quitAndInstall: () => {
      cancelInstall(); cancelled = false;
      const prior = native?.listeners('update-downloaded') ?? [];
      try { quitAndInstall(); }
      finally {
        pending = (native?.listeners('update-downloaded') ?? [])
          .filter(listener => !prior.includes(listener)) as (() => void)[];
        if (cancelled) cancelInstall();
      }
    },
  };
}
