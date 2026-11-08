import { nativeTabShortcutChannel, type NativeTabShortcut } from '../shared/ipc';
import type { BrowserWindow, WebContents, Input } from 'electron';
import { trackpadScrollBeginChannel, trackpadScrollEndChannel } from '../shared/ipc';

export function attachNavigationInput(window: BrowserWindow): void {
  window.webContents.on('input-event', (_event, input) => {
    if (input.type === 'gestureScrollBegin') window.webContents.send(trackpadScrollBeginChannel);
    if (input.type === 'gestureScrollEnd' || input.type === 'gestureFlingStart') window.webContents.send(trackpadScrollEndChannel);
  });
  window.on('app-command', (_event, command) => {
    if (!window.webContents.isFocused()) return;
    const keyCode = command === 'browser-backward' ? 'Left' : command === 'browser-forward' ? 'Right' : null;
    if (!keyCode) return;
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers: ['alt'] });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers: ['alt'] });
  });
}

export function forwardNativeTabShortcut(owner:WebContents,event:Electron.Event,input:Input):boolean {
  if(input.type!=='keyDown' || input.alt || input.isAutoRepeat) return false;
  const modifier=input.meta || input.control;
  let shortcut:NativeTabShortcut|undefined;
  if(modifier && !input.shift && input.key.toLowerCase()==='t') shortcut='new';
  if(modifier && !input.shift && input.key.toLowerCase()==='w') shortcut='close';
  if((input.control && input.key==='Tab') || (modifier && input.shift && [']','['].includes(input.key))) shortcut=input.key==='[' || (input.key==='Tab' && input.shift) ? 'previous' : 'next';
  if(modifier && !input.shift && /^[1-9]$/.test(input.key)) shortcut=input.key as NativeTabShortcut;
  if(!shortcut) return false;
  event.preventDefault();owner.send(nativeTabShortcutChannel,shortcut);return true;
}
