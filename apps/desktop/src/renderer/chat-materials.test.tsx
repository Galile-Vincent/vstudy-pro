// @vitest-environment jsdom
/** Material approval belongs only to the requested append, even when the runtime refuses it. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Chat } from './chat';
import type { Conversation } from '../shared/domain';
const state=vi.hoisted(()=>({context:undefined as undefined|(()=>Promise<{materials?:unknown}>),append:vi.fn()}));
vi.mock('./bridge',()=>({desktop:{invoke:vi.fn()}}));
vi.mock('./chat-adapter',()=>({createChatAdapter:(_bridge:unknown,context:typeof state.context)=>{state.context=context;return {adapter:{},dispose:()=>{}};}}));
vi.mock('./usage/meter',()=>({useUsage:()=>({}),useBudgetGuard:()=>({}),UsageButton:()=>null,UsageMeter:()=>null}));
vi.mock('./components/assistant-ui/elements/thread.aui',()=>({Thread:()=>null}));
vi.mock('./model-controls',()=>({ModelControls:()=>null}));
vi.mock('@assistant-ui/react',async importOriginal=>({...await importOriginal<typeof import('@assistant-ui/react')>(),useAuiState:()=>false,AssistantRuntimeProvider:({children}:{children:React.ReactNode})=>children,useLocalRuntime:()=>({thread:{append:state.append,composer:{setText:()=>{},subscribe:()=>()=>{}}}})}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('does not retain material consent after the runtime refuses append',async()=>{
  const conversation={id:'00000000-0000-4000-8000-000000000001',scope:'course',courseId:'00000000-0000-4000-8000-000000000002',providerId:'anthropic-api',modelId:'fake',createdAt:'2026-11-01T00:00:00Z'} as Conversation;
  const materials={mode:'summary' as const,documentIds:['00000000-0000-4000-8000-000000000003']};
  const props={conversation,history:[],draft:'',onDraft:()=>{},selection:null,onClearSelection:()=>{},providers:[],model:'',onModel:()=>{},onSettings:()=>{},onProvidersChanged:async()=>{},onUsage:()=>{}};
  const host=document.createElement('div'),root=createRoot(host);document.body.append(host);
  state.append.mockImplementation(()=>{});
  try {
    await act(()=>root.render(<Chat {...props} promptRequest={{id:2,text:'Refused',materials}}/>));
    expect((await state.context!()).materials).toBeUndefined();
  }finally{await act(()=>root.unmount());host.remove();}
});
