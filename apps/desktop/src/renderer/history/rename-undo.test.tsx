// @vitest-environment jsdom
import '../courses/test-platform';
/** Undo restores an untitled conversation without persisting a translated placeholder. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { HistorySearch } from './search';
import { chatPatchSchema } from '../../shared/chat-history';
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('../bridge',()=>({desktop:{invoke}}));
vi.mock('./results',()=>({HistoryResults:({items,onRename}:{items:{title:string}[];onRename:(hit:{title:string})=>void})=>items.map((hit,index)=><button key={index} onClick={()=>onRename(hit)}>Rename empty</button>)}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('undoes rename to the original empty title through the validated patch contract',async()=>{
  vi.useFakeTimers();
  const hit={id:'00000000-0000-4000-8000-000000000001',title:''};
  invoke.mockImplementation(async(channel,payload)=>{
    if(channel==='chats:facets')return {courses:[],documents:[],models:[]};
    if(channel==='chats:update'){chatPatchSchema.parse(payload.patch);return {ok:true};}
    return {items:[hit],nextCursor:null};
  });
  const host=document.createElement('div'),root=createRoot(host);document.body.append(host);
  try{
    await act(()=>root.render(<HistorySearch onOpen={()=>{}}/>));await act(()=>vi.advanceTimersByTimeAsync(150));
    await act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Rename empty')!.click());
    const input=document.querySelector<HTMLInputElement>('[role=dialog] input')!;
    await act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'New title');input.dispatchEvent(new Event('input',{bubbles:true}));});
    await act(()=>input.closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    await act(()=>host.querySelector<HTMLButtonElement>('.history-undo button')!.click());
    expect(invoke).toHaveBeenCalledWith('chats:update',{conversationId:hit.id,patch:{title:''}});
    expect(host.querySelector('.history-undo')).toBeNull();
  }finally{await act(()=>root.unmount());host.remove();vi.useRealTimers();}
});
