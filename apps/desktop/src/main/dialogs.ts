import { app, BrowserWindow, dialog, type MessageBoxOptions } from 'electron';
import { coalescePrompt } from './services/prompt';
export const showAttachedMessage = coalescePrompt(async (options: MessageBoxOptions) => {
  const parent = await new Promise<BrowserWindow>(resolve => {
    const visible = () => BrowserWindow.getAllWindows().find(window => window.isVisible() && !window.isDestroyed());
    const current = visible();
    if (current) { resolve(current); return; }
    const shown = () => { const window = visible(); if (window) { app.removeListener('browser-window-focus', shown); resolve(window); } };
    app.on('browser-window-focus', shown);
  });
  return dialog.showMessageBox(parent, options);
});
