// @vitest-environment jsdom
/** Copy feedback reflects successful native clipboard writes and expires. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MoodleWebviewPane } from './webview-pane';
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('../bridge',()=>({desktop:{invoke}}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
window.matchMedia=vi.fn().mockReturnValue({addEventListener(){},removeEventListener(){}});
it.each([false,true])('announces copy only on success and clears it (failure %s)',async fail=>{
  vi.useFakeTimers();
  const state={id:'pane',status:'ready',url:'https://school.example/course/view.php?id=1',title:'Course',secure:true,zoom:1,error:null,documentId:null,retryAt:null,canGoBack:false,canGoForward:false};
  invoke.mockImplementation(async(channel,payload)=>{if(channel==='moodle:webview-action' && payload.action==='copy' && fail)throw new Error('Clipboard failed');return state;});
  const host=document.createElement('div'),root=createRoot(host);document.body.append(host);
  try{
    await act(()=>root.render(<MoodleWebviewPane tabId="11111111-1111-4111-a111-111111111111" accountId="school" target={{kind:'page',url:'https://school.example/course/view.php?id=1'}} onClose={()=>{}} onDocument={()=>{}} onReconnect={()=>{}}/>));
    const footer=document.querySelector('footer.moodle-webview-footer')!,copy=footer.querySelectorAll('button')[3]!;
    await act(()=>copy.click());
    expect(footer.querySelector('[role=status]')?.textContent.includes('copied')).toBe(!fail);
    await act(()=>vi.advanceTimersByTimeAsync(2200));
    expect(footer.querySelector('[role=status]')?.textContent.includes('copied')).toBe(false);
    if(!fail){await act(()=>document.querySelector<HTMLButtonElement>('button[aria-label="Copy link"]')!.click());expect(footer.querySelector('[role=status]')?.textContent).toContain('copied');}
  }finally{await act(()=>root.unmount());host.remove();vi.useRealTimers();}
});

it('offers Retry after opening fails and clears the failure on recovery and navigation',async()=>{
  const {render,screen,fireEvent,waitFor,cleanup}=await import('@testing-library/react');
  const {tr}=await import('../../shared/i18n');
  let fail=true;
  const state={id:'retry-pane',status:'ready',url:'https://school.example/course/view.php?id=1',title:'Course',secure:true,zoom:1,error:null,documentId:null,retryAt:null,canGoBack:false,canGoForward:false};
  invoke.mockImplementation(async(channel)=>{if(channel==='moodle:webview-open'&&fail)throw new Error('offline');return state;});
  const props={accountId:'school',target:{kind:'page' as const,url:state.url},onClose:()=>{},onDocument:()=>{},onReconnect:()=>{}};
  try{
    const view=render(<MoodleWebviewPane tabId="11111111-1111-4111-a111-111111111111" {...props}/>);
    await screen.findByRole('alert');
    fail=false;fireEvent.click(screen.getByRole('button',{name:tr('common:retry')}));
    await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
    fail=true;view.rerender(<MoodleWebviewPane tabId="11111111-1111-4111-a111-111111111111" {...props} target={{kind:'page',url:'https://school.example/course/view.php?id=2'}}/>);
    await screen.findByRole('alert');
    fail=false;view.rerender(<MoodleWebviewPane tabId="11111111-1111-4111-a111-111111111111" {...props} target={{kind:'page',url:'https://school.example/course/view.php?id=3'}}/>);
    await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
  }finally{cleanup();}
});
it('clears an action failure when Reload succeeds',async()=>{
  const {render,screen,fireEvent,waitFor,cleanup}=await import('@testing-library/react');
  const state={id:'action-pane',status:'ready',url:'https://school.example/course/view.php?id=1',title:'Course',secure:true,zoom:1,error:null,documentId:null,retryAt:null,canGoBack:false,canGoForward:false};
  invoke.mockImplementation(async(channel,payload)=>{if(channel==='moodle:webview-action'&&payload.action==='copy')throw new Error('clipboard');return state;});
  try{
    render(<MoodleWebviewPane tabId="11111111-1111-4111-a111-111111111111" accountId="school" target={{kind:'page',url:state.url}} onClose={()=>{}} onDocument={()=>{}} onReconnect={()=>{}}/>);
    await waitFor(()=>expect(screen.getAllByRole('button',{name:'Copy link'})[0]!.hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getAllByRole('button',{name:'Copy link'})[0]!);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button',{name:'Reload'}));
    await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
  }finally{cleanup();}
});
it('hides on unmount and leaves the app root interactive',async()=>{
  const {render,waitFor,cleanup}=await import('@testing-library/react');
  invoke.mockResolvedValue({id:'pane',generation:1,status:'ready',url:'https://school.example/',title:'Course',secure:true,zoom:1,error:null,documentId:null,retryAt:null,canGoBack:false,canGoForward:false});
  const tabId='11111111-1111-4111-a111-111111111111';
  const view=render(<MoodleWebviewPane tabId={tabId} accountId={tabId} target={{kind:'page',url:'https://school.example/'}} onClose={()=>{}} onDocument={()=>{}} onReconnect={()=>{}}/>);
  await waitFor(()=>expect(view.getByTestId('moodle-webview')).toBeTruthy());
  expect(view.queryByRole('dialog')).toBeNull();
  invoke.mockClear();view.unmount();
  expect(invoke).toHaveBeenCalledWith('moodle:webview-hide',{tabId,generation:1});
  expect(invoke.mock.calls.some(([channel,payload])=>channel==='moodle:webview-action' && payload.action==='close')).toBe(false);
  cleanup();
});
it('offers one retry control for a resource-limited pane',async()=>{
 const {render,screen,cleanup}=await import('@testing-library/react');
 invoke.mockResolvedValue({id:'pane',generation:1,status:'error',url:'https://school.example/',title:'Course',secure:true,zoom:1,error:'resource-limit',documentId:null,retryAt:null,canGoBack:false,canGoForward:false});
 try {
 render(<MoodleWebviewPane tabId="11111111-1111-4111-a111-111111111111" accountId="school" target={{kind:'page',url:'https://school.example/'}} onClose={()=>{}} onDocument={()=>{}} onReconnect={()=>{}}/>);
 await screen.findByRole('alert');expect(screen.getAllByRole('button',{name:'Retry'})).toHaveLength(1);
 }finally{cleanup();}
});
