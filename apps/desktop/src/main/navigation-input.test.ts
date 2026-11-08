import { EventEmitter } from 'node:events';
import type { Input, WebContents, BrowserWindow } from 'electron';
import { expect, it, vi } from 'vitest';
import { forwardNativeTabShortcut, attachNavigationInput } from './navigation-input';
import { trackpadEventArgumentsSchema, trackpadScrollBeginChannel, trackpadScrollEndChannel } from '../shared/ipc';

it('forwards only parameterless gesture boundaries from the owning contents', () => {
  const contents = Object.assign(new EventEmitter(), { send: vi.fn(), isFocused: () => true });
  const window = Object.assign(new EventEmitter(), { webContents: contents });
  const guest = new EventEmitter();
  attachNavigationInput(window as unknown as BrowserWindow);
  guest.emit('input-event', {}, { type: 'gestureScrollBegin' });
  contents.emit('input-event', {}, { type: 'mouseWheel' });
  expect(contents.send).not.toHaveBeenCalled();
  for (const type of ['gestureScrollBegin', 'gestureFlingStart', 'gestureScrollEnd']) contents.emit('input-event', {}, { type });
  expect(contents.send.mock.calls).toEqual([[trackpadScrollBeginChannel], [trackpadScrollEndChannel], [trackpadScrollEndChannel]]);
  expect(trackpadEventArgumentsSchema.safeParse([]).success).toBe(true);
  expect(trackpadEventArgumentsSchema.safeParse([undefined]).success).toBe(false);
  expect(trackpadEventArgumentsSchema.safeParse([{ direction: 'back' }]).success).toBe(false);
});

it('ignores unrelated app commands and commands while a guest owns focus', () => {
  const contents = Object.assign(new EventEmitter(), { sendInputEvent: vi.fn(), isFocused: vi.fn(() => false) });
  const window = Object.assign(new EventEmitter(), { webContents: contents });
  attachNavigationInput(window as unknown as BrowserWindow);
  window.emit('app-command', {}, 'browser-backward');
  expect(contents.sendInputEvent).not.toHaveBeenCalled();
  contents.isFocused.mockReturnValue(true);
  window.emit('app-command', {}, 'volume-up');
  expect(contents.sendInputEvent).not.toHaveBeenCalled();
  window.emit('app-command', {}, 'browser-forward');
  expect(contents.sendInputEvent.mock.calls).toEqual([
    [{ type: 'keyDown', keyCode: 'Right', modifiers: ['alt'] }],
    [{ type: 'keyUp', keyCode: 'Right', modifiers: ['alt'] }],
  ]);
});

it.each([['}','BracketRight','next'],['{','BracketLeft','previous']])('forwards shifted bracket %s by physical code',(key,code,expected)=>{
 const send=vi.fn(),preventDefault=vi.fn();
 expect(forwardNativeTabShortcut({send} as unknown as WebContents,{preventDefault} as unknown as Electron.Event,{type:'keyDown',key,code,meta:true,shift:true} as Input)).toBe(true);
 expect(send).toHaveBeenCalledWith(expect.any(String),expected);
});
