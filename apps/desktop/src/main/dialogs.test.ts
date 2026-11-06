/** Fatal startup messages must not wait for a window or app readiness. */
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('electron', () => ({ dialog: { showErrorBox: mocks.show } }));
vi.mock('./i18n', () => ({ tr: (key: string) => key }));
import { showStartupError } from './dialogs';
it.each(['recovery', 'database', 'services', 'window'] as const)('reports %s failures without a window', stage => {
  showStartupError(Error('private path'), stage);
  expect(mocks.show).toHaveBeenLastCalledWith('VStudy Pro', 'errors:startup_' + stage);
});
it.each([['ENOSPC', 'disk_full'], ['EACCES', 'permission'], ['EPERM', 'permission']])('explains %s without claiming corruption', (code, key) => {
  showStartupError(Object.assign(Error('secret'), { code }), 'database');
  expect(mocks.show).toHaveBeenLastCalledWith('VStudy Pro', 'storage:' + key);
});
