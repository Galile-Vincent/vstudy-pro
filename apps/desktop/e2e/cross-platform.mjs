/** Native Electron verification for platform labels, lazy secure storage, and window chrome. */
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'vstudy-platform-ui-'));
const evidence = resolve('../../docs/evidence/distribution');
await mkdir(evidence, {recursive: true});
let app;
const reports = [];
try {
  app = await electron.launch({args: [resolve('.'), `--user-data-dir=${directory}`], env: {...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: 'en', VSTUDY_FAKE_PROVIDER: '1'}});
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const chrome = await app.evaluate(({BrowserWindow, safeStorage}) => {
    const current = BrowserWindow.getAllWindows()[0];
    let calls = 0;
    for (const name of ['isAsyncEncryptionAvailable', 'encryptStringAsync', 'decryptStringAsync']) {
      safeStorage[name] = async () => { calls++; throw new Error('Platform UI check must not unlock credentials'); };
    }
    globalThis.platformStorageCalls = () => calls;
    const preferences = current.webContents.getLastWebPreferences();
    return {minimumSize: current.getMinimumSize(), nativeHandle: current.getNativeWindowHandle().some(byte => byte !== 0), menuBarVisible: current.isMenuBarVisible(), contextIsolation: preferences.contextIsolation, sandbox: preferences.sandbox, nodeIntegration: preferences.nodeIntegration};
  });
  assert.deepEqual(chrome.minimumSize, [720, 480]);
  assert.equal(chrome.contextIsolation, true);
  assert.equal(chrome.sandbox, true);
  assert.equal(chrome.nodeIntegration, false);
  assert.equal(chrome.nativeHandle, true);
  if (process.platform === 'win32') assert.equal(chrome.menuBarVisible, false);
  for (const language of ['en', 'zh-Hant', 'ja']) {
    const labels = JSON.parse(await readFile(resolve('src/shared/locales', language, 'settings.json'), 'utf8'));
    await page.evaluate(async language => {
      const settings = await window.desktop.invoke('settings:get', {});
      await window.desktop.invoke('settings:set', {...settings, language, onboardingCompleted: true, welcomeSeen: true});
      window.localStorage.setItem('vstudy-route', JSON.stringify({view: 'workspace'}));
    }, language);
    await page.reload();
    await page.getByTestId('bridge-status').waitFor({state: 'attached'});
    assert.ok((await page.locator('.shell-history-trigger kbd').innerText()).includes(process.platform === 'darwin' ? 'Cmd' : 'Ctrl'));
    await page.evaluate(() => window.dispatchEvent(new window.Event('vstudy:open-settings')));
    await page.locator('.settings-dialog[data-state=open]').waitFor();
    await page.getByRole('tab', {name: labels.providers, exact: true}).click();
    const providers = await page.evaluate(() => window.desktop.invoke('providers:list', {}));
    assert.ok(providers.filter(row => row.config.kind === 'cli').every(row => !row.config.enabled));
    if (process.platform === 'win32') {
      assert.equal(await page.locator('.provider-row [role=note]').count(), 1);
      const codex = providers.find(row => row.config.id === 'codex-cli');
      assert.equal(codex.availability.available, false);
      assert.ok(codex.availability.reason);
    }
    await page.locator('.provider-row').first().scrollIntoViewIfNeeded();
    await page.screenshot({path: join(evidence, `${process.platform}-${language}-providers.png`), animations: 'disabled'});
    await page.getByRole('tab', {name: labels.privacy, exact: true}).click();
    await page.getByTestId('privacy-settings').waitFor();
    await page.screenshot({path: join(evidence, `${process.platform}-${language}-privacy.png`), animations: 'disabled'});
    assert.equal(await app.evaluate(() => globalThis.platformStorageCalls()), 0);
    reports.push({language, platform: process.platform, keyboardModifier: process.platform === 'darwin' ? 'Cmd' : 'Ctrl', credentialsUnlocked: false, chrome});
    await page.keyboard.press('Escape');
  }
  console.log(JSON.stringify({result: 'PASS', reports}));
} finally {
  await app?.close();
  await rm(directory, {recursive: true, force: true, maxRetries: 3});
  await writeFile(join(evidence, `${process.platform}-ui.json`), JSON.stringify(reports, null, 2) + '\n');
}
