// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatSessionHost, useChatSession } from './chat-session-host';
const fixture=vi.hoisted(()=>({tabs:{tabs:[{id:'one'}]},running:false,notify:()=>{},cancel:vi.fn()}));
vi.mock('./shell',()=>({useNavigate:()=>({tabs:fixture.tabs})}));
vi.mock('@assistant-ui/react',async()=>{
  const React=await import('react');
  return {AssistantRuntimeProvider:()=>null,useLocalRuntime:()=>React.useMemo(()=>({thread:{getState:()=>({isRunning:fixture.running}),subscribe:(notify:()=>void)=>{fixture.notify=notify;return()=>{};},cancelRun:fixture.cancel}}),[])};
});
describe('chat session ownership',()=>{
  it('retains a running response after its page unmounts and releases it when idle',async()=>{
    const connection={adapter:{async *run(){yield {content:[]};}},dispose:vi.fn()};
    function Page(){const session=useChatSession('conversation','one',connection,{});return session.runtime?<p>Visible chat</p>:null;}
    fixture.tabs={tabs:[{id:'one'}]};fixture.running=true;
    const view=render(<ChatSessionHost><Page/></ChatSessionHost>);
    await view.findByText('Visible chat');
    view.rerender(<ChatSessionHost><p>Other tab</p></ChatSessionHost>);
    expect(view.queryByText('Visible chat')).toBeNull();expect(connection.dispose).not.toHaveBeenCalled();
    act(()=>{fixture.running=false;fixture.notify();});
    await waitFor(()=>expect(connection.dispose).toHaveBeenCalledOnce());
    view.unmount();
  });
  it('cancels a running response when its owning tab closes',async()=>{
    const connection={adapter:{async *run(){yield {content:[]};}},dispose:vi.fn()};
    function Page(){useChatSession('conversation','one',connection,{});return null;}
    fixture.tabs={tabs:[{id:'one'}]};fixture.running=true;fixture.cancel.mockClear();
    const view=render(<ChatSessionHost><Page/></ChatSessionHost>);
    await waitFor(()=>expect(fixture.notify).toBeTypeOf('function'));
    fixture.tabs={tabs:[{id:'two'}]};
    view.rerender(<ChatSessionHost><p>Other tab</p></ChatSessionHost>);
    await waitFor(()=>expect(connection.dispose).toHaveBeenCalledOnce());
    expect(fixture.cancel).toHaveBeenCalled();view.unmount();
  });
});
