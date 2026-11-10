// @vitest-environment jsdom
import {act} from 'react';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
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
  await act(async()=>host.querySelector<HTMLInputElement>('input[role=switch]')!.click());
  expect(host.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
  expect(host.querySelector('p[role=status]')?.textContent).toBe('Checking provider…');
  await act(async()=>finish());
  expect(host.querySelector('section')?.getAttribute('aria-busy')).toBe('false');
  expect(host.querySelector('p[role=status]')).toBeNull();
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
  expect(Array.from(host.querySelectorAll('section > :not(dialog) button')).every(button=>(button as HTMLButtonElement).disabled)).toBe(true);
  expect(host.querySelector('input[role=switch]')!.getAttribute('aria-disabled')).toBe('true');
 } finally {await act(async()=>root.unmount());host.remove();hostPlatform.mockRestore();}
});

it('asks before deleting a saved key', async () => {
 const {desktop} = await import('./bridge');
 vi.mocked(desktop.invoke).mockResolvedValueOnce({hasKey:true} as never);
 const host=document.createElement('div'); document.body.append(host); const root=createRoot(host);
 try {
  await act(() => root.render(<ProviderRow provider={{config:{kind:'api',id:'openai-api',enabled:true},availability:{available:true},models:[]}} onRefresh={async()=>{}}/>));
  await act(() => [...host.querySelectorAll('button')].find(b=>b.textContent==='Remove')!.click());
  expect(document.querySelector('dialog[open][role=alertdialog]')).toBeTruthy();
  expect(vi.mocked(desktop.invoke).mock.calls.filter(([channel])=>channel==='secrets:delete')).toHaveLength(0);
 } finally {await act(() => root.unmount());host.remove();}
});
it('names provider actions with the provider', async () => {
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(() => root.render(<ProviderRow provider={{config:{kind:'api',id:'openai-api',enabled:true},availability:{available:true},models:[]}} onRefresh={async()=>{}}/>));
  expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Get a key')?.getAttribute('aria-label')).toContain('OpenAI');
 } finally {await act(() => root.unmount());host.remove();}
});

it('includes visible Retry text in the save key accessible name', async () => {
 const {desktop}=await import('./bridge');
 vi.mocked(desktop.invoke).mockImplementation(async channel=>{if(channel==='secrets:has')return {hasKey:false} as never;throw new Error('failed');});
 try {
  render(<ProviderRow provider={{config:{kind:'api',id:'anthropic-api',enabled:true},availability:{available:true},models:[]}} onRefresh={async()=>{}}/>);
  fireEvent.change(screen.getByLabelText('Anthropic API key'),{target:{value:'key'}});
  fireEvent.submit(screen.getByLabelText('Anthropic API key').closest('form')!);
  await screen.findByRole('alert');
  expect(screen.getByRole('button',{name:'Retry — Anthropic'}).textContent).toBe('Retry');
 } finally {cleanup();}
});

it('keeps failed key removal actionable with an error inside confirmation', async () => {
 const {desktop}=await import('./bridge');
 vi.mocked(desktop.invoke).mockImplementation(async channel=>{if(channel==='secrets:has')return {hasKey:true} as never;throw new Error('failed');});
 try {
  render(<ProviderRow provider={{config:{kind:'api',id:'openai-api',enabled:true},availability:{available:true},models:[]}} onRefresh={async()=>{}}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Remove — OpenAI'}));
  const {within}=await import('@testing-library/react');
  const confirmation=screen.getByRole('alertdialog');
  fireEvent.click(within(confirmation).getByRole('button',{name:'Remove'}));
  await within(confirmation).findByRole('alert');
  expect((within(confirmation).getByRole('button',{name:'Remove'}) as HTMLButtonElement).disabled).toBe(false);
 } finally {cleanup();}
});

it('submits the key form from its Save key button', async () => {
  const {desktop}=await import('./bridge');
  vi.mocked(desktop.invoke).mockReset().mockImplementation(async channel=>(channel==='secrets:has'?{hasKey:false}:{ok:true}) as never);
  try {
    render(<ProviderRow provider={{config:{kind:'api',id:'anthropic-api',enabled:true},availability:{available:true},models:[]}} onRefresh={async()=>{}}/>);
    fireEvent.change(screen.getByLabelText('Anthropic API key'),{target:{value:'sk-test'}});
    fireEvent.click(screen.getByRole('button',{name:'Save key — Anthropic'}));
    await vi.waitFor(()=>expect(desktop.invoke).toHaveBeenCalledWith('secrets:set',{providerId:'anthropic-api',key:'sk-test'}));
  } finally {cleanup();}
});
