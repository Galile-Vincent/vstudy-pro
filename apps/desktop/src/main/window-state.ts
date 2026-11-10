/** Persist the main window's normal bounds without restoring it onto a missing display. */
import { screen, type BrowserWindow, type Rectangle } from 'electron';
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { log } from './logging';
interface WindowState extends Partial<Pick<Rectangle, 'x' | 'y'>> {
  width: number;
  height: number;
  maximized: boolean;
}
const defaults: WindowState = {width:1200, height:800, maximized:false};
export function readWindowState(userData: string): WindowState {
  try {
    const saved = JSON.parse(readFileSync(join(userData, 'window-state.json'), 'utf8')) as Rectangle & {maximized:boolean};
    if (![saved.x,saved.y,saved.width,saved.height].every(Number.isSafeInteger) || saved.width < 720 || saved.height < 480) return {...defaults};
    const area = screen.getDisplayMatching(saved).workArea;
    if (saved.x >= area.x + area.width || saved.x + saved.width <= area.x || saved.y >= area.y + area.height || saved.y + saved.height <= area.y) return {...defaults};
    return {x:saved.x,y:saved.y,width:saved.width,height:saved.height,maximized:saved.maximized === true};
  } catch { return {...defaults}; }
}
export function trackWindowState(window: BrowserWindow, userData: string, state: WindowState): () => void {
  const path = join(userData, 'window-state.json'), temporary = path + '.tmp';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    clearTimeout(timer);
    if (window.isDestroyed()) return;
    try {
      writeFileSync(temporary, JSON.stringify({...window.getNormalBounds(), maximized:window.isMaximized()}), {mode:0o600});
      renameSync(temporary, path);
    } catch {
      log({phase:'window-state-save-failed'});
      try { rmSync(temporary, {force:true}); } catch { /* Best effort after a failed atomic write. */ }
    }
  };
  const changed = () => { clearTimeout(timer); timer = setTimeout(save, 300); timer.unref(); };
  window.on('move', changed);
  window.on('resize', changed);
  window.on('maximize', changed);
  window.on('unmaximize', changed);
  window.on('close', save);
  window.on('closed', () => clearTimeout(timer));
  const stop = () => {
    clearTimeout(timer);
    window.removeListener('move', changed);
    window.removeListener('resize', changed);
    window.removeListener('maximize', changed);
    window.removeListener('unmaximize', changed);
    window.removeListener('close', save);
  };
  // Electron maximize() also shows hidden windows, so wait for an explicit show.
  if (state.maximized) window.once('show', () => window.maximize());
  return stop;
}
