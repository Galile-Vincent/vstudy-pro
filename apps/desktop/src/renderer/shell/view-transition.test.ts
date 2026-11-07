// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { transitionTo } from './view-transition';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('never blocks navigation when transition setup throws', () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  document.startViewTransition = vi.fn(() => { throw new Error('unsupported'); });
  const apply = vi.fn(); transitionTo(apply); expect(apply).toHaveBeenCalledTimes(1);
});
it('applies exactly once if the API throws after running its update', () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  document.startViewTransition = vi.fn(update => { if (typeof update === 'function') void update(); throw new Error('snapshot failure'); });
  const apply = vi.fn(); transitionTo(apply); expect(apply).toHaveBeenCalledTimes(1);
});
it('skips the API under reduced motion', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  document.startViewTransition = vi.fn();
  const apply = vi.fn(); transitionTo(apply); expect(apply).toHaveBeenCalledTimes(1); expect(document.startViewTransition).not.toHaveBeenCalled();
});

it('a pending snapshot cannot replace a newer immediate document navigation',()=>{
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 vi.stubGlobal('matchMedia',()=>({matches:false}));
 let update!:()=>void;
 document.startViewTransition=vi.fn(callback=>{update=callback as ()=>void;return {ready:Promise.resolve(),finished:Promise.resolve(),skipTransition:vi.fn()} as unknown as ViewTransition;});
 const routes:string[]=[];transitionTo(()=>routes.push('library'));transitionTo(()=>routes.push('document'),false,true);update();
 expect(routes).toEqual(['document']);
});

it('reveals committed local content without delaying immediate navigation for a snapshot',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:false}));
  const content=document.createElement('div');content.id='shell-content';document.body.append(content);
  const animate=vi.fn(()=>({cancel:vi.fn()}));Object.defineProperty(content,'animate',{value:animate});
  document.startViewTransition=vi.fn();
  try {
    transitionTo(()=>{content.textContent='Reader ready';},false,true);
    expect(content.textContent).toBe('Reader ready');
    expect(document.startViewTransition).not.toHaveBeenCalled();
    expect(animate).toHaveBeenCalledOnce();
  } finally {content.remove();}
});
it('immediate navigation has no reveal animation under reduced motion',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true}));
  const content=document.createElement('div');content.id='shell-content';document.body.append(content);
  const animate=vi.fn();Object.defineProperty(content,'animate',{value:animate});
  try {transitionTo(()=>{},false,true);expect(animate).not.toHaveBeenCalled();} finally {content.remove();}
});
it('applies history synchronously under reduced motion and leaves no direction marker', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  document.startViewTransition = vi.fn();
  const apply = vi.fn(); transitionTo(apply, false, false, 'back');
  expect(apply).toHaveBeenCalledTimes(1);
  expect(document.startViewTransition).not.toHaveBeenCalled();
  expect(document.documentElement.dataset.historyDirection).toBeUndefined();
});

it('keeps the newer transition direction when the older transition finishes', async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const finishes: Array<() => void> = [];
  document.startViewTransition = vi.fn(() => ({
    ready: Promise.resolve(), finished: new Promise<void>(resolve => finishes.push(resolve)), skipTransition: vi.fn(),
  }) as unknown as ViewTransition);
  transitionTo(vi.fn(), false, false, 'back');
  transitionTo(vi.fn(), false, false, 'forward');
  finishes[0]!(); await new Promise(resolve => setTimeout(resolve));
  expect(document.documentElement.dataset.historyDirection).toBe('forward');
  finishes[1]!(); await new Promise(resolve => setTimeout(resolve));
  expect(document.documentElement.dataset.historyDirection).toBeUndefined();
});
