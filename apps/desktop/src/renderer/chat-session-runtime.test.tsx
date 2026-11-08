// @vitest-environment jsdom
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ChatSessionHost, useChatSession } from './chat-session-host';
const navigation=vi.hoisted(()=>({tabs:{tabs:[{id:'one'}]}}));
vi.mock('./shell',()=>({useNavigate:()=>navigation}));
it('runs the real Assistant UI runtime without a visible chat and releases it after completion',async()=>{
  let finish=()=>{};
  const gate=new Promise<void>(resolve=>{finish=resolve;});
  let signal:AbortSignal | undefined;
  const dispose=vi.fn();
  const connection={adapter:{async *run({abortSignal}:{abortSignal:AbortSignal}){signal=abortSignal;yield {content:[{type:'text' as const,text:'First'}]};await gate;yield {content:[{type:'text' as const,text:'Complete'}]};}},dispose};
  function Page(){
    const {runtime}=useChatSession('conversation','one',connection,{});
    return runtime?<button onClick={()=>runtime.thread.append('Question')}>Send</button>:null;
  }
  const view=render(<ChatSessionHost><Page/></ChatSessionHost>);
  fireEvent.click(await view.findByText('Send'));
  await waitFor(()=>expect(signal).toBeDefined());
  view.rerender(<ChatSessionHost><p>Other tab</p></ChatSessionHost>);
  expect(signal?.aborted).toBe(false);expect(dispose).not.toHaveBeenCalled();
  await act(async()=>finish());
  await waitFor(()=>expect(dispose).toHaveBeenCalledOnce());
  view.unmount();
});
it('aborts the real running adapter when the owning tab closes',async()=>{
  let finish=()=>{};
  const gate=new Promise<void>(resolve=>{finish=resolve;});
  let signal:AbortSignal | undefined;
  const connection={adapter:{async *run({abortSignal}:{abortSignal:AbortSignal}){signal=abortSignal;yield {content:[]};await gate;}},dispose:vi.fn()};
  navigation.tabs={tabs:[{id:'one'}]};
  function Page(){const {runtime}=useChatSession('conversation','one',connection,{});return runtime?<button onClick={()=>runtime.thread.append('Question')}>Send</button>:null;}
  const view=render(<ChatSessionHost><Page/></ChatSessionHost>);
  fireEvent.click(await view.findByText('Send'));await waitFor(()=>expect(signal).toBeDefined());
  navigation.tabs={tabs:[{id:'two'}]};
  view.rerender(<ChatSessionHost><p>Other tab</p></ChatSessionHost>);
  await waitFor(()=>expect(signal?.aborted).toBe(true));expect(connection.dispose).toHaveBeenCalledOnce();
  await act(async()=>finish());view.unmount();
});
