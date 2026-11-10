// @vitest-environment jsdom
import { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../shared';
import { AppShell, useNavigate } from './index';
vi.mock('../bridge',()=>({desktop:{invoke:vi.fn(async()=>defaultSettings)}}));

vi.mock('../usage/subscriptions', () => ({ SubscriptionMeters: () => null }));
vi.mock('../onboarding/help',()=>({HelpMenu:()=>null}));
vi.mock('./view-transition',()=>({transitionTo:(apply:()=>void)=>apply()}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement,reduced=false;
beforeEach(()=>{
  vi.useFakeTimers();localStorage.clear();reduced=false;
  vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
function Routes(){const {navigate,closeWelcome,route,closeTab,openTab}=useNavigate();return <><p>{route.view}</p><button id="welcome-entry" onClick={()=>navigate('welcome')}>Welcome</button><button id="close-welcome" onClick={closeWelcome}>Close</button><button id="other" onClick={()=>navigate('library')}>Other route</button><button id="open-test-tab" onClick={()=>openTab("home")}>New</button><button id="noop-close" onClick={()=>closeTab("missing")}>No-op</button><button id="chosen">My focus</button></>;}
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
it('cancels pending return focus when the shell unmounts',async()=>{
  await mount();await click('welcome-entry');await click('close-welcome');
  const fallback=document.createElement('button');document.body.append(fallback);fallback.focus();
  await act(async()=>root.render(null));await act(async()=>vi.advanceTimersByTime(500));
  expect(document.activeElement).toBe(fallback);fallback.remove();
});
it('reopens settings and restores its Welcome entry after it is ready',async()=>{
  await mount();
  const opener=host.querySelector<HTMLButtonElement>('#welcome-entry')!;opener.className='settings-dialog';
  const entry=document.createElement('button');entry.id='welcome-settings-entry';entry.className='settings-dialog';
  const reopen=()=>{document.body.append(entry);entry.focus();};window.addEventListener('vstudy:open-settings',reopen);
  try {
    await click('welcome-entry');await click('close-welcome');
    await act(async()=>vi.advanceTimersByTime(1));expect(document.activeElement).toBe(entry);
  } finally {window.removeEventListener('vstudy:open-settings',reopen);entry.remove();}
});

it('restores Welcome entry focus only after a suspended return route commits',async()=>{
  let hold=false,release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  function DeferredRoutes(){
    const {route,navigate,closeWelcome}=useNavigate();
    if(route.view==='home'&&hold)throw pending;
    return route.view==='welcome'?<button id="close-welcome" onClick={closeWelcome}>Close</button>:<button id="welcome-entry" onClick={()=>navigate('welcome')}>Welcome</button>;
  }
  await act(()=>root.render(<AppShell><Suspense fallback={<p>Loading route</p>}><DeferredRoutes/></Suspense></AppShell>));
  await act(()=>vi.advanceTimersByTime(20));await click('welcome-entry');hold=true;await click('close-welcome');
  await act(()=>vi.advanceTimersByTime(50));
  expect(host.querySelector('#welcome-entry')).toBeNull();
  hold=false;await act(async()=>release());
  await act(()=>vi.advanceTimersByTime(50));
  expect(document.activeElement?.id).toBe('welcome-entry');
});

it('badges the sidebar brand while keeping the profile fallback unbadged', async () => {
  await mount();
  expect(host.querySelector('.shell-brand .beta-badge')?.textContent).toBe('beta');
  expect(host.querySelector('.shell-brand .sr-only')?.textContent?.trim()).toBe('beta');
  expect(host.querySelector('.art-reader-avatar .vstudy-brand')).not.toBeNull();
  expect(host.querySelector('.art-reader-avatar .beta-badge')).toBeNull();
});

import { createTab, saveTabs } from './tab-state';
it.each(['home', 'library', 'last'] as const)('focuses the surviving target after closing into %s', async view => {
  const first = createTab('00000000-0000-4000-8000-000000000001', { view: view === 'last' ? 'home' : view }, 1);
  const closing = createTab('00000000-0000-4000-8000-000000000002', { view: 'home' }, 2);
  saveTabs(localStorage, { version: 1, activeId: closing.id, tabs: view === 'last' ? [closing] : [first, createTab('00000000-0000-4000-8000-000000000003', { view }, 0), closing] });
  await mount();
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true })));
  await act(async () => vi.advanceTimersByTime(20));
  expect(document.activeElement?.id).toEqual(view === 'last' ? 'shell-content' : 'tab-00000000-0000-4000-8000-000000000003');
});

it('leaves a docked sidebar and its focused input alone on Escape', async () => {
  await mount();
  const input = document.createElement('input');
  host.querySelector('.shell-sidebar')!.append(input);
  input.focus();
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })));
  expect(host.querySelector('.app-shell')?.getAttribute('data-sidebar')).toBe('expanded');
  expect(document.activeElement).toBe(input);
});

it.each([900, 1280])('shares shortcut and toggle state at %ipx', async width => {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('1199') ? width < 1200 : false, addEventListener() {}, removeEventListener() {} }));
  await mount();
  const shell = host.querySelector('.app-shell')!;
  const toggle = host.querySelector<HTMLButtonElement>('.shell-toggle')!;
  const initial = shell.getAttribute('data-sidebar');
  expect(toggle.getAttribute('aria-expanded')).toBe(String(initial === 'expanded'));
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, cancelable: true })));
  expect(shell.getAttribute('data-sidebar')).not.toBe(initial);
  expect(toggle.getAttribute('aria-expanded')).toBe(String(shell.getAttribute('data-sidebar') === 'expanded'));
  await act(async () => toggle.click());
  expect(shell.getAttribute('data-sidebar')).toBe(initial);
  await act(async () => window.dispatchEvent(new Event('vstudy:toggle-sidebar')));
  expect(shell.getAttribute('data-sidebar')).not.toBe(initial);
});

it('focuses the active tab after closing an inactive tab with its close button', async () => {
  const tabs = [1, 2, 3].map(index => createTab(
    `00000000-0000-4000-8000-00000000000${index}`, { view: 'home' }, index,
  ));
  saveTabs(localStorage, { version: 1, activeId: tabs[0]!.id, tabs });
  await mount();
  const close = host.querySelectorAll<HTMLButtonElement>('.app-tab-close')[1]!;
  await act(async () => { close.focus(); close.click(); });
  expect(host.querySelectorAll('[role=tab]')).toHaveLength(2);
  expect(document.activeElement?.id).toBe(`tab-${tabs[0]!.id}`);
});

it('does not carry no-op close focus into the next new tab', async () => {
  await mount(); await click('noop-close');
  const chosen = host.querySelector<HTMLButtonElement>('#chosen')!;
  chosen.focus();
  await act(() => host.querySelector<HTMLButtonElement>('#open-test-tab')!.click());
  expect(host.querySelectorAll('[role=tab]')).toHaveLength(2);
  expect(document.activeElement).toBe(chosen);
});
