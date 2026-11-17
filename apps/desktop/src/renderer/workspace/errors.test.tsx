// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Workspace } from './index';
import { defaultSettings } from '../../shared';
import { tr } from '../../shared/i18n';
const state=vi.hoisted(()=>({invoke:vi.fn(),getPathForFile:vi.fn(),route:{documentId:'00000000-0000-4000-8000-000000000001'},navigate:vi.fn(),mounts:0}));
vi.mock('../bridge',()=>({desktop:state,isMock:false}));
vi.mock('../shell',()=>({useNavigate:()=>({route:state.route,navigate:state.navigate})}));
vi.mock('../chat',()=>({Chat:()=> {useEffect(()=>{state.mounts++;},[]);return <p>Recovered chat</p>;}}));
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
it('keeps document load errors visible with Retry until the document loads',async()=>{
  setup(true);render(<Workspace/>);
  const alert=await screen.findByRole('alert');expect(alert.textContent).toContain(tr('errors:network'));
  fireEvent.click(within(alert).getByRole('button',{name:tr('common:retry')}));
  expect(await screen.findByText('Readable document')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

it.each(['documents:get','conversations:list','messages:page'])('retries persistent %s failures',async failingChannel=>{
  setup();let fail=true;
  const original=state.invoke.getMockImplementation()!;
  state.invoke.mockImplementation(async(channel,...args)=>{
    if(channel===failingChannel&&fail)throw new Error('VSTUDY_STATUS:'+JSON.stringify({code:'errors.network',params:{}}));
    if(channel==='conversations:list')return [{id:'chat',providerId:'anthropic-api',modelId:'fake'}];
    if(channel==='messages:page')return {items:[],nextCursor:null};
    return original(channel,...args);
  });
  render(<Workspace/>);
  const alert=await screen.findByRole('alert');
  expect(alert.textContent).toContain(tr('errors:network'));
  expect(within(alert).queryByRole('button',{name:'×'})).toBeNull();
  fail=false;fireEvent.click(within(alert).getByRole('button',{name:tr('common:retry')}));
  expect(await screen.findByText('Readable document')).toBeTruthy();
  await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
});

it('retries only the document source and preserves the mounted chat',async()=>{
  setup(true);state.mounts=0;
  const original=state.invoke.getMockImplementation()!;
  state.invoke.mockImplementation(async(channel,...args)=>{
    if(channel==='conversations:list')return [{id:'chat',providerId:'anthropic-api',modelId:'fake'}];
    if(channel==='messages:page')return {items:[],nextCursor:null};
    return original(channel,...args);
  });
  render(<Workspace/>);
  await screen.findByText('Recovered chat');
  const alert=await screen.findByRole('alert');
  state.invoke.mockClear();
  fireEvent.click(within(alert).getByRole('button',{name:tr('common:retry')}));
  await screen.findByText('Readable document');
  expect(state.mounts).toBe(1);
  expect(state.invoke.mock.calls.map(([channel])=>channel)).toEqual(['documents:read']);
});

it('only exposes tabpanels and their Tab stops while the compact tablist is shown',async()=>{
  setup();let compact=false;let changed=()=>{};
  vi.stubGlobal('matchMedia',(query:string)=>({get matches(){return query.includes('819') && compact;},addEventListener:(_event:string,listener:()=>void)=>{if(query.includes('819'))changed=listener;},removeEventListener:()=>{}}));
  try {
    const {container}=render(<Workspace/>);await screen.findByText('Readable document');
    const panes=()=>Array.from(container.querySelectorAll<HTMLElement>('[data-panel]'));
    expect(panes()).toHaveLength(2);
    for(const pane of panes()){expect(pane.getAttribute('role')).not.toBe('tabpanel');expect(pane.hasAttribute('tabindex')).toBe(false);expect(pane.hasAttribute('aria-labelledby')).toBe(false);}
    compact=true;await act(()=>changed());
    for(const pane of panes()){expect(pane.getAttribute('role')).toBe('tabpanel');expect(pane.tabIndex).toBe(0);expect(document.getElementById(pane.getAttribute('aria-labelledby')!)).toBeTruthy();}
    compact=false;await act(()=>changed());
    expect(container.querySelector('[role=tabpanel]')).toBeNull();
  }finally{vi.unstubAllGlobals();}
});

it.each(['settings:get','documents:get','providers:list'])('retries only a failed startup %s request',async failingChannel=>{
  setup();let fail=true;
  const original=state.invoke.getMockImplementation()!;
  state.invoke.mockImplementation(async(channel,...args)=>{
    if(channel===failingChannel&&fail)throw new Error('Startup unavailable');
    return original(channel,...args);
  });
  render(<Workspace/>);
  const alert=await screen.findByRole('alert');
  fail=false;state.invoke.mockClear();
  fireEvent.click(within(alert).getByRole('button',{name:tr('common:retry')}));
  await screen.findByText('Readable document');
  const startupRequests=state.invoke.mock.calls.filter(([channel,args])=>channel==='settings:get'||channel==='documents:get'||(channel==='providers:list'&&args?.discover===false));
  expect(startupRequests.map(([channel])=>channel)).toEqual([failingChannel]);
});
