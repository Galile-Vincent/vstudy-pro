// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
vi.mock('./bridge',()=>({desktop:{invoke:vi.fn(async()=>({ok:true}))}}));
import {ProviderRow} from './provider-row';
import {i18n} from '../shared/i18n';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('announces a pending CLI enable check until discovery finishes', async () => {
 await i18n.changeLanguage('en');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 let finish!:()=>void;const pending=new Promise<void>(resolve=>{finish=resolve;});
 try {
  await act(async()=>root.render(<ProviderRow provider={{config:{kind:'cli',id:'claude-cli',enabled:false},availability:{available:false,reason:'Provider disabled'},models:[]}} onRefresh={()=>pending}/>));
  await act(async()=>host.querySelector<HTMLButtonElement>('[role=checkbox]')!.click());
  expect(host.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
  expect(host.querySelector('[role=status]')?.textContent).toBe('Checking provider…');
  await act(async()=>finish());
  expect(host.querySelector('section')?.getAttribute('aria-busy')).toBe('false');
  expect(host.querySelector('[role=status]')).toBeNull();
 } finally {await act(async()=>root.unmount());host.remove();}
});
it('confirms a working session key without claiming it was saved', async () => {
 await i18n.changeLanguage('en');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(<ProviderRow provider={{config:{kind:'api',id:'openai-api',enabled:true},availability:{available:true},models:[{id:'test',name:'Test'}]}} onRefresh={async()=>{}}/>));
  expect(host.querySelector('.provider-status')?.textContent).toContain('Key is available for this session only.');
  expect(host.querySelector('.provider-status')?.textContent).not.toContain('No key saved');
 } finally {await act(async()=>root.unmount());host.remove();}
});

it('explains unavailable Codex isolation on Windows and disables its launch controls', async () => {
 const platform = await import('../shared/platform');
 const hostPlatform = vi.spyOn(platform, 'desktopPlatform').mockReturnValue('win32');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(<ProviderRow provider={{config:{kind:'cli',id:'codex-cli',enabled:false},availability:{available:false,reason:'Provider disabled'},models:[]}} onRefresh={async()=>{}}/>));
  expect(host.querySelector('[role=note]')?.textContent).toContain('macOS process sandbox');
  expect(Array.from(host.querySelectorAll('button')).every(button=>button.disabled)).toBe(true);
 } finally {await act(async()=>root.unmount());host.remove();hostPlatform.mockRestore();}
});

it('asks before deleting a saved key', async () => {
 const {desktop} = await import('./bridge');
 vi.mocked(desktop.invoke).mockResolvedValueOnce({hasKey:true} as never);
 const host=document.createElement('div'); document.body.append(host); const root=createRoot(host);
 try {
  await act(() => root.render(<ProviderRow provider={{config:{kind:'api',id:'openai-api',enabled:true},availability:{available:true},models:[]}} onRefresh={async()=>{}}/>));
  await act(() => [...host.querySelectorAll('button')].find(b=>b.textContent==='Remove')!.click());
  expect(document.querySelector('[role=dialog]')).toBeTruthy();
 } finally {await act(() => root.unmount());host.remove();}
});
