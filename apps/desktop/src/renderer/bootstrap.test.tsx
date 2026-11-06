// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { bootstrap } from './bootstrap';
import { i18n, tr } from '../shared/i18n';
vi.mock('./bridge',()=>({desktop:{invoke:vi.fn().mockResolvedValue({ok:true})}}));
afterEach(()=>{cleanup();document.body.replaceChildren();delete document.documentElement.dataset.appearanceReady;});
it.each(['en','zh-Hant','ja'])('reveals a localized recovery screen when appearance fails in %s',async language=>{
  await i18n.changeLanguage(language);
  const host=document.createElement('div');host.id='root';document.body.append(host);
  const reload=vi.fn(),render=vi.fn();
  await bootstrap(async()=>{throw new Error('failed');},render,reload);
  expect(document.documentElement.dataset.appearanceReady).toBe('true');
  expect(screen.getByRole('alert').textContent).toContain(tr('common:surface_render_error'));
  fireEvent.click(screen.getByRole('button',{name:tr('common:reload_application')}));
  expect(reload).toHaveBeenCalledOnce();expect(render).not.toHaveBeenCalled();
});
it('reveals recovery even if the application root is missing',async()=>{
  await bootstrap(async()=>{},()=>{throw new Error('root missing');});
  expect(document.documentElement.dataset.appearanceReady).toBe('true');
  expect(screen.getByRole('button',{name:tr('common:reload_application')})).toBeTruthy();
});

it('arms static recovery to become visible after ten seconds without JavaScript',()=>{
  const html=readFileSync('src/renderer/index.html','utf8');
  const parsed=new DOMParser().parseFromString(html,'text/html');
  const styles=Array.from(parsed.querySelectorAll('style')).map(style=>style.cloneNode(true) as HTMLStyleElement);
  document.head.append(...styles);
  document.body.innerHTML=parsed.body.innerHTML;
  try {
    const fallback=document.querySelector('[role=alert]')!;
    expect(getComputedStyle(fallback).visibility).toBe('hidden');
    expect(getComputedStyle(fallback).animation).toBe('bootstrap-timeout 0s 10s forwards');
    const keyframes=styles.flatMap(style=>Array.from(style.sheet!.cssRules))
      .find(rule=>rule instanceof CSSKeyframesRule && rule.name==='bootstrap-timeout') as CSSKeyframesRule;
    expect(keyframes).toBeDefined();
    const end=keyframes.cssRules[0] as CSSKeyframeRule;
    expect(end.keyText).toBe('100%');
    expect(end.style.visibility).toBe('visible');
  }finally{styles.forEach(style=>style.remove());}
});

it('removes static recovery when bootstrap commits the application',async()=>{
  document.body.innerHTML=new DOMParser().parseFromString(readFileSync('src/renderer/index.html','utf8'),'text/html').body.innerHTML;
  let ready!:()=>void;
  const root=createRoot(document.getElementById('root')!);
  const pending=bootstrap(()=>new Promise<void>(resolve=>{ready=resolve;}),()=>root.render(<p>Application ready</p>));
  try {
    expect(document.querySelector('.bootstrap-fallback')).not.toBeNull();
    await act(async()=>{ready();await pending;});
    expect(screen.getByText('Application ready')).toBeTruthy();
    expect(document.querySelector('.bootstrap-fallback')).toBeNull();
  }finally{await act(()=>root.unmount());}
});
