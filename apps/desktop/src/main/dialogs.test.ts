/** Fatal startup messages must not wait for a window or app readiness. */
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ show: vi.fn(), message:vi.fn(async () => ({response:0,checkboxChecked:false})), parent:{id:1,isDestroyed:():boolean=>false} }));
vi.mock('electron', () => ({ dialog: { showErrorBox: mocks.show, showMessageBox:mocks.message }, BrowserWindow:{fromWebContents:()=>mocks.parent,fromId:()=>mocks.parent} }));
vi.mock('./i18n', () => ({ tr: (key: string) => key }));
import { showStartupError, ownerWindow, showAttachedMessage } from './dialogs';
it.each(['recovery', 'database', 'services', 'window'] as const)('reports %s failures without a window', stage => {
  showStartupError(Error('private path'), stage);
  expect(mocks.show).toHaveBeenLastCalledWith('VStudy Pro', 'errors:startup_' + stage);
});
it.each([['ENOSPC', 'disk_full'], ['EACCES', 'permission'], ['EPERM', 'permission']])('explains %s without claiming corruption', (code, key) => {
  showStartupError(Object.assign(Error('secret'), { code }), 'database');
  expect(mocks.show).toHaveBeenLastCalledWith('VStudy Pro', 'storage:' + key);
});

it('resolves the sender window and attaches messages without waiting for visibility', async () => {
  const sender = {} as Electron.WebContents;
  expect(ownerWindow(sender)).toBe(mocks.parent);
  await showAttachedMessage({message:'Confirm'}, sender);
  expect(mocks.message).toHaveBeenCalledWith(mocks.parent, {message:'Confirm'});
});
it('settles immediately when the sender has closed', () => {
  vi.spyOn(mocks.parent,'isDestroyed').mockReturnValueOnce(true);
  expect(() => ownerWindow({} as Electron.WebContents)).toThrow();
});
