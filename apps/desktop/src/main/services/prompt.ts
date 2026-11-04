export function coalescePrompt<T, R>(show: (options: T) => Promise<R>) {
  const pending = new Map<string, Promise<R>>();
  return (options: T): Promise<R> => {
    const key = JSON.stringify(options);
    const existing = pending.get(key);
    if (existing) return existing;
    const result = show(options).finally(() => pending.delete(key));
    pending.set(key, result);
    return result;
  };
}
