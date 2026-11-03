// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AssistantRuntimeProvider, ComposerPrimitive, ThreadPrimitive, MessagePrimitive, ErrorPrimitive, ActionBarPrimitive, useLocalRuntime, type ChatModelAdapter } from '@assistant-ui/react';
import { ChatComposerInput } from './chat';
vi.mock('./bridge',()=>({desktop:{invoke:vi.fn().mockRejectedValue(new Error('unused'))}}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
class ResizeObserverMock { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver',ResizeObserverMock);
function Harness({adapter}:{adapter:ChatModelAdapter}) {
 const runtime=useLocalRuntime(adapter);
 return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root><ThreadPrimitive.Messages>{()=> <MessagePrimitive.Root><MessagePrimitive.Error><ErrorPrimitive.Root><ErrorPrimitive.Message/><ActionBarPrimitive.Reload>Retry</ActionBarPrimitive.Reload></ErrorPrimitive.Root></MessagePrimitive.Error></MessagePrimitive.Root>}</ThreadPrimitive.Messages><ComposerPrimitive.Root><ChatComposerInput/><ComposerPrimitive.Send>Send</ComposerPrimitive.Send></ComposerPrimitive.Root></ThreadPrimitive.Root></AssistantRuntimeProvider>;
}
async function type(input:HTMLTextAreaElement,text:string) { await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));}); }
it('suppresses IME Enter through compositionstart/end, keeps Shift+Enter, then sends Enter',async()=>{
 const run=vi.fn(async function*(){yield {content:[{type:'text' as const,text:'done'}]};});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<Harness adapter={{run}}/>));const input=host.querySelector('textarea')!;
 await type(input,'中文');
 await act(async()=>{input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));});
 expect(run).not.toHaveBeenCalled();
 await act(async()=>input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
 await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true})));
 expect(run).not.toHaveBeenCalled();
 await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
 expect(run).toHaveBeenCalledTimes(1);await act(async()=>root.unmount());host.remove();
});
it.each(['auth failed','rate limited','network','provider unavailable','budget'])('shows an inline %s error and Retry',async category=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const adapter:ChatModelAdapter={async *run(){ yield {content:[]}; throw new Error(category); }};
 await act(async()=>root.render(<Harness adapter={adapter}/>));await type(host.querySelector('textarea')!,'hello');
 await act(async()=>host.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
 expect(host.textContent).toContain(category);expect(Array.from(host.querySelectorAll('button')).some(b=>b.textContent==='Retry')).toBe(true);
 await act(async()=>root.unmount());host.remove();
});
it('releases stale composition on blur and after the last composition update expires',async()=>{
 vi.useFakeTimers();
 try {
  const run=vi.fn(async function*(){yield {content:[{type:'text' as const,text:'done'}]};});
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  await act(async()=>root.render(<Harness adapter={{run}}/>));const input=host.querySelector('textarea')!;
  await type(input,'Recovered');
  await act(async()=>{input.focus();input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.blur();input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));});
  expect(run).toHaveBeenCalledTimes(1);
  await type(input,'Recovered again');
  await act(async()=>{input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true}));vi.advanceTimersByTime(1501);input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));});
  expect(run).toHaveBeenCalledTimes(2);
  await act(async()=>root.unmount());host.remove();
 } finally {vi.useRealTimers();}
});
