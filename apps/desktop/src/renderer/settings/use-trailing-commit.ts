import { useEffect, useRef } from 'react';

export function useTrailingCommit() {
  const pending = useRef(new Map<string, {timer:ReturnType<typeof setTimeout>;save:()=>void}>());
  const flush = (key?: string) => {
    for (const [id, entry] of pending.current) {
      if (key !== undefined && key !== id) continue;
      clearTimeout(entry.timer);
      pending.current.delete(id);
      entry.save();
    }
  };
  useEffect(() => () => flush(), []);
  return {
    flush,
    schedule(key: string, save: () => void) {
      clearTimeout(pending.current.get(key)?.timer);
      pending.current.set(key, {save,timer:setTimeout(()=>flush(key),400)});
    },
  };
}
