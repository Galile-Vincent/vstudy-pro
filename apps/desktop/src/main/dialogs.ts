/**
 * Attach native message dialogs to the active application window.
 * Owned by main.
 * Main owns privileged resources; shutdown must settle work before releasing those resources.
 * @packageDocumentation
 */
import { app, BrowserWindow, dialog, type MessageBoxOptions, type WebContents } from 'electron';
import { tr } from './i18n';
import { coalescePrompt } from './services/prompt';
const showVisibleMessage = coalescePrompt(async (options: MessageBoxOptions) => {
  const parent = await new Promise<BrowserWindow>(resolve => {
    const visible = () => BrowserWindow.getAllWindows().find(window => window.isVisible() && !window.isDestroyed());
    const current = visible();
    if (current) { resolve(current); return; }
    const shown = () => { const window = visible(); if (window) { app.removeListener('browser-window-focus', shown); resolve(window); } };
    app.on('browser-window-focus', shown);
  });
  return dialog.showMessageBox(parent, options);
});

/** Resolve exactly the initiating window; a closed sender must not prompt another window. */
export function ownerWindow(sender: WebContents): BrowserWindow {
  const window = BrowserWindow.fromWebContents(sender);
  if (!window || window.isDestroyed()) throw new Error('Dialog owner closed');
  return window;
}
const showOwnedMessage = coalescePrompt(async ({options, ownerId}: {options:MessageBoxOptions; ownerId:number}) => {
  const parent = BrowserWindow.fromId(ownerId);
  if (!parent || parent.isDestroyed()) return {response:options.cancelId ?? 0, checkboxChecked:false};
  return dialog.showMessageBox(parent, options);
});
export function showAttachedMessage(options: MessageBoxOptions, sender?: WebContents): Promise<Electron.MessageBoxReturnValue> {
  return sender ? showOwnedMessage({options, ownerId:ownerWindow(sender).id}) : showVisibleMessage(options);
}

export type StartupStage = 'recovery' | 'database' | 'services' | 'window';
/** Fatal startup errors must be visible even before Electron or a window is ready. */
export function showStartupError(error: unknown, stage: StartupStage): void {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  const key = code === 'ENOSPC' ? 'storage:disk_full' : code === 'EACCES' || code === 'EPERM' ? 'storage:permission' : 'errors:startup_' + stage;
  dialog.showErrorBox('VStudy Pro', tr(key));
}
