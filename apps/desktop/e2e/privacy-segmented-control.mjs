import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'vstudy-segmented-'));
const output = process.env.VSTUDY_SCREENSHOTS ?? join(tmpdir(), 'vstudy-settings-stack');
await mkdir(output, { recursive: true });
let app;
try {
  app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${directory}`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: 'en', VSTUDY_FAKE_PROVIDER: '1' },
  });
  const page = await app.firstWindow();
  for (const scheme of ['light', 'dark', 'contrast']) for (const width of [1200, 600]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 900), width);
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.evaluate(async scheme => {
      const s = await window.desktop.invoke('settings:get', {});
      await window.desktop.invoke('settings:set', { ...s, language: 'en', colorScheme: scheme === 'dark' ? 'dark' : 'light', contrast: scheme === 'contrast' ? 150 : 100, converterOffline: false, onboardingCompleted: true, welcomeSeen: true });
      window.localStorage.setItem('vstudy-route', JSON.stringify({ view: 'workspace' }));
    }, scheme);
    await page.reload();
    await page.locator('.app-shell').first().waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event('vstudy:open-settings')));
    await page.locator('.settings-dialog[open]').waitFor();
    await page.locator('.settings-tabs').getByRole('tab').last().click();
    await page.setViewportSize({ width, height: 900 });
    const group = page.getByRole('radiogroup', { name: 'Converter mode' });
    const online = group.getByRole('radio', { name: 'Enable downloads and retry' });
    const offline = group.getByRole('radio', { name: 'Offline mode' });
    await online.waitFor();
    await page.waitForFunction(el => el.getAttribute('aria-checked') === 'true', await online.elementHandle());
    await online.click();
    await online.click();
    assert.equal(await online.getAttribute('aria-checked'), 'true');
    await online.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(el => el.getAttribute('aria-checked') === 'true', await offline.elementHandle());
    await offline.click();
    assert.equal(await offline.getAttribute('aria-checked'), 'true');
    await group.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, `${scheme}-${width}.png`), animations: 'disabled' });
    if (scheme === 'contrast') {
      assert.notEqual(await offline.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    }
  }
  console.log(`Converter selection, keyboard, contrast checks passed; screenshots: ${output}`);
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
