import { temporaryPath } from '../scripts/platform.mjs';
import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const evidence = temporaryPath('vstudy-welcome'); await mkdir(evidence, { recursive: true });
const errors = [], severe = [];
for (const language of process.env.VSTUDY_FULL_MATRIX === '0' ? ['en'] : ['en', 'zh-Hant', 'ja']) {
  const directory = await mkdtemp(join(tmpdir(), 'vstudy-welcome-')); let app;
  try {
    app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: language, VSTUDY_FAKE_PROVIDER: '1' } });
    const page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
    await page.locator('.onboarding').waitFor();
    await page.evaluate(async language => { const s = await window.desktop.invoke('settings:get', {}); await window.desktop.invoke('settings:set', { ...s, language, onboardingCompleted: true }); }, language);
    await page.reload(); await page.locator('#welcome-entry').click(); await page.locator('.welcome').waitFor();
    const copy = JSON.parse(await readFile(`src/shared/locales/${language}/welcome.json`, 'utf8'));
    assert.equal((await page.locator('h1#welcome-title').textContent()).trim(), copy.hero_title);
    assert.equal(await page.locator('.w-content>section').count(), 7);
    assert.equal((await page.evaluate(() => window.desktop.invoke('settings:get', {}))).welcomeSeen, true);
    assert.equal(await page.locator('.welcome').evaluate(e => e.getAnimations({ subtree: true }).filter(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length), 0, 'no looping animation');
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      await page.screenshot({ path: `${evidence}/${language}-${theme}-hero.png` });
      const result = await new AxeBuilder({ page }).setLegacyMode(true).include('.welcome').analyze();
      severe.push(...result.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => ({ language, theme, id: v.id })));
    }
    await page.keyboard.press('Escape');
    await page.locator('#welcome-entry:focus').waitFor();
  } finally { await app?.close(); await rm(directory, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ severe, errors }, null, 2));
assert.deepEqual(errors, []); assert.deepEqual(severe, []);
