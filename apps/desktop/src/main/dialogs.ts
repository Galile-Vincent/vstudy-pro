/**
 * Attach native message dialogs to the active application window.
 * Owned by main.
 * Main owns privileged resources; shutdown must settle work before releasing those resources.
 * @packageDocumentation
 */
import { app, BrowserWindow, dialog, type MessageBoxOptions } from 'electron';
import { tr } from './i18n';
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

export type StartupStage = 'recovery' | 'database' | 'services' | 'window';
/** Fatal startup errors must be visible even before Electron or a window is ready. */
export function showStartupError(error: unknown, stage: StartupStage): void {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  const key = code === 'ENOSPC' ? 'storage:disk_full' : code === 'EACCES' || code === 'EPERM' ? 'storage:permission' : 'errors:startup_' + stage;
  dialog.showErrorBox('VStudy Pro', tr(key));
}
