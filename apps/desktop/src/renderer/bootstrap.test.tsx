// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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

it('keeps static recovery invisible while appearance and React are still booting',async()=>{
  const html=readFileSync('src/renderer/index.html','utf8');
  const parsed=new DOMParser().parseFromString(html,'text/html');
  const styles=Array.from(parsed.querySelectorAll('style')).map(style=>style.cloneNode(true) as HTMLStyleElement);
  document.head.append(...styles);
  document.body.innerHTML=parsed.body.innerHTML;
  let ready!:()=>void;
  const pending=bootstrap(()=>new Promise<void>(resolve=>{ready=resolve;}),()=>{});
  const fallback=document.querySelector('[role=alert]')!;
  try {
    expect(getComputedStyle(fallback).visibility).toBe('hidden');
    ready();await pending;
    expect(getComputedStyle(fallback).visibility).toBe('hidden');
  }finally{ready();await pending;styles.forEach(style=>style.remove());}
});
