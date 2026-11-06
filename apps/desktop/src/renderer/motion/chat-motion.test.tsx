// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { useChatMotion } from './chat-motion';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('suppresses restored message entrances while preserving new messages across streamed updates', async()=>{
  const history=[{id:'restored'}];
  function Thread({text}: {text: string}) {const ref=useChatMotion(history);return <div ref={ref}><article data-message-id="restored">Old answer</article><article data-message-id="new">{text}</article></div>;}
  const host=document.createElement('div'); document.body.append(host);const root=createRoot(host);
  try {
    await act(async()=>root.render(<Thread text="New"/>));
    expect(host.querySelector('[data-message-id=restored]')?.classList.contains('chat-restored-message')).toBe(true);
    expect(host.querySelector('[data-message-id=new]')?.classList.contains('chat-restored-message')).toBe(false);
    await act(async()=>root.render(<Thread text="New answer streamed"/>));
    expect(host.querySelector('[data-message-id=new]')?.classList.contains('chat-restored-message')).toBe(false);
  } finally {await act(async()=>root.unmount());host.remove();}
});
