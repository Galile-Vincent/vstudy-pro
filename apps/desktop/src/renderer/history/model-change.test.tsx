// @vitest-environment jsdom
/** Model changes use current persisted messages and preserve a working conversation on failure. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryView } from './index';
const {invoke,navigate}=vi.hoisted(()=>({invoke:vi.fn(),navigate:vi.fn()}));
vi.mock('../bridge',()=>({desktop:{invoke}}));
vi.mock('../shell',()=>({useNavigate:()=>({route:{conversationId:'00000000-0000-4000-8000-000000000001'},navigate})}));
vi.mock('./search',()=>({HistorySearch:()=>null}));
vi.mock('../chat',()=>({Chat:({onModel}:{onModel:(value:string)=>void})=><div data-working-chat>Working chat<button onClick={()=>onModel('anthropic-api/next')}>Change model</button></div>}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>,host:HTMLDivElement;
afterEach(async()=>{await act(()=>root.unmount());host.remove();vi.resetAllMocks();});
async function mount(fail=false){
  const conversation={id:'00000000-0000-4000-8000-000000000001',scope:'general',providerId:'anthropic-api',modelId:'fake',createdAt:'2026-11-01T00:00:00Z'};
  let reads=0;
  invoke.mockImplementation(async channel=>{
    if(channel==='providers:list')return [];
    if(channel==='chats:get')return conversation;
    if(channel==='messages:page'){if(++reads===1)return {items:[],nextCursor:null};if(fail)throw new Error('unavailable');return {items:[{role:'user'}],nextCursor:null};}
    if(channel==='conversations:model')throw new Error('not empty');
    if(channel==='conversations:create')return {...conversation,id:'00000000-0000-4000-8000-000000000002',modelId:'next'};
  });
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async()=>{root.render(<HistoryView/>);});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
}
it('starts a new conversation after the first send even though initial history was empty',async()=>{
  await mount();await act(async()=>host.querySelector('button:not(.history-back)')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(invoke).toHaveBeenCalledWith('conversations:create',{scope:'general',providerId:'anthropic-api',modelId:'next'});
  expect(navigate).toHaveBeenCalledWith({view:'history',conversationId:'00000000-0000-4000-8000-000000000002'});
});
it('keeps the working chat mounted and shows an inline model-change error',async()=>{
  await mount(true);const chat=host.querySelector('[data-working-chat]');
  await act(async()=>host.querySelector('button:not(.history-back)')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(host.querySelector('[data-working-chat]')).toBe(chat);expect(host.querySelector('[role=alert]')).not.toBeNull();
});
