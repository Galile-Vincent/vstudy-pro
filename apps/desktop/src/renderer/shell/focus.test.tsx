// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../shared';
import { AppShell, useNavigate } from './index';
vi.mock('../bridge',()=>({desktop:{invoke:vi.fn(async()=>defaultSettings)}}));
vi.mock('../ai-cli/inventory',()=>({AiCliInventory:()=>null}));
vi.mock('../onboarding/help',()=>({HelpMenu:()=>null}));
vi.mock('./view-transition',()=>({transitionTo:(apply:()=>void)=>apply()}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement,reduced=false;
beforeEach(()=>{
  vi.useFakeTimers();localStorage.clear();reduced=false;
  vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
function Routes(){const {navigate,closeWelcome,route}=useNavigate();return <><p>{route.view}</p><button id="welcome-entry" onClick={()=>navigate('welcome')}>Welcome</button><button id="close-welcome" onClick={closeWelcome}>Close</button><button id="other" onClick={()=>navigate('library')}>Other route</button><button id="chosen">My focus</button></>;}
async function mount(){await act(async()=>root.render(<AppShell><Routes/></AppShell>));await act(async()=>vi.advanceTimersByTime(20));}
async function click(id:string){await act(async()=>{const button=host.querySelector<HTMLButtonElement>('#'+id)!;button.focus();button.click();});}
it('cancels Welcome return focus when a newer navigation occurs',async()=>{
  await mount();await click('welcome-entry');await click('close-welcome');await click('other');
  await act(async()=>vi.advanceTimersByTime(20));host.querySelector<HTMLButtonElement>('#chosen')!.focus();
  await act(async()=>vi.advanceTimersByTime(500));expect(document.activeElement?.id).toBe('chosen');
});
it('does not steal focus from a control selected while the destination settles',async()=>{
  await mount();await click('welcome-entry');await click('close-welcome');
  host.querySelector<HTMLButtonElement>('#chosen')!.focus();
  await act(async()=>vi.advanceTimersByTime(500));expect(document.activeElement?.id).toBe('chosen');
});
it('returns focus without a cosmetic delay under reduced motion',async()=>{
  await mount();await click('welcome-entry');reduced=true;await click('close-welcome');
  await act(async()=>vi.advanceTimersByTime(0));expect(document.activeElement?.id).toBe('welcome-entry');
});
