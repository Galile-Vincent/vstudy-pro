/** Keep normal bounds across restarts and ignore removed displays or corrupt state. */
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ display: vi.fn(() => ({workArea:{x:0,y:0,width:1920,height:1080}})) }));
vi.mock('electron', () => ({ screen: { getDisplayMatching: mocks.display } }));
vi.mock('./logging', () => ({ log: vi.fn() }));
import { readWindowState, trackWindowState } from './window-state';
const root = mkdtempSync(join(tmpdir(), 'vstudy-window-'));
afterEach(() => { vi.useRealTimers(); rmSync(join(root,'window-state.json'), {force:true}); });
it('restores visible normal bounds and maximized state', () => {
  const state = {x:80,y:100,width:1000,height:720,maximized:true};
  writeFileSync(join(root,'window-state.json'), JSON.stringify(state));
  expect(readWindowState(root)).toEqual(state);
  expect(mocks.display).toHaveBeenCalledWith(expect.objectContaining({x:80,y:100,width:1000,height:720}));
});
it.each([{x:-3000,y:0,width:1200,height:800,maximized:true}, {x:0,y:0,width:-1,height:800}, {x:0,y:0,width:'1000',height:800}])('falls back for invalid or off-screen bounds %j', state => {
  writeFileSync(join(root,'window-state.json'), JSON.stringify(state));
  expect(readWindowState(root)).toEqual({width:1200,height:800,maximized:false});
});
it('tolerates corrupt JSON', () => {
  writeFileSync(join(root,'window-state.json'), '{oops');
  expect(readWindowState(root)).toEqual({width:1200,height:800,maximized:false});
});
it('debounces atomic writes and saves normal bounds on close', () => {
  vi.useFakeTimers();
  const bounds = {x:80,y:100,width:1000,height:720};
  const window = Object.assign(new EventEmitter(), {getNormalBounds:()=>bounds,isDestroyed:()=>false,isMaximized:()=>true,maximize:vi.fn()});
  trackWindowState(window as unknown as Electron.BrowserWindow, root, {width:1200,height:800,maximized:false});
  window.emit('resize'); bounds.width=1100; window.emit('move');
  expect(readdirSync(root)).toEqual([]);
  vi.advanceTimersByTime(300);
  expect(JSON.parse(readFileSync(join(root,'window-state.json'),'utf8'))).toEqual({...bounds,maximized:true});
  bounds.x=120; window.emit('move'); window.emit('close');
  expect(JSON.parse(readFileSync(join(root,'window-state.json'),'utf8')).x).toBe(120);
  expect(readdirSync(root)).toEqual(['window-state.json']);
});
it('waits until a hidden window is shown to restore maximization', () => {
  const window = Object.assign(new EventEmitter(), {maximize:vi.fn()});
  trackWindowState(window as unknown as Electron.BrowserWindow, root, {width:1200,height:800,maximized:true});
  expect(window.maximize).not.toHaveBeenCalled();
  window.emit('show');
  expect(window.maximize).toHaveBeenCalledOnce();
});

it('cancels pending and future writes when quiesced', () => {
  vi.useFakeTimers();
  const window = Object.assign(new EventEmitter(), {getNormalBounds:()=>({x:0,y:0,width:1000,height:720}),isDestroyed:()=>false,isMaximized:()=>false});
  const stop = trackWindowState(window as unknown as Electron.BrowserWindow, root, {width:1200,height:800,maximized:false});
  window.emit('resize'); stop();
  window.emit('move'); window.emit('close'); vi.advanceTimersByTime(1000);
  expect(readdirSync(root)).toEqual([]);
});
