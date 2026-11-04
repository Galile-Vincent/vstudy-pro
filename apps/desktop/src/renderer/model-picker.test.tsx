// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { pickerModels } from './model-catalog';
import { ModelControls } from './model-controls';
import { claudeModels } from '../main/providers/models';
import claudeCatalog from '../main/providers/fixtures/claude-models.json';
import type { Providers } from './providers';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('./bridge', () => ({ desktop: { invoke } }));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.scrollIntoView = () => {};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const providers: Providers = [{ config: { kind:'cli', id:'codex-cli', enabled:true }, availability:{available:true}, models:[{id:'sol',name:'Sol', options:[{id:'reasoningEffort',label:'Effort',values:[{id:'low',label:'low'},{id:'ultra',label:'ultra'}],default:'low'}]},{id:'other',name:'Other'}] }];
it('deduplicates the real Claude catalog while preserving a labelled default and raw-id selection', () => {
 const models = pickerModels([{ config: {kind:'cli',id:'claude-cli',enabled:true},availability:{available:true},models:claudeModels(claudeCatalog) }]);
 expect(models.map(m => m.id)).toEqual(['default','opus','fable','sonnet','haiku','claude-haiku-4-5-20251001','claude-sonnet-5','claude-opus-5','claude-fable-5','claude-opus-4-8','claude-opus-4-7','claude-opus-4-6','claude-sonnet-4-6']);
 expect(models[0]?.name).toBe('Default · Sonnet 5.5');
 expect(models.filter(m => m.resolvedId === 'claude-opus-5-5')).toHaveLength(1);
 expect(models.find(m => m.id === 'opus')?.name).toBe('Opus 5.5');
});
it('collapses disabled API models below usable CLI groups', () => {
 const result=pickerModels([{config:{kind:'api',id:'anthropic-api',enabled:false},availability:{available:false,reason:'key'},models:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}]},...providers]);
 expect(result.map(m=>[m.name,m.available])).toEqual([['Sol',true],['Other',true],['Anthropic API',false]]);
 expect(result.at(-1)?.reason).toBe('Add a key');
});
it('sorts family versions descending with a stable name tie break', async () => {
 const {compareModels}=await import('./model-catalog');
 expect(['GPT-6 Sol','GPT-6.1 Sol','GPT-5 Sol','Gemini 3'].map(name=>({name})).sort(compareModels).map(m=>m.name)).toEqual(['Gemini 3','GPT-6.1 Sol','GPT-6 Sol','GPT-5 Sol']);
});

it('uses the vendor search and keyboard model selection', async () => {
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const onModel=vi.fn();
 try {
  await act(async()=>root.render(<ModelControls providers={providers} model="codex-cli/sol" onModel={onModel} onSettings={()=>{}}/>));
  await act(async()=>(host.querySelector('[aria-label="Model"]') as HTMLButtonElement).click());
  const input=document.querySelector('input')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Other');input.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(document.querySelectorAll('[role=option]')).toHaveLength(1);
  await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
  await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  expect(onModel).toHaveBeenCalledWith('codex-cli/other');
 } finally {await act(async()=>root.unmount());host.remove();}
});

it('restores raw aliases to a single vendor row and keeps Fast adjacent', async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const onChange=vi.fn();
 const catalog:Providers=[{config:{kind:'cli',id:'claude-cli',enabled:true},availability:{available:true},models:claudeModels(claudeCatalog)}];
 try {await act(async()=>root.render(<ModelControls providers={catalog} model="claude-cli/claude-opus-5-5" onModel={()=>{}} onSettings={()=>{}} onChange={onChange}/>));
 expect(host.querySelector('[data-slot=model-selector-value]')?.textContent).toContain('Opus 5.5');
 expect(host.querySelector('[aria-label="Effort"]')).not.toBeNull();
 const fast=host.querySelector<HTMLButtonElement>('[aria-label="Fast"]')!;expect(fast).not.toBeNull();await act(async()=>fast.click());expect(onChange).toHaveBeenCalledWith({fastMode:true});
 expect(document.querySelector('.model-traits')).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});
