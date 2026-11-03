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
  await act(async()=>root.render(<ProviderRow provider={{config:{kind:'cli',id:'codex-cli',enabled:false},availability:{available:false,reason:'Provider disabled'},models:[]}} onRefresh={()=>pending}/>));
  await act(async()=>host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
  expect(host.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
  expect(host.querySelector('[role=status]')?.textContent).toBe('Checking provider…');
  await act(async()=>finish());
  expect(host.querySelector('section')?.getAttribute('aria-busy')).toBe('false');
  expect(host.querySelector('[role=status]')).toBeNull();
 } finally {await act(async()=>root.unmount());host.remove();}
});
