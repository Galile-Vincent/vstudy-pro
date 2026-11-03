import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = await mkdtemp(join(tmpdir(), 'vstudy-delete-e2e-'));
let app;
try {
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${root}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_FAKE_PROVIDER: '1' } });
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.desktop);
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
  await page.evaluate(() => window.desktop.invoke('settings:deleteAllData', {}));
  await access(join(root, 'vstudy.sqlite'));
  for (const name of ['library', 'Cache', 'converter-venv']) { await mkdir(join(root, name), { recursive: true }); await writeFile(join(root, name, 'deletion-probe'), 'private'); }
  await writeFile(join(root, 'secrets.json'), '{}');
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  const closed = app.waitForEvent('close');
  await Promise.all([closed, page.evaluate(() => window.desktop.invoke('settings:deleteAllData', {})).catch(() => undefined)]);
  app = undefined;
  await assert.rejects(access(root));
  console.log(JSON.stringify({ result: 'PASS', cancelledKeepsDatabase: true, confirmedRemovesUserData: true }));
} finally { await app?.close(); await rm(root, { recursive: true, force: true }); }
