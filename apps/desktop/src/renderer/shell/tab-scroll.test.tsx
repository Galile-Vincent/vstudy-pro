// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../shared';
import { AppShell, useNavigate } from './index';
vi.mock('../bridge',()=>({desktop:{invoke:vi.fn(async()=>defaultSettings)}}));
vi.mock('../usage/subscriptions', () => ({ SubscriptionMeters: () => null }));
vi.mock('../onboarding/help',()=>({HelpMenu:()=>null}));
vi.mock('./view-transition',()=>({transitionTo:(apply:()=>void)=>apply()}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement,ids:string[];
beforeEach(()=>{
  vi.useFakeTimers();localStorage.clear();
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
const tops=new WeakMap<Element,number>();
const original=Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop')!;
beforeEach(()=>{
  Object.defineProperty(Element.prototype,'scrollTop',{configurable:true,get(){return tops.get(this)??0;},set(value:number){tops.set(this,value);}});
});
afterEach(()=>{Object.defineProperty(Element.prototype,'scrollTop',original);});
function Page(){
  const {route,navigate,openTab,activateTab,tabs}=useNavigate();
  ids=tabs.tabs.map(tab=>tab.id);
  return <>
    <button id="open-exams" onClick={()=>navigate('exams')}>Exams</button>
    <button id="open-tab" onClick={()=>openTab('library')}>Tab</button>
    <button id="first" onClick={()=>activateTab(ids[0]!)}>First</button>
    {route.view==='exams'&&<main id="own" data-tab-scroll="">own</main>}
  </>;
}
async function mount(){await act(async()=>root.render(<AppShell><Page/></AppShell>));await act(async()=>vi.advanceTimersByTime(20));}
async function click(id:string){await act(async()=>{host.querySelector<HTMLButtonElement>('#'+id)!.click();});}
it('restores the scroll position of a page that marks its own scroller',async()=>{
  await mount();await click('open-exams');
  const own=host.querySelector<HTMLElement>('#own')!;
  own.scrollTop=180;
  await click('open-tab');await click('first');
  const next=host.querySelector<HTMLElement>('#own')!;
  expect(next).not.toBe(own);
  expect(next.scrollTop).toBe(180);
});
it('scrolls the marked scroller from the shell content with page keys',async()=>{
  await mount();await click('open-exams');
  const own=host.querySelector<HTMLElement>('#own')!;
  const scrollBy=vi.fn(),scrollTo=vi.fn();
  Object.assign(own,{scrollBy,scrollTo});
  Object.defineProperty(own,'clientHeight',{value:800});
  Object.defineProperty(own,'scrollHeight',{value:5000});
  const content=host.querySelector<HTMLElement>('#shell-content')!;
  const press=async(key:string,target:Element=content)=>{
    const event=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});
    await act(async()=>{target.dispatchEvent(event);});
    return event.defaultPrevented;
  };
  expect(await press('PageDown')).toBe(true);
  expect(scrollBy).toHaveBeenLastCalledWith({top:700});
  expect(await press('PageUp')).toBe(true);
  expect(scrollBy).toHaveBeenLastCalledWith({top:-700});
  expect(await press('Home')).toBe(true);
  expect(scrollTo).toHaveBeenLastCalledWith({top:0});
  expect(await press('End')).toBe(true);
  expect(scrollTo).toHaveBeenLastCalledWith({top:5000});
  expect(await press('PageDown',own)).toBe(false);
  expect(scrollBy).toHaveBeenCalledTimes(2);
});
it('leaves page keys alone when the page does not mark a scroller',async()=>{
  await mount();
  const content=host.querySelector<HTMLElement>('#shell-content')!;
  const event=new KeyboardEvent('keydown',{key:'PageDown',bubbles:true,cancelable:true});
  await act(async()=>{content.dispatchEvent(event);});
  expect(event.defaultPrevented).toBe(false);
});
