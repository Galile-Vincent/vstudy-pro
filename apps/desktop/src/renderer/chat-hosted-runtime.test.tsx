// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useLocalRuntime } from '@assistant-ui/react';
import { Chat } from './chat';
import type { Conversation } from '../shared/domain';
const state=vi.hoisted(()=>({append:vi.fn(),runtime:undefined as unknown}));
vi.mock('./chat-session-host',()=>({useChatSession:()=>({standalone:false,runtime:state.runtime})}));
vi.mock('./bridge',()=>({desktop:{invoke:vi.fn()}}));
vi.mock('./chat-adapter',()=>({createChatAdapter:()=>({adapter:{},dispose:()=>{}})}));
vi.mock('./usage/meter',()=>({useUsage:()=>({}),useBudgetGuard:()=>({}),UsageButton:()=>null,UsageMeter:()=>null}));
vi.mock('./components/assistant-ui/elements/thread.aui',()=>({Thread:()=>null}));
vi.mock('./model-controls',()=>({ModelControls:()=>null}));
vi.mock('@assistant-ui/react',async importOriginal=>({...await importOriginal<typeof import('@assistant-ui/react')>(),useAuiState:()=>false,AssistantRuntimeProvider:({children}:{children:React.ReactNode})=>children,useLocalRuntime:vi.fn(()=>({thread:{append:state.append,composer:{setText:()=>{},subscribe:()=>()=>{}}}}))}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('uses only the hosted runtime while loading and after it becomes available',async()=>{
  const conversation={id:'00000000-0000-4000-8000-000000000001',scope:'course',courseId:'00000000-0000-4000-8000-000000000002',providerId:'anthropic-api',modelId:'fake',createdAt:'2026-11-01T00:00:00Z'} as Conversation;
  const materials={mode:'summary' as const,documentIds:['00000000-0000-4000-8000-000000000003']};
  const props={conversation,history:[],draft:'',onDraft:()=>{},selection:null,onClearSelection:()=>{},providers:[],model:'',onModel:()=>{},onSettings:()=>{},onProvidersChanged:async()=>{},onUsage:()=>{}};
  const host=document.createElement('div'),root=createRoot(host);document.body.append(host);
  vi.mocked(useLocalRuntime).mockClear();
  try {
    state.runtime=undefined;
    await act(()=>root.render(<Chat {...props}/>));
    expect(useLocalRuntime).not.toHaveBeenCalled();
    state.runtime={thread:{append:state.append,composer:{setText:vi.fn(),subscribe:()=>()=>{}}}};
    await act(()=>root.render(<Chat {...props} promptRequest={{id:2,text:'Hosted',materials}}/>));
    expect(useLocalRuntime).not.toHaveBeenCalled();
    expect(state.append).toHaveBeenCalledOnce();
  }finally{await act(()=>root.unmount());host.remove();}
});
