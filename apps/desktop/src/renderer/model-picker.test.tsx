// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ModelPicker, pickerModels } from './model-picker';
import { claudeModels } from '../main/providers/models';
import claudeCatalog from '../main/providers/fixtures/claude-models.json';
import { defaultSettings } from '../shared';
import type { Providers } from './providers';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('./bridge', () => ({ desktop: { invoke } }));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.scrollIntoView = () => {};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const providers: Providers = [{ config: { kind:'cli', id:'codex-cli', enabled:true }, availability:{available:true}, models:[{id:'sol',name:'Sol', options:[{id:'reasoningEffort',label:'Effort',values:[{id:'low',label:'low'},{id:'ultra',label:'ultra'}],default:'low'}]},{id:'other',name:'Other'}] }];
it('searches, selects with keyboard and persists favorites', async () => {
 invoke.mockResolvedValue(defaultSettings);
 const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); const onModel = vi.fn();
 await act(async () => root.render(<ModelPicker providers={providers} model="codex-cli/sol" onModel={onModel} onSettings={() => {}} />));
 await act(async () => (host.querySelector('[aria-label="Model"]') as HTMLButtonElement).click());
 expect(document.querySelector('[cmdk-item]')?.textContent).toContain('Other');
 await act(async () => (document.querySelector('[aria-label="Favorite Sol"]') as HTMLButtonElement).click());
 expect(invoke).toHaveBeenCalledWith('settings:set', expect.objectContaining({favoriteModels:['codex-cli/sol']}));
 const search = document.querySelector('input')!;
 await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(search,'Other'); search.dispatchEvent(new Event('input',{bubbles:true})); });
 expect(document.querySelectorAll('[role=option]')).toHaveLength(1);
 await act(async () => search.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
 await act(async () => search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
 expect(onModel).toHaveBeenCalledWith('codex-cli/other');
 await act(async () => root.unmount()); host.remove();
});
it('deduplicates the real Claude catalog while preserving a labelled default and raw-id selection', () => {
 const models = pickerModels([{ config: {kind:'cli',id:'claude-cli',enabled:true},availability:{available:true},models:claudeModels(claudeCatalog) }]);
 expect(models.map(m => m.id)).toEqual(['default','opus','fable','sonnet','haiku','claude-haiku-4-5-20251001','claude-sonnet-5','claude-opus-5','claude-fable-5','claude-opus-4-8','claude-opus-4-7','claude-opus-4-6','claude-sonnet-4-6']);
 expect(models[0]?.name).toBe('Default · Sonnet 5.5');
 expect(models.filter(m => m.resolvedId === 'claude-opus-5-5')).toHaveLength(1);
 expect(models.find(m => m.id === 'opus')?.name).toBe('Opus 5.5');
});
it('exposes human effort labels, default tag and priority switch in the vendor popover', async () => {
 const host = document.createElement('div'); document.body.append(host); const root=createRoot(host); const onChange=vi.fn();
 const catalog: Providers = [{...providers[0]!,models:[{id:'sol',name:'Sol',options:[{id:'reasoningEffort',label:'Effort',values:[{id:'low',label:'low'},{id:'xhigh',label:'xhigh'}],default:'low'},{id:'serviceTier',label:'Service tier',values:[{id:'default',label:'default'},{id:'priority',label:'priority'}],default:'default'}]}]}];
 await act(async()=>root.render(<ModelPicker providers={catalog} model="codex-cli/sol" values={{}} onChange={onChange} onModel={()=>{}} onSettings={()=>{}} />));
 expect(host.textContent).toContain('Sol· Low');
 await act(async()=> (host.querySelector('[aria-label="Model"]') as HTMLButtonElement).click());
 expect(document.querySelector('[role=radiogroup]')?.getAttribute('aria-label')).toBe('Effort');
 expect(document.querySelector('[role=radio][data-state=checked]')?.textContent).toBe('Lowdefault');
 expect(document.querySelector('[role=radio][data-state=unchecked]')?.textContent).toBe('Extra high');
 await act(async()=>document.querySelector('[role=radio][data-state=checked]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));
 expect(onChange).toHaveBeenCalledWith({reasoningEffort:'xhigh'});
 await act(async()=> (document.querySelector('[role=switch]') as HTMLButtonElement).click());
 expect(onChange).toHaveBeenCalledWith({serviceTier:'priority'});
 await act(async()=>root.unmount());host.remove();
});
it('restores a saved resolved-ID selection and favorite on its single friendly row', async () => {
 invoke.mockResolvedValue({...defaultSettings,favoriteModels:['claude-cli/claude-opus-5-5']});
 const catalog: Providers = [{config:{kind:'cli',id:'claude-cli',enabled:true},availability:{available:true},models:claudeModels(claudeCatalog)}];
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<ModelPicker providers={catalog} model="claude-cli/claude-opus-5-5" onModel={()=>{}} onSettings={()=>{}} />));
 expect(host.querySelector('.model-trigger-name')?.textContent).toBe('Opus 5.5');
 await act(async()=> (host.querySelector('[aria-label="Model"]') as HTMLButtonElement).click());
 expect(document.querySelector('[aria-label="Unfavorite Opus 5.5"]')?.getAttribute('aria-pressed')).toBe('true');
 expect(document.querySelectorAll('[aria-label="Favorite claude-opus-5-5"]')).toHaveLength(0);
 await act(async()=>root.unmount());host.remove();
});
it('orders Recent by recency and searches punctuation-independent tokens out of order', async () => {
 invoke.mockResolvedValue({...defaultSettings,recentModels:['codex-cli/other','codex-cli/gpt-6.1-sol']});
 const catalog:Providers=[{config:{kind:'cli',id:'codex-cli',enabled:true},availability:{available:true},models:[{id:'gpt-6.1-sol',name:'GPT-6.1 Sol'},{id:'other',name:'Other'}]}];
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<ModelPicker providers={catalog} model="codex-cli/gpt-6.1-sol" onModel={()=>{}} onSettings={()=>{}}/>));
 await act(async()=> (host.querySelector('[aria-label="Model"]') as HTMLButtonElement).click());
 expect(Array.from(document.querySelectorAll('[role=option]')).map(x=>x.textContent)).toEqual(['Other','GPT-6.1 Sol']);
 const input=document.querySelector('input')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'6 GPT');input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(Array.from(document.querySelectorAll('[role=option]')).map(x=>x.textContent)).toEqual(['GPT-6.1 Sol']);
 await act(async()=>root.unmount());host.remove();
});
it('collapses disabled API models below usable CLI groups', () => {
 const result=pickerModels([{config:{kind:'api',id:'anthropic-api',enabled:false},availability:{available:false,reason:'key'},models:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}]},...providers]);
 expect(result.map(m=>[m.name,m.available])).toEqual([['Sol',true],['Other',true],['Anthropic API',false]]);
 expect(result.at(-1)?.reason).toBe('Add a key');
});
it('sorts family versions descending with a stable name tie break', async () => {
 const {compareModels}=await import('./model-picker');
 expect(['GPT-6 Sol','GPT-6.1 Sol','GPT-5 Sol','Gemini 3'].map(name=>({name})).sort(compareModels).map(m=>m.name)).toEqual(['Gemini 3','GPT-6.1 Sol','GPT-6 Sol','GPT-5 Sol']);
});

it.each([['en','Thinking','Enabled','Disabled'],['zh-Hant','思考','啟用','停用'],['ja','思考','有効','無効']])('localizes app-owned thinking controls in %s', async (locale,label,on,off) => {
 const {i18n}=await import('../shared/i18n');await i18n.changeLanguage(locale);
 invoke.mockResolvedValue(defaultSettings);
 const catalog:Providers=[{config:{kind:'cli',id:'claude-cli',enabled:true},availability:{available:true},models:claudeModels([{value:'test',displayName:'Test',supportsThinkingOff:true}])}];
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(<ModelPicker providers={catalog} model="claude-cli/test" onChange={()=>{}} onModel={()=>{}} onSettings={()=>{}}/>));
  await act(async()=> (host.querySelector('.model-trigger') as HTMLButtonElement).click());
  expect(document.querySelector('[role=radiogroup]')?.getAttribute('aria-label')).toBe(label);
  expect(Array.from(document.querySelectorAll('[role=radio]')).map(e=>e.textContent)).toEqual([on,off]);
 } finally {await act(async()=>root.unmount());host.remove();await i18n.changeLanguage('en');}
});
