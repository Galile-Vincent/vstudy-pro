/**
 * Coalesce and settle native confirmation prompts without duplicate dialogs.
 * Owned by main/services.
 * Privileged IO stays in main; callers receive validated domain data rather than raw paths or secrets.
 * @packageDocumentation
 */
/** Share a pending prompt with identical options and release it after either success or failure. */
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
