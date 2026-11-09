export function waitForUpdateWork(work: () => Promise<void>, signal: AbortSignal) {
  return new Promise<'idle' | 'timeout' | 'cancelled'>((resolve, reject) => {
    const finish = (result: 'idle' | 'timeout' | 'cancelled') => {
      clearTimeout(timer); signal.removeEventListener('abort', cancel); resolve(result);
    };
    const cancel = () => finish('cancelled');
    const timer = setTimeout(() => finish('timeout'), 30_000);
    signal.addEventListener('abort', cancel, {once:true});
    if (signal.aborted) cancel();
    else void work().then(() => finish('idle'), error => {
      clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(error);
    });
  });
}
