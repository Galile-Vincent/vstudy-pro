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
  const {ThreadPrimitive,MessagePrimitive,ErrorPrimitive,ComposerPrimitive}=await import('@assistant-ui/react');
  return {Thread:()=> <ThreadPrimitive.Root><ThreadPrimitive.Messages>{()=> <MessagePrimitive.Root><MessagePrimitive.Content/><MessagePrimitive.Error><ErrorPrimitive.Root><ErrorPrimitive.Message/></ErrorPrimitive.Root></MessagePrimitive.Error></MessagePrimitive.Root>}</ThreadPrimitive.Messages><ComposerPrimitive.Root><ComposerPrimitive.Input aria-label="Question"/><ComposerPrimitive.Send>Send</ComposerPrimitive.Send></ComposerPrimitive.Root></ThreadPrimitive.Root>};
});
const conversation={id:'c',scope:'general',providerId:'anthropic-api',modelId:'fake'} as Conversation;
function mount(history:Message[]=[]){return render(<Chat conversation={conversation} history={history} draft="" onDraft={()=>{}} selection={null} onClearSelection={()=>{}} providers={[]} model="anthropic-api/fake" onModel={()=>{}} onSettings={()=>{}} onProvidersChanged={async()=>{}} onUsage={()=>{}}/>);}
afterEach(()=>{cleanup();vi.resetAllMocks();});
it.each(['en','zh-Hant','ja'])('keeps an unsaved answer visible with actionable save guidance in %s',async language=>{
  await i18n.changeLanguage(language);
  bridge.invoke.mockImplementation(async channel=>{if(channel==='chat:start'){
    bridge.listener?.({type:'text-delta',text:'Answer worth keeping'});
    bridge.listener?.({type:'error',code:'errors.chat_save_failed',params:{},message:'Chat could not be saved'});
  }return {ok:true};});
  mount();fireEvent.change(screen.getByRole('textbox'),{target:{value:'Question'}});fireEvent.click(screen.getByRole('button',{name:'Send'}));
  await waitFor(()=>expect(screen.getByText(tr('errors:chat_save_failed'))).toBeTruthy());
  expect(screen.getByText('Answer worth keeping')).toBeTruthy();
});
it('restores the saved error reason beside the partial answer',async()=>{
  await i18n.changeLanguage('en');
  mount([{id:'a',conversationId:'c',role:'assistant',createdAt:new Date().toISOString(),parts:[{type:'text',text:'Partial answer',status:'error',error:'VSTUDY_STATUS:'+JSON.stringify({code:'errors.auth_failed',params:{}})}]}] as Message[]);
  expect(await screen.findByText(tr('errors:auth_failed'))).toBeTruthy();
  expect(screen.getByText('Partial answer')).toBeTruthy();
});
