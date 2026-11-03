// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ModelPicker, ModelOptions } from './model-picker';
import { defaultSettings } from '../shared';
import type { Providers } from './providers';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('./bridge', () => ({ desktop: { invoke } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const providers: Providers = [{ config: { kind:'cli', id:'codex-cli', enabled:true }, availability:{available:true}, models:[{id:'sol',name:'Sol', options:[{id:'reasoningEffort',label:'Effort',values:[{id:'low',label:'low'},{id:'ultra',label:'ultra'}],default:'low'}]},{id:'other',name:'Other'}] }];
it('searches, selects with keyboard and persists favorites', async () => {
 invoke.mockResolvedValue(defaultSettings);
 const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); const onModel = vi.fn();
 await act(async () => root.render(<ModelPicker providers={providers} model="codex-cli/sol" onModel={onModel} onSettings={() => {}} />));
 await act(async () => (host.querySelector('[aria-label="Model"]') as HTMLButtonElement).click());
 expect(host.querySelector('[aria-selected=true]')?.textContent).toContain('Current');
 await act(async () => (host.querySelector('[aria-label="Favorite Sol"]') as HTMLButtonElement).click());
 expect(invoke).toHaveBeenCalledWith('settings:set', expect.objectContaining({favoriteModels:['codex-cli/sol']}));
 const search = host.querySelector('input')!;
 await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(search,'Other'); search.dispatchEvent(new Event('input',{bubbles:true})); });
 expect(host.querySelectorAll('[role=option]')).toHaveLength(1);
 await act(async () => search.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
 await act(async () => search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
 expect(onModel).toHaveBeenCalledWith('codex-cli/other');
 await act(async () => root.unmount()); host.remove();
});
it('shows effort only for a model declaring it', async () => {
 const host = document.createElement('div'); const root = createRoot(host);
 await act(async () => root.render(<ModelOptions providers={providers} model="codex-cli/sol" values={{}} onChange={() => {}} />));
 expect(host.querySelector('[aria-label=Effort]')).not.toBeNull();
 await act(async () => root.render(<ModelOptions providers={providers} model="codex-cli/other" values={{}} onChange={() => {}} />));
 expect(host.querySelector('[aria-label=Effort]')).toBeNull(); await act(async () => root.unmount());
});
