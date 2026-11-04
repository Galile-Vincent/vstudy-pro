import { app, shell } from 'electron';
import { networkUrl } from './site-url';

const callbacks = new Set<(url: string) => boolean>();
let registered = false;
export const ssoProtocol = {
  get available() { return app.isPackaged && registered; },
  open: async (url: string) => { await shell.openExternal(networkUrl(url).href); },
  subscribe(callback: (url: string) => boolean) { callbacks.add(callback); return () => {callbacks.delete(callback);}; },
};
export function routeMoodleCallback(url: string): boolean {
  if (!/^vstudymoodle:\/\//i.test(url) || url.length > 40_000) return false;
  for (const callback of callbacks) if (callback(url)) return true;
  return false;
}
export function initializeMoodleProtocol(): void {
  app.on('open-url',(event,url) => { if (/^vstudymoodle:/i.test(url)) {event.preventDefault();routeMoodleCallback(url);} });
  app.on('second-instance',(_event,argv) => { for (const value of argv) routeMoodleCallback(value); });
  void app.whenReady().then(() => {
    if (app.isPackaged) {
      try { registered = app.setAsDefaultProtocolClient('vstudymoodle'); } catch { registered = false; }
    }
  });
}
