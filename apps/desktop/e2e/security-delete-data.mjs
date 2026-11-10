import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, dirname } from 'node:path';
const root = await mkdtemp(join(tmpdir(), 'vstudy-delete-e2e-'));
let app;
try {
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${root}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_FAKE_PROVIDER: '1' } });
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.desktop);
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
  await page.evaluate(() => window.desktop.invoke('settings:deleteAllData', {confirmation:'DELETE'}));
  await access(join(root, 'vstudy.sqlite'));
  await page.evaluate(async () => {
    const settings = await window.desktop.invoke('settings:get',{});
    await window.desktop.invoke('settings:set',{...settings,monthlyBudgetUsd:12345});
  });
  for (const name of ['library', 'Cache', 'converter-venv']) { await mkdir(join(root, name), { recursive: true }); await writeFile(join(root, name, 'deletion-probe'), 'private'); }
  await writeFile(join(root, 'secrets.json'), '{}');
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  await app.evaluate(({ app }) => { app.relaunch = () => {}; });
  const closed = app.waitForEvent('close');
  await Promise.all([closed, page.evaluate(() => window.desktop.invoke('settings:deleteAllData', {confirmation:'DELETE'})).catch(() => undefined)]);
  app = undefined;
  const trash = (await readdir(tmpdir())).filter(name => name.startsWith(basename(root) + '.deleting-'));
  assert.ok(trash.length <= 1);
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${root}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_FAKE_PROVIDER: '1' } });
  const fresh = await app.firstWindow();
  await fresh.waitForFunction(() => !!window.desktop);
  assert.notEqual(await fresh.evaluate(() => window.desktop.invoke('settings:get',{}).then(s=>s.monthlyBudgetUsd)),12345);
  for (const name of ['library', 'Cache', 'converter-venv']) await assert.rejects(access(join(root,name,'deletion-probe')));
  await assert.rejects(access(join(root,'secrets.json')));
  const deadline = Date.now() + 15_000;
  while (true) {
    const remaining = (await readdir(dirname(root)))
      .filter(name => name.startsWith(basename(root) + '.deleting-'));
    const pending = await access(root + '.delete-pending').then(() => true, () => false);
    if (!remaining.length && !pending) break;
    assert.ok(Date.now() < deadline, 'Deletion cleanup timed out');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await app.close(); app = undefined;
  console.log(JSON.stringify({ result: 'PASS', cancelledKeepsDatabase: true, confirmedRemovesUserData: true }));
} finally {
  try { await app?.close(); }
  finally {
    await rm(root, {recursive:true,force:true});
    await rm(root + '.delete-pending', {force:true});
    for (const name of await readdir(dirname(root))) {
      if (name.startsWith(basename(root) + '.deleting-')) {
        await rm(join(dirname(root),name), {recursive:true,force:true});
      }
    }
  }
}
