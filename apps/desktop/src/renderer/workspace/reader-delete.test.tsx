// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Workspace } from './index';
import { defaultSettings } from '../../shared';
import { tr } from '../../shared/i18n';
const state=vi.hoisted(()=>({invoke:vi.fn(),route:{documentId:'00000000-0000-4000-8000-000000000001'},navigate:vi.fn()}));
vi.mock('../bridge',()=>({desktop:state,isMock:false}));
vi.mock('../shell',()=>({useNavigate:()=>({route:state.route,navigate:state.navigate})}));
vi.mock('../chat',()=>({Chat:()=><p>Chat</p>}));
vi.mock('../lazy-reader',()=>({DocumentMarkdown:({source}:{source:string})=><p>{source}</p>}));
vi.mock('../model-controls',()=>({ModelControls:()=>null}));
vi.mock('../home/use-reading-activity',()=>({useReadingActivity:()=>{}}));
vi.mock('../onboarding/help',()=>({ContextCoach:()=>null,HelpMenu:()=>null}));
vi.mock('../conversation-list',()=>({ConversationList:()=>null}));
vi.mock('../ai-parse/ai-parse-controls',()=>({AiParseControls:()=>null}));
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
const doc={id:state.route.documentId,title:'Study',sourceName:'Study.md',mime:'text/markdown',status:'ready',activeVersion:'original'};
afterEach(()=>{cleanup();vi.resetAllMocks();localStorage.clear();sessionStorage.clear();});
function setup(){let deleted=false;state.invoke.mockImplementation(async(channel)=>{
  if(channel==='settings:get'||channel==='settings:set')return defaultSettings;
  if(channel==='settings:appearance')return {reducedTransparency:false};
  if(channel==='documents:get')return doc;
  if(channel==='documents:list')return deleted?[]:[doc];
  if(channel==='documents:read')return 'Readable document';
  if(channel==='library:documents:softDelete'){deleted=true;return {ok:true};}
  if(channel==='library:documents:restore'){deleted=false;return {ok:true};}
  return [];
});}
it('soft-deletes from the reader without a native confirm and offers Undo',async()=>{
  setup();const confirm=vi.spyOn(window,'confirm');
  render(<Workspace/>);await screen.findByText('Readable document');
  fireEvent.click(screen.getByRole('button',{name:tr('common:delete_document')}));
  await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('library:documents:softDelete',{documentId:doc.id}));
  expect(confirm).not.toHaveBeenCalled();
  expect(state.invoke.mock.calls.some(([channel])=>channel==='documents:delete')).toBe(false);
  fireEvent.click(await screen.findByRole('button',{name:tr('library:undo')}));
  await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('library:documents:restore',{documentId:doc.id}));
  await waitFor(()=>expect(state.navigate).toHaveBeenLastCalledWith({view:'workspace',documentId:doc.id}));
});
it('moves focus to Undo after Delete and back to the reader after Undo',async()=>{
  setup();
  render(<Workspace/>);await screen.findByText('Readable document');
  const del=screen.getByRole('button',{name:tr('common:delete_document')});del.focus();
  fireEvent.click(del);
  const undo=await screen.findByRole('button',{name:tr('library:undo')});
  await waitFor(()=>expect(document.activeElement).toBe(undo));
  fireEvent.click(undo);
  await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('library:documents:restore',{documentId:doc.id}));
  await waitFor(()=>expect(document.activeElement).toBe(document.getElementById('reading-content')));
});
it('removes the reader Undo notice after 30 seconds like the library page',async()=>{
  setup();
  render(<Workspace/>);await screen.findByText('Readable document');
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
  try{
    // Flush the async delete and its passive expiry effect before advancing the clock.
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:tr('common:delete_document')}));});
    expect(screen.getByRole('button',{name:tr('library:undo')})).not.toBeNull();
    await act(async()=>{await vi.advanceTimersByTimeAsync(29999)});
    expect(screen.queryByRole('button',{name:tr('library:undo')})).not.toBeNull();
    await act(async()=>{await vi.advanceTimersByTimeAsync(1)});
    expect(screen.queryByRole('button',{name:tr('library:undo')})).toBeNull();
    expect(screen.queryByText(tr('library:deleted',{count:1,formatted:'1'}))).toBeNull();
  }finally{vi.useRealTimers()}
});
it('does not repeat the AI re-parse control inside the reading pane',async()=>{
  setup();
  const original=state.invoke.getMockImplementation()!;
  state.invoke.mockImplementation(async(channel,...args)=>channel==='documents:get'?{...doc,mime:'application/pdf'}:channel==='documents:list'?[{...doc,mime:'application/pdf'}]:original(channel,...args));
  const {container}=render(<Workspace/>);await screen.findByText('Readable document');
  expect(container.querySelector('.document-conversion-hint')).toBeNull();
});
