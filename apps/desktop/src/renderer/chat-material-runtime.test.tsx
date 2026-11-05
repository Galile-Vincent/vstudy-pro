// @vitest-environment jsdom
/** Approved material requests survive the real assistant runtime's deferred first turn. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Chat } from './chat';
import type { Conversation } from '../shared/domain';
const {invoke,events}=vi.hoisted(()=>({invoke:vi.fn(),events:{emit:undefined as undefined|((event:unknown)=>void)}}));
vi.mock('./bridge',()=>({desktop:{invoke,onChatEvent:(_id:string,emit:typeof events.emit)=>{events.emit=emit;return ()=>{};}}}));
vi.mock('./usage/meter',()=>({useUsage:()=>({}),useBudgetGuard:()=>({}),UsageButton:()=>null,UsageMeter:()=>null}));
vi.mock('./components/assistant-ui/elements/thread.aui',()=>({Thread:()=>null}));
vi.mock('./model-controls',()=>({ModelControls:()=>null}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('sends the explicitly approved materials on the initial appended turn',async()=>{
  const conversation={id:'00000000-0000-4000-8000-000000000001',scope:'course',courseId:'00000000-0000-4000-8000-000000000002',providerId:'anthropic-api',modelId:'fake',createdAt:'2026-11-01T00:00:00Z'} as Conversation;
  const materials={mode:'summary' as const,documentIds:['00000000-0000-4000-8000-000000000003']};
  invoke.mockImplementation(async channel=>{if(channel==='chat:start')events.emit?.({type:'done'});return {ok:true};});
  const host=document.createElement('div'),root=createRoot(host);document.body.append(host);
  try {
    await act(async()=>{root.render(<Chat conversation={conversation} history={[]} draft="" onDraft={()=>{}} selection={null} onClearSelection={()=>{}} providers={[]} model="" onModel={()=>{}} onSettings={()=>{}} onProvidersChanged={async()=>{}} onUsage={()=>{}} promptRequest={{id:1,text:'Summarize',materials}}/>);});
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
    expect(invoke).toHaveBeenCalledWith('chat:start',expect.objectContaining({materials}));
  }finally{await act(()=>root.unmount());host.remove();}
});
