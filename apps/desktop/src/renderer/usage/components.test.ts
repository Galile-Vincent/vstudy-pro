// @vitest-environment jsdom
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { UsageChip, money } from './chip';
import { UsageButton, UsageMeter } from './meter';
import { defaultSettings, usageRecordSchema } from '../../shared';
vi.mock('../bridge',()=>({desktop:{invoke:vi.fn()}}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
it('renders literal chip values, details and honest subscription cost label',async()=>{
  const container=document.createElement('div'); const root=createRoot(container);
  await act(async()=>root.render(createElement(UsageChip,{usage:{inputTokens:1200,outputTokens:340,cacheReadTokens:200,reasoningTokens:40,costUsd:.012,costSource:'reported'},subscription:true})));
  expect(container.textContent).toBe('in 1.2K · out 340 · $0.012 · API-equivalent (subscription)');
  expect(container.querySelector('span')?.title).toContain('Cache read 200 · cache write 0 · reasoning 40');
  await act(async()=>root.render(createElement(UsageChip,{usage:{inputTokens:1,outputTokens:2,costSource:'unknown'}})));
  expect(container.textContent).toContain('price unknown');await act(async()=>root.unmount());
});
it('shows budget remaining and an amber threshold meter',async()=>{
  const container=document.createElement('div');const root=createRoot(container);
  await act(async()=>root.render(createElement(UsageMeter,{error:'',data:{settings:{...defaultSettings,monthlyBudgetUsd:10},month:{inputTokens:1200,outputTokens:340,costUsd:8,calls:1,unknownPrices:0,groups:[]},records:[]}})));
  expect(container.textContent).toContain('$8.000 / $10.000 · $2.000 left');expect(container.querySelector('.amber')).not.toBeNull();expect(container.querySelector('progress')?.value).toBe(80);await act(async()=>root.unmount());
});
it('renders overall tokens once and exposes exact chart values accessibly',async()=>{
  const {UsageOverview,UsageTrend}=await import('./dashboard');
  const container=document.createElement('div');const root=createRoot(container);
  const data={summary:{inputTokens:1200,outputTokens:340,costUsd:.012,calls:1,unknownPrices:0,groups:[]},cacheReadTokens:200,cacheWriteTokens:100,reasoningTokens:40,days:[{date:'2026-11-03',inputTokens:1200,outputTokens:340}]};
  await act(async()=>root.render(createElement('div',null,createElement(UsageOverview,{data}),createElement(UsageTrend,{days:data.days}))));
  expect(container.querySelector('.usage-token-total strong')?.textContent).toBe('1,540');
  expect(container.textContent).toContain('Cache read200');expect(container.textContent).toContain('Reasoning40');
  expect(container.querySelector('svg title')?.textContent).toBe('2026-11-03: 1,200 input, 340 output');
  expect(container.querySelector('details table')?.textContent).toContain('1,540');
  await act(async()=>root.unmount());
});

it('requires confirmation for an unpriced request under a USD budget',async()=>{
  const {useBudgetGuard}=await import('./meter');const {desktop}=await import('../bridge');
  const month={inputTokens:0,outputTokens:0,costUsd:20,calls:1,unknownPrices:0,groups:[]};
  const settings={...defaultSettings,monthlyBudgetUsd:10,monthlyTokenBudget:1000};
  const data={settings,month,records:[]};let tokens=100;let submitted=0;
  vi.mocked(desktop.invoke).mockImplementation((channel)=>Promise.resolve(channel==='settings:get'?settings:channel==='usage:summary'?month:{inputTokens:tokens,outputTokens:0,costSource:'estimated'}) as ReturnType<typeof desktop.invoke>);
  function Harness(){
    const state=useBudgetGuard(data,'00000000-0000-4000-8000-000000000001' as Parameters<typeof useBudgetGuard>[1],'question');
    return createElement('form',{onSubmit:(event)=>{state.guard(event);if(!event.defaultPrevented)submitted++;}},createElement(UsageMeter,{data,error:'',priceUnknown:true}),state.warning?createElement('p',{role:'alert'},state.reason):null);
  }
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  await act(async()=>root.render(createElement(Harness)));
  const form=container.querySelector('form')!;
  form.requestSubmit=()=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));};
  await act(async()=>form.requestSubmit());await act(async()=>form.requestSubmit());
  expect(submitted).toBe(0);expect(container.querySelector('[role="alert"]')?.textContent).toBe('The USD budget cannot be checked for this model.');
  expect(container.querySelectorAll('small')).toHaveLength(1);
  expect(container.querySelector('small')?.textContent).toBe("Price unknown for this model");
  tokens=1200;await act(async()=>form.requestSubmit());
  expect(submitted).toBe(0);expect(container.querySelector('[role="alert"]')?.textContent).toBe('The USD budget cannot be checked for this model.');
  await act(async()=>root.unmount());container.remove();vi.mocked(desktop.invoke).mockReset();
});
it('marks aborted usage explicitly',async()=>{
  const container=document.createElement('div');const root=createRoot(container);
  await act(async()=>root.render(createElement(UsageChip,{usage:{inputTokens:100,outputTokens:325,costUsd:.0002,costSource:'estimated'},aborted:true})));
  expect(container.textContent).toBe('in 100 · out 325 · <$0.001 · aborted');
  await act(async()=>root.unmount());
});

it('keeps tiny positive costs visibly nonzero',()=>{expect(money(.0000005)).toBe('<$0.001');expect(money(.00125)).toBe('$0.00125');expect(money(0)).toBe('$0.000');});

it('keeps the full usage description available when narrow panes show the token count',async()=>{
  const host=document.createElement('div');const root=createRoot(host);
  const record=usageRecordSchema.parse({kind:'chat',id:'00000000-0000-4000-8000-000000000001',conversationId:'00000000-0000-4000-8000-000000000002',documentId:'00000000-0000-4000-8000-000000000003',providerId:'openai-api',modelId:'model',createdAt:'2026-11-03T12:00:00Z',inputTokens:1200,outputTokens:340,costUsd:.012,costSource:'reported',aborted:true});
  await act(async()=>root.render(createElement(UsageButton,{onClick:()=>{},error:'',data:{settings:defaultSettings,month:{inputTokens:0,outputTokens:0,calls:0,unknownPrices:0,groups:[]},records:[record]}})));
  expect(host.querySelector('.usage-full')?.textContent).toBe('1.5K tokens · $0.012');
  expect(host.querySelector('.usage-compact')?.textContent).toBe('1.5K');
  expect(host.querySelector('button')?.title).toContain('small pieces of words');
  expect(host.querySelector('button')?.title).toContain('not your account balance');
  expect(host.querySelector('button')?.title).toContain('Conversation usage · 1.5K tokens · $0.012 · includes aborted turns · View usage and budget settings');
  await act(async()=>root.unmount());
});
it('does not show an old monthly unknown-price note for a currently priced model',async()=>{
 const host=document.createElement('div');const root=createRoot(host);
 await act(async()=>root.render(createElement(UsageMeter,{error:'',priceUnknown:false,data:{settings:defaultSettings,month:{inputTokens:10,outputTokens:20,calls:1,unknownPrices:1,groups:[]},records:[]}})));
 expect(host.textContent).toBe('');
 await act(async()=>root.unmount());
});
it('formats weekly and hourly rate windows without raw minute counts',async()=>{
 const {rateWindow}=await import('./settings');
 expect(rateWindow('10080 minute window',String)).toBe('the weekly window');
 expect(rateWindow('300 minute window',String)).toBe('the 5 h window');
});
