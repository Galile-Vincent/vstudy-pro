// @vitest-environment jsdom
import { act, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { documentSchema } from '../../shared/domain';
import type { Providers } from '../provider-metadata';
import { AiParseControls } from './ai-parse-controls';

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.scrollIntoView = () => {};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('discovers a cold catalog, selects another model, and starts without cap or override fields', async () => {
 const doc = documentSchema.parse({id:'00000000-0000-4000-8000-000000000001',title:'Document',sourceName:'source.md',sourceHash:'a'.repeat(64),sourcePath:'/tmp/source.md',markdownPath:'/tmp/content.md',mime:'text/markdown',status:'ready',createdAt:new Date().toISOString()});
 const warm: Providers = [{config:{kind:'api',id:'openai-api',enabled:true},availability:{available:true},models:[{id:'first',name:'First model'},{id:'second',name:'Second model'}]}];
 const invoke = vi.fn(async (channel: string) => {
  if(channel==='aiParse:estimate') return {pages:1,inputTokens:100,outputTokens:100,billing:'api',supportsImages:false};
  return {documentId:doc.id,status:'idle',activeVersion:'original',pages:[]};
 });
 const previous = Object.getOwnPropertyDescriptor(window,'desktop');
 Object.defineProperty(window,'desktop',{configurable:true,value:{invoke}});
 let discover!: () => void;
 const gate = new Promise<void>(resolve=>{discover=resolve;});
 const requested = vi.fn();
 function Harness() {
  const [providers,setProviders] = useState<Providers>([]);
  const refresh = useCallback(async()=>{requested();await gate;setProviders(warm);},[]);
  return <AiParseControls document={doc} providers={providers} pageCount={1} initiallyOpen onProvidersChanged={refresh} onReload={async()=>{}} onSettings={()=>{}}/>;
 }
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(<Harness/>));
  expect(requested).toHaveBeenCalledOnce();
  await act(async()=>{discover();await gate;});
  expect(document.querySelector('.ai-parse-popover [data-slot=model-selector-value]')?.textContent).toContain('First model');
  const picker=document.querySelector<HTMLButtonElement>('.ai-parse-popover [aria-label=Model]');
  if(!picker)throw new Error('Missing model picker');
  await act(async()=>picker.click());
  const second=Array.from(document.querySelectorAll<HTMLElement>('[data-slot=model-selector-item]')).find(item=>item.textContent?.includes('Second model'));
  if(!second)throw new Error('Missing second model');
  await act(async()=>second.click());
  expect(document.querySelector('.ai-parse-popover [data-slot=model-selector-value]')?.textContent).toContain('Second model');
  expect(requested.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(document.querySelector('.ai-parse-popover input[type=number]')).toBeNull();
  expect(document.querySelector('.ai-parse-popover input[type=checkbox]')).toBeNull();
  const estimate=Array.from(document.querySelectorAll<HTMLButtonElement>('.ai-parse-popover button')).find(button=>button.textContent==='Estimate cost');
  if(!estimate)throw new Error('Missing estimate action');
  await act(async()=>estimate.click());
  const start=Array.from(document.querySelectorAll<HTMLButtonElement>('.ai-parse-popover button')).find(button=>button.textContent==='Confirm and improve');
  if(!start)throw new Error('Missing start action');
  expect(start.disabled).toBe(false);
  await act(async()=>start.click());
  expect(invoke).toHaveBeenCalledWith('aiParse:start',expect.objectContaining({providerId:'openai-api',modelId:'second',options:{concurrency:2,confirmBudgetOverride:false,modelOptions:{}}}));
 } finally {
  await act(async()=>root.unmount());host.remove();
  if(previous)Object.defineProperty(window,'desktop',previous);else Reflect.deleteProperty(window,'desktop');
 }
});

it('shows an actionable publication failure and hides unusable AI version actions',async()=>{
 const doc=documentSchema.parse({id:'00000000-0000-4000-8000-000000000001',title:'Document',sourceName:'source.md',sourceHash:'a'.repeat(64),sourcePath:'/tmp/source.md',markdownPath:'/tmp/content.md',mime:'text/markdown',status:'ready',createdAt:new Date().toISOString()});
 const previous=Object.getOwnPropertyDescriptor(window,'desktop');Object.defineProperty(window,'desktop',{configurable:true,value:{invoke:vi.fn(async()=>({documentId:doc.id,status:'cancelled',code:'ai_parse.publish_failed',activeVersion:'original',pages:[{page:1,status:'done'}]}))}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(<AiParseControls document={doc} providers={[]} pageCount={1} initiallyOpen onProvidersChanged={async()=>{}} onReload={async()=>{}} onSettings={()=>{}}/>));
  expect(document.querySelector('[role=alert]')?.textContent).toContain('could not be saved');
  expect(Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Use AI version')).toBe(false);
 } finally {await act(async()=>root.unmount());host.remove();if(previous)Object.defineProperty(window,'desktop',previous);else Reflect.deleteProperty(window,'desktop');}
});
