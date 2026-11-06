/** Native recovery stays accessible without stealing the Moodle reload shortcut. */
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ template: vi.fn(), copy: vi.fn() }));
vi.mock('electron', () => ({ app: { getLocale: () => 'en' }, Menu: { buildFromTemplate: mocks.template, setApplicationMenu: vi.fn() } }));
vi.mock('./logging', () => ({ copyDiagnostics: mocks.copy }));
import { updateApplicationMenu } from './i18n';
it('provides Shift+R reload and Help diagnostics in the native menu', () => {
  updateApplicationMenu('en');
  const items = (mocks.template.mock.calls.at(-1)![0] as Electron.MenuItemConstructorOptions[]).flatMap(item => item.submenu as Electron.MenuItemConstructorOptions[]);
  expect(items.find(item => item.role === 'reload')).toMatchObject({ accelerator: 'CmdOrCtrl+Shift+R', label: 'Reload' });
  const copy = items.find(item => item.label === 'Copy diagnostics')!;
  (copy.click as () => void)();
  expect(mocks.copy).toHaveBeenCalledOnce();
});
