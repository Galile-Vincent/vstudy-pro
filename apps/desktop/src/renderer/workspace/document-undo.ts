import { useSyncExternalStore } from 'react';
import type { Document } from '../../shared';

type PendingUndo = { documentId: Document['id']; message: string };
let pending: PendingUndo | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => pending;

export function setDocumentUndo(value: PendingUndo | null) {
  clearTimeout(timer);
  pending = value;
  timer = value ? setTimeout(() => setDocumentUndo(null), 30000) : undefined;
  listeners.forEach(listener => listener());
}

export function useDocumentUndo() {
  return useSyncExternalStore(subscribe, snapshot);
}
