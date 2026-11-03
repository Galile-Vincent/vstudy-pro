// @vitest-environment jsdom
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { UsageChip } from './chip';
import { UsageMeter } from './meter';
import { defaultSettings } from '../../shared';
vi.mock('../bridge',()=>({desktop:{invoke:vi.fn()}}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
it('renders literal chip values, details and honest subscription cost label',async()=>{
  const container=document.createElement('div'); const root=createRoot(container);
  await act(async()=>root.render(createElement(UsageChip,{usage:{inputTokens:1200,outputTokens:340,cacheReadTokens:200,reasoningTokens:40,costUsd:.012,costSource:'reported'},subscription:true})));
  expect(container.textContent).toBe('in 1.2k · out 340 · $0.012 · API-equivalent (subscription)');
  expect(container.querySelector('span')?.title).toContain('Cache read 200 · cache write 0 · reasoning 40 · cost reported');
  await act(async()=>root.render(createElement(UsageChip,{usage:{inputTokens:1,outputTokens:2,costSource:'unknown'}})));
  expect(container.textContent).toContain('price unknown');await act(async()=>root.unmount());
});
it('shows budget remaining and an amber threshold meter',async()=>{
  const container=document.createElement('div');const root=createRoot(container);
  await act(async()=>root.render(createElement(UsageMeter,{error:'',data:{settings:{...defaultSettings,monthlyBudgetUsd:10},month:{inputTokens:1200,outputTokens:340,costUsd:8,calls:1,unknownPrices:0,groups:[]},records:[]}})));
  expect(container.textContent).toContain('$8.000 / $10 · $2.00 left');expect(container.querySelector('.amber')).not.toBeNull();expect(container.querySelector('progress')?.value).toBe(80);await act(async()=>root.unmount());
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
