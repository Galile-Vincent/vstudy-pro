type Recovery = { deadline: number; message: string; restore: () => Promise<void> };
let entries: Recovery[] = [];
const listeners = new Set<() => void>();
function publish() { listeners.forEach(listener => listener()); }
export const recovery = {
  reset() { entries = []; publish(); },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  snapshot: () => entries,
  add(message: string, restore: () => Promise<void>, deadline = Date.now() + 30000) {
    if (deadline <= Date.now()) return;
    const entry = { message, restore, deadline };
    entries = [...entries, entry];
    setTimeout(() => {
      entries = entries.filter(value => value !== entry);
      publish();
    }, deadline - Date.now());
    publish();
  },
  async undo() {
    const entry = entries.filter(value => value.deadline > Date.now()).at(-1);
    if (!entry) return;
    try { await entry.restore(); }
    finally {
      entries = entries.filter(value => value !== entry);
      publish();
    }
  },
};
