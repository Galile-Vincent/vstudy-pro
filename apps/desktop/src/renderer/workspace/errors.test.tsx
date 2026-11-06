// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Workspace } from './index';
import { defaultSettings } from '../../shared';
import { tr } from '../../shared/i18n';
const state=vi.hoisted(()=>({invoke:vi.fn(),getPathForFile:vi.fn(),route:{documentId:'00000000-0000-4000-8000-000000000001'},navigate:vi.fn()}));
vi.mock('../bridge',()=>({desktop:state,isMock:false}));
vi.mock('../shell',()=>({useNavigate:()=>({route:state.route,navigate:state.navigate})}));
vi.mock('../lazy-reader',()=>({DocumentMarkdown:({source}:{source:string})=><p>{source}</p>}));
vi.mock('../model-controls',()=>({ModelControls:()=>null}));
vi.mock('../home/use-reading-activity',()=>({useReadingActivity:()=>{}}));
vi.mock('../onboarding/help',()=>({ContextCoach:()=>null,HelpMenu:()=>null}));
vi.mock('../conversation-list',()=>({ConversationList:()=>null}));
vi.mock('../ai-parse/ai-parse-controls',()=>({AiParseControls:()=>null}));
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
const doc={id:state.route.documentId,title:'Study',sourceName:'Study.md',mime:'text/markdown',status:'ready',activeVersion:'original'};
function setup(failRead=false){let reads=0;state.invoke.mockImplementation(async(channel)=>{
  if(channel==='settings:get'||channel==='settings:set')return defaultSettings;
  if(channel==='settings:appearance')return {reducedTransparency:false};
  if(channel==='documents:get')return doc;
  if(channel==='documents:list')return [doc];
  if(channel==='documents:read'){if(failRead&&++reads===1)throw new Error('VSTUDY_STATUS:'+JSON.stringify({code:'errors.network',params:{}}));return 'Readable document';}
  if(channel==='conversations:list')return [];
  return [];
});}
afterEach(()=>{cleanup();vi.resetAllMocks();localStorage.clear();sessionStorage.clear();});
it('shows the dropped filename and typed import reason without exposing its token',async()=>{
  setup();const token='drop:'+'a'.repeat(64);state.getPathForFile.mockReturnValue(token);
  const original=state.invoke.getMockImplementation()!;
  state.invoke.mockImplementation(async(channel,...args)=>channel==='documents:importPaths'?[{ok:false,path:token,error:'VSTUDY_STATUS:'+JSON.stringify({code:'errors.unsupported_type',params:{}})}]:original(channel,...args));
  const {container}=render(<Workspace/>);await screen.findByText('Readable document');
  fireEvent.drop(container.querySelector('.workspace')??container.firstElementChild!,{dataTransfer:{files:[new File(['x'],'Lecture.exe')]}});
  await waitFor(()=>expect(container.textContent).toContain('Lecture.exe: '+tr('errors:unsupported_type')));
  expect(container.textContent).not.toContain('drop:');
});
