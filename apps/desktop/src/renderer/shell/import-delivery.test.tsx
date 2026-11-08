// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../shared';
import { MoodleWebviewPane } from '../courses/webview-pane';
import { AppShell, useNavigate } from './index';
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('../bridge',()=>({desktop:{invoke}}));

vi.mock('../usage/subscriptions', () => ({ SubscriptionMeters: () => null }));
vi.mock('../onboarding/help',()=>({HelpMenu:()=>null}));
vi.mock('./view-transition',()=>({transitionTo:(apply:()=>void)=>apply()}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement,reduced=false;
beforeEach(()=>{
  vi.useFakeTimers();invoke.mockReset();invoke.mockResolvedValue(defaultSettings);localStorage.clear();reduced=false;
  vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
const tabId='11111111-1111-4111-a111-111111111111',accountId='22222222-2222-4222-a222-222222222222',documentId='33333333-3333-4333-a333-333333333333';
const target={kind:'file' as const,fileId:'44444444-4444-4444-a444-444444444444'};
const expected={view:'moodle' as const,accountId,target};
let navigation:ReturnType<typeof useNavigate>;
function ImportRoute(){navigation=useNavigate();return <MoodleWebviewPane tabId={tabId} accountId={accountId} target={target} onClose={()=>{}} onReconnect={()=>{}} onDocument={id=>navigation.navigate({view:'workspace',documentId:id as never})}/>;}
it.each([false,true])('acknowledges import only after persistence succeeds, storage failure %s',async fail=>{
 const {initialTabs}=await import('./tab-state');
 localStorage.setItem('vstudy-tabs-v1',JSON.stringify(initialTabs(tabId,expected)));
 invoke.mockImplementation(async(channel:string)=>channel.startsWith('moodle:webview-')?{id:'pane',generation:1,status:'ready',scrollTop:0,url:'https://school.example/pluginfile.php/a.md',title:'File',zoom:1,error:null,documentId,importedDocumentId:documentId}:channel.endsWith('sync')?{tabs:[]}:defaultSettings);
 const set=vi.spyOn(Storage.prototype,'setItem');if(fail)set.mockImplementation(()=>{throw Error('quota');});
 try{
 await act(async()=>root.render(<AppShell><ImportRoute/></AppShell>));
 expect(navigation!.route.view).toBe('workspace');
 expect(invoke.mock.calls.some(([channel,payload])=>channel==='moodle:webview-action' && (payload as {action?:string}).action==='ack-document')).toBe(!fail);
 if(!fail)expect(JSON.parse(localStorage.getItem('vstudy-tabs-v1')!).tabs[0].history.entries[0].importedDocumentId).toBe(documentId);
 }finally{set.mockRestore();invoke.mockClear();}
});
it('rejects a late import marker after moving to another Moodle entry',async()=>{
 const {initialTabs}=await import('./tab-state');localStorage.setItem('vstudy-tabs-v1',JSON.stringify(initialTabs(tabId,expected)));
 function Capture(){navigation=useNavigate();return null;}
 await act(async()=>root.render(<AppShell><Capture/></AppShell>));
 await act(()=>navigation.navigate({...expected,target:{kind:'file',fileId:'55555555-5555-4555-a555-555555555555'}}));
 let saved:unknown;await act(()=>{saved=navigation.recordMoodleImport(tabId,documentId,expected);});
 expect(saved).toBe(false);expect(navigation!.route.importedDocumentId).toBeUndefined();
});
