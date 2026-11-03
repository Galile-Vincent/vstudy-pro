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
