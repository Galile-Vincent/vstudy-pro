import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const profile = await mkdtemp(join(tmpdir(), 'vstudy-astryx-regressions-'));
let app;
try {
  app = await electron.launch({args:[resolve('.'), `--user-data-dir=${profile}`], env:{...process.env, ELECTRON_RUN_AS_NODE:'', VSTUDY_LOCALE:'en', VSTUDY_FAKE_PROVIDER:'1'}});
  const page = await app.firstWindow();
  await page.addInitScript(() => { if (localStorage.getItem('vstudy-route')) localStorage.removeItem('vstudy-tabs-v1'); });
  await page.evaluate(async () => {
    const s = await window.desktop.invoke('settings:get', {});
    await window.desktop.invoke('settings:set', {...s, onboardingCompleted:true, welcomeSeen:true});
  });
  for (const view of ['home', 'library', 'workspace', 'courses', 'exams', 'review', 'history', 'web-chat', 'welcome']) {
    await page.evaluate(view => {
      localStorage.removeItem('vstudy-tabs-v1');
      localStorage.setItem('vstudy-route', JSON.stringify({view}));
    }, view);
    await page.reload();
    await page.locator('main, [role=main]').waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('main, [role=main]').count(), 1, `${view} has one main`);
    const result = await new AxeBuilder({page}).setLegacyMode(true).withRules(['landmark-main-is-top-level', 'landmark-no-duplicate-main', 'landmark-banner-is-top-level']).analyze();
    assert.deepEqual(result.violations, [], `${view} landmark rules`);
    console.log(`${view}: one main, landmark rules passed`);
  }
  await app.evaluate(({dialog}, path) => { dialog.showOpenDialog = async () => ({canceled:false, filePaths:[path]}); }, resolve('e2e/fixtures/reading.md'));
  await page.evaluate(async () => {
    await window.desktop.invoke('documents:import', {});
    const s = await window.desktop.invoke('settings:get', {});
    await window.desktop.invoke('settings:set', {...s, language:'ja'});
    localStorage.removeItem('vstudy-tabs-v1');
    localStorage.setItem('vstudy-route', JSON.stringify({view:'library'}));
    localStorage.setItem('library-mode', 'files');
  });
  await page.reload();
  await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(720, 800));
  await page.locator('.library-mode').waitFor();
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  const fits = await page.locator('.library-mode').evaluate(control => {
    const box = control.getBoundingClientRect();
    return [...control.querySelectorAll('button')].every(button => {
      const range = document.createRange(); range.selectNodeContents(button);
      const text = range.getBoundingClientRect();
      return text.top >= box.top && text.bottom <= box.bottom && button.scrollWidth <= button.clientWidth;
    });
  });
  assert.ok(fits, 'Japanese segmented labels fit at 720px and 200% text');
  console.log('ja, 720px, 200% text: segmented labels fit');
  const opener = page.locator('.library-search input');
  await opener.focus();
  await page.evaluate(() => window.dispatchEvent(new Event('vstudy:find-history')));
  await page.locator('.history-dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.history-dialog').waitFor({state:'detached'});
  await page.waitForFunction(() => document.activeElement !== document.body);
  assert.ok(await opener.evaluate(el => el === document.activeElement), 'programmatic finder restores opener');
  console.log('programmatic History: focus returned to arbitrary opener');
  await page.evaluate(() => window.dispatchEvent(new Event('vstudy:open-settings')));
  await page.locator('.settings-dialog[open]').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.settings-dialog').waitFor({state:'detached'});
  assert.ok(await opener.evaluate(el => el === document.activeElement), 'programmatic settings restores opener');
  console.log('programmatic Settings: focus returned to arbitrary opener');
} finally {
  await app?.close();
  await rm(profile, {recursive:true, force:true});
}
