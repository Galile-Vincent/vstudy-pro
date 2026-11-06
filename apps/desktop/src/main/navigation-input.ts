import type { BrowserWindow } from 'electron';
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
