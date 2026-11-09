// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Chat } from './chat';
import { i18n, tr } from '../shared/i18n';
import type { ChatEvent, Conversation, Message } from '../shared';
const bridge=vi.hoisted(()=>({invoke:vi.fn(),listener:undefined as ((event:ChatEvent)=>void)|undefined}));
vi.mock('./bridge',()=>({desktop:{invoke:bridge.invoke,onChatEvent:(_id:string,listener:(event:ChatEvent)=>void)=>{bridge.listener=listener;return ()=>{};}}}));
vi.mock('./model-controls',()=>({ModelControls:()=>null}));
vi.mock('./usage/meter',()=>({useUsage:()=>({}),useBudgetGuard:()=>({}),UsageButton:()=>null,UsageMeter:()=>null}));
vi.mock('./components/assistant-ui/elements/thread.aui',async()=>{
  const {ThreadPrimitive,MessagePrimitive,ErrorPrimitive,ComposerPrimitive,useAuiState}=await import('@assistant-ui/react');
  function MessageRow(){const id=useAuiState(state=>state.message.id);return <div data-message-id={id}><MessagePrimitive.Content/></div>;}
  return {Thread:()=> <ThreadPrimitive.Root><ThreadPrimitive.Messages>{()=> <MessagePrimitive.Root><MessageRow/><MessagePrimitive.Error><ErrorPrimitive.Root><ErrorPrimitive.Message/></ErrorPrimitive.Root></MessagePrimitive.Error></MessagePrimitive.Root>}</ThreadPrimitive.Messages><ComposerPrimitive.Root><ComposerPrimitive.Input aria-label="Question"/><ComposerPrimitive.Send>Send</ComposerPrimitive.Send></ComposerPrimitive.Root></ThreadPrimitive.Root>};
});
const conversation={id:'c',scope:'general',providerId:'anthropic-api',modelId:'fake'} as Conversation;
function mount(history:Message[]=[],historyCursor?:{createdAt:string;id:string}|null,jumpMessageId?:string){return render(<Chat jumpMessageId={jumpMessageId} historyCursor={historyCursor} conversation={conversation} history={history} draft="" onDraft={()=>{}} selection={null} onClearSelection={()=>{}} providers={[]} model="anthropic-api/fake" onModel={()=>{}} onSettings={()=>{}} onProvidersChanged={async()=>{}} onUsage={()=>{}}/>);}
afterEach(()=>{cleanup();vi.resetAllMocks();});

const message=(id:string,role='assistant')=>({id,conversationId:'c',role,createdAt:'2026-11-01T00:00:00Z',parts:[{type:'text',text:id}]} as Message);
it('loads successive older pages and scrolls to a search or finder message beyond the newest 50',async()=>{
  await i18n.changeLanguage('en');
  const scroll=vi.fn();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(callback,0));
  vi.stubGlobal('cancelAnimationFrame',clearTimeout);
  Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:scroll});
  bridge.invoke.mockResolvedValueOnce({items:Array.from({length:50},(_,i)=>message('middle-'+i)),nextCursor:{id:'middle-0',createdAt:'2026-11-01T00:00:00Z'}})
    .mockResolvedValueOnce({items:[message('old-target')],nextCursor:null});
  try {
    mount(Array.from({length:50},(_,i)=>message('new-'+i)),{id:'new-0',createdAt:'2026-11-02T00:00:00Z'},'old-target');
    await waitFor(()=>expect(document.activeElement?.getAttribute('data-message-id')).toBe('old-target'));
    expect(scroll).toHaveBeenCalledWith({block:'center',behavior:'instant'});
    expect(bridge.invoke.mock.calls.filter(([channel])=>channel==='messages:page')).toHaveLength(2);
    expect(screen.getByText('new-49')).toBeTruthy();
  }finally{vi.unstubAllGlobals();}
});
it('stops automatic search paging on failure and resumes only after Retry',async()=>{
  await i18n.changeLanguage('en');
  bridge.invoke.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({items:[message('old-target')],nextCursor:null});
  mount([message('recent')],{id:'recent',createdAt:'2026-11-02T00:00:00Z'},'old-target');
  const retry=await screen.findByRole('button',{name:tr('common:retry')});
  expect(bridge.invoke).toHaveBeenCalledTimes(1);
  fireEvent.click(retry);
  expect(await screen.findByText('old-target')).toBeTruthy();
  expect(bridge.invoke).toHaveBeenCalledTimes(2);
});

it('caps a missing search target at five older pages and leaves further loading manual',async()=>{
  await i18n.changeLanguage('en');
  let pages=0;
  bridge.invoke.mockImplementation(async()=>{
    const id='older-'+ ++pages;
    return {items:[message(id)],nextCursor:pages<20?{id,createdAt:'2026-11-01T00:00:00Z'}:null};
  });
  mount([message('recent')],{id:'recent',createdAt:'2026-11-02T00:00:00Z'},'deleted-target');
  const notice=await screen.findByRole('status');
  expect(notice.textContent).toBe(tr('history:message_not_found'));
  expect(pages).toBe(5);
  expect(screen.getByText('recent')).toBeTruthy();
  expect(screen.getByRole('textbox')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:tr('common:load_earlier_messages')}));
  await screen.findByText('older-6');
  expect(pages).toBe(6);
});

it.each([false,true])('reports a missing finder target when the cursor is exhausted (has older page: %s)',async hasOlderPage=>{
  await i18n.changeLanguage('en');
  bridge.invoke.mockResolvedValue({items:[],nextCursor:null});
  mount([message('recent')],hasOlderPage?{id:'recent',createdAt:'2026-11-02T00:00:00Z'}:null,'deleted-target');
  expect((await screen.findByRole('status')).textContent).toBe(tr('history:message_not_found'));
  expect(bridge.invoke).toHaveBeenCalledTimes(hasOlderPage?1:0);
  expect(screen.queryByRole('button',{name:tr('common:load_earlier_messages')})).toBeNull();
  expect(screen.getByText('recent')).toBeTruthy();
});

it('sends explicit branch context once the final earlier page is loaded',async()=>{
  await i18n.changeLanguage('en');
  bridge.invoke.mockImplementation(async channel=>{
    if(channel==='messages:page')return {items:[message('old-question','user'),message('old-answer')],nextCursor:null};
    if(channel==='chat:start')bridge.listener?.({type:'done'});
    return {ok:true};
  });
  mount([message('recent-question','user'),message('recent-answer')],{id:'recent-question',createdAt:'2026-11-02T00:00:00Z'});
  fireEvent.click(screen.getByRole('button',{name:tr('common:load_earlier_messages')}));
  await screen.findByText('old-question');
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Follow up'}});
  fireEvent.click(screen.getByRole('button',{name:'Send'}));
  await waitFor(()=>expect(bridge.invoke).toHaveBeenCalledWith('chat:start',expect.objectContaining({contextTurnIds:['old-question','recent-question']})));
});

it('moves focus to the first newly loaded message when the final page removes the button', async () => {
  await i18n.changeLanguage('en');
  bridge.invoke.mockResolvedValue({items: [message('old-first'), message('old-second')], nextCursor: null});
  mount([message('recent')], {id: 'recent', createdAt: '2026-11-02T00:00:00Z'});
  const button = screen.getByRole('button', {name: tr('common:load_earlier_messages')});
  button.focus();
  fireEvent.click(button);
  await waitFor(() => expect(document.activeElement?.getAttribute('data-message-id')).toBe('old-first'));
  expect(screen.queryByRole('button', {name: tr('common:load_earlier_messages')})).toBeNull();
});
