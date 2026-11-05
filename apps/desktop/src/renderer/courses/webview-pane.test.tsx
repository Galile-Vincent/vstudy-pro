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
    await act(()=>root.render(<MoodleWebviewPane accountId="school" target={{kind:'page',url:'https://school.example/course/view.php?id=1'}} onClose={()=>{}} onDocument={()=>{}} onReconnect={()=>{}}/>));
    const footer=document.querySelector('footer.moodle-webview-footer')!,copy=footer.querySelectorAll('button')[3]!;
    await act(()=>copy.click());
    expect(footer.querySelector('[role=status]')?.textContent.includes('copied')).toBe(!fail);
    await act(()=>vi.advanceTimersByTimeAsync(2200));
    expect(footer.querySelector('[role=status]')?.textContent.includes('copied')).toBe(false);
    if(!fail){await act(()=>document.querySelector<HTMLButtonElement>('button[aria-label="Copy link"]')!.click());expect(footer.querySelector('[role=status]')?.textContent).toContain('copied');}
  }finally{await act(()=>root.unmount());host.remove();vi.useRealTimers();}
});
