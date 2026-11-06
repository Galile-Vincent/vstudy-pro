import { useLayoutEffect, useRef } from 'react';

export function useChatMotion(history: readonly { id: string }[]) {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const restored = new Set(history.map(message => message.id));
    const mark = () => root.querySelectorAll<HTMLElement>('[data-message-id]').forEach(message => {
      message.classList.toggle('chat-restored-message', restored.has(message.dataset.messageId ?? ''));
    });
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(root, { childList:true, subtree:true });
    return () => observer.disconnect();
  }, [history]);
  return container;
}
