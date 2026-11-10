// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ArtifactPanel } from './artifacts';
const {invoke,subscribe}=vi.hoisted(()=>({invoke:vi.fn(),subscribe:vi.fn()}));
vi.mock('../components/select', () => import('../../test/native-select'));
vi.mock('../bridge',()=>({desktop:{invoke,onReviewProgress:subscribe}}));
vi.mock('../../shared/i18n',()=>({tr:(key:string)=>key}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'en'}})}));
vi.mock('../markdown',()=>({DocumentMarkdown:({source}:{source:string})=><article>{source}</article>}));
vi.mock('./scope-picker',()=>({ScopePicker:({onChange}:{onChange:(s:unknown)=>void})=><button onClick={()=>onChange({kind:'weak'})}>scope</button>}));
vi.mock('./test-player',()=>({TestPlayer:()=>null}));
const artifact={createdAt:'2026-11-06T00:00:00.000Z',id:'artifact',courseId:'course',kind:'note',title:'A note',status:'ready',bodyMarkdown:'# Osmosis',test:null,scope:{kind:'weak'},resolvedScope:{unitIds:['unit'],documentIds:['doc'],conceptKeys:['osmosis'],sources:[{documentId:'doc',version:'original',excerptHash:'hash'}],assumptions:['based on when you asked'],timeZone:'Asia/Taipei',from:null,to:null},errorCode:null};
function setup(status='ready',errorCode:string|null=null){
 subscribe.mockReturnValue(vi.fn());
 invoke.mockImplementation(async(channel:string)=>{
 if(channel==='documents:list')return [];
 if(channel==='review:courses:units')return {items:[],nextCursor:null};
 if(channel==='review:artifact:list')return {items:[{...artifact,status,errorCode}],nextCursor:null};
 if(channel==='providers:list')return [{config:{id:'openai-api',enabled:true},availability:{available:true},models:[{id:'model',name:'Model'}]}];
 if(channel==='review:artifact:get'||channel==='review:artifact:generate'||channel==='review:artifact:retry')return {...artifact,status,errorCode};
 return {ok:true};
 });
}
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('opens a safe note reader with resolved scope, citations and native export',async()=>{
 setup();render(<ArtifactPanel courseId="course" kind="note" selection={null}/>);
 fireEvent.click(await screen.findByRole('button',{name:'A note'}));
 expect(await screen.findByText('# Osmosis')).toBeTruthy();expect(screen.getByText('review:asked_fallback')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'review:export_note'}));
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith('review:artifact:export',{artifactId:'artifact'}));
});
it('subscribes before generate and recovers after acknowledgement',async()=>{
 setup('generating');render(<ArtifactPanel courseId="course" kind="note" selection={null}/>);
 fireEvent.click(screen.getByText('scope'));
 fireEvent.click(await screen.findByRole('button',{name:'review:generate_note'}));
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith('review:artifact:generate',expect.anything()));
 expect(subscribe.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder.find((_,i)=>invoke.mock.calls[i]?.[0]==='review:artifact:generate')!);
 expect(await screen.findByText('review:stage_generating')).toBeTruthy();
});
it.each([['interrupted',null,'review:interrupted'],['failed','review.budget_exhausted','review:generation_budget'],['failed','review.offline','review:generation_offline'],['failed','review.needs_source_selection','review:needs_sources'],['failed',null,'review:generation_failed']])('renders recoverable %s %s state',async(status,code,label)=>{
 setup(status!,code);render(<ArtifactPanel courseId="course" kind="note" selection={null}/>);
 fireEvent.click(await screen.findByRole('button',{name:'A note'}));expect(await screen.findByText(label!)).toBeTruthy();
});
it('holds deletion until explicit confirmation and allows cancelling',async()=>{
 setup();render(<ArtifactPanel courseId="course" kind="note" selection={null}/>);fireEvent.click(await screen.findByRole('button',{name:'A note'}));
 fireEvent.click(await screen.findByRole('button',{name:'review:delete_artifact'}));
 expect(invoke).not.toHaveBeenCalledWith('review:artifact:delete',expect.anything());
 fireEvent.click(screen.getByRole('button',{name:'review:cancel'}));expect(screen.queryByRole('alertdialog')).toBeNull();
});
it('shows loading then empty and recovers list errors',async()=>{
 let resolve!:(value:unknown)=>void;invoke.mockImplementation((channel:string)=>channel==='review:artifact:list'?new Promise(r=>{resolve=r;}):Promise.resolve([]));subscribe.mockReturnValue(vi.fn());
 render(<ArtifactPanel courseId="course" kind="note" selection={null}/>);expect(screen.getByText('review:loading')).toBeTruthy();
 resolve({items:[],nextCursor:null});expect(await screen.findByText('review:artifacts_empty')).toBeTruthy();
});
it('ignores unrelated progress, recovers on reconnect and unsubscribes',async()=>{
 setup('generating');const unsubscribe=vi.fn();subscribe.mockReturnValue(unsubscribe);
 const view=render(<ArtifactPanel courseId="course" kind="note" selection={null}/>);
 fireEvent.click(await screen.findByRole('button',{name:'A note'}));await screen.findByText('review:stage_generating');
 const listener=subscribe.mock.calls[0]![0];
 listener({requestId:'other',artifactId:'other',stage:'validating'});
 expect(screen.queryByText('review:stage_validating')).toBeNull();
 invoke.mockClear();fireEvent(window,new Event('online'));
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith('review:artifact:get',{artifactId:'artifact'}));
 view.unmount();expect(unsubscribe).toHaveBeenCalledOnce();
});
it('cancels generating artifacts through the main channel',async()=>{
 setup('generating');render(<ArtifactPanel courseId="course" kind="note" selection={null}/>);
 fireEvent.click(await screen.findByRole('button',{name:'A note'}));fireEvent.click(await screen.findByRole('button',{name:'review:cancel'}));
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith('review:artifact:cancel',{artifactId:'artifact'}));
});
it('retries interrupted artifacts with a fresh request id',async()=>{
 setup('interrupted');render(<ArtifactPanel courseId="course" kind="note" selection={null}/>);
 fireEvent.click(await screen.findByRole('button',{name:'A note'}));fireEvent.click(await screen.findByRole('button',{name:'review:retry'}));
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith('review:artifact:retry',expect.objectContaining({artifactId:'artifact',requestId:expect.any(String)})));
});
it('retries a failed list and sends its keyset cursor when loading more',async()=>{
 setup();const original=invoke.getMockImplementation()!;let listCalls=0;
 const cursor={at:'2026-11-06T00:00:00Z',id:'cursor'};
 invoke.mockImplementation(async(channel:string,input:unknown)=>{
  if(channel!=='review:artifact:list')return original(channel,input);
  listCalls++;if(listCalls===1)throw new Error('offline');
  return listCalls===2?{items:[artifact],nextCursor:cursor}:{items:[{...artifact,id:'older',title:'Older note'}],nextCursor:null};
 });
 render(<ArtifactPanel courseId="course" kind="note" selection={null}/>);
 expect(await screen.findByRole('alert')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'review:retry'}));
 fireEvent.click(await screen.findByRole('button',{name:'review:load_more'}));
 expect(await screen.findByRole('button',{name:'Older note'})).toBeTruthy();
 expect(invoke).toHaveBeenCalledWith('review:artifact:list',{courseId:'course',limit:20,cursor});
});
