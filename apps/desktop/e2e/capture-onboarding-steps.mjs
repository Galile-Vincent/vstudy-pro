import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onboardingForward, onboardingConsent } from './helpers/onboarding.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = resolve(root, '../../docs/evidence/onboarding/design-pass');
const prefix = process.argv[2] ?? 'capture';
const systemLocale = process.env.VSTUDY_LOCALE ?? 'en';
const language = /^ja(?:[-_]|$)/i.test(systemLocale) ? 'ja' : /^zh[-_](TW|HK|Hant)(?:[-_]|$)/i.test(systemLocale) ? 'zh-Hant' : 'en';
const languageOnly = process.argv.includes('--language-only');
const scale = Number(process.env.VSTUDY_CAPTURE_SCALE ?? 100);
const copy = JSON.parse(await readFile(join(root, `src/shared/locales/${language}/onboarding.json`), 'utf8'));
const steps = ['welcome', 'language', 'appearance', 'acquisition', 'privacy', 'goal', 'start'];
const sizes = [], errors = [], audits = [];
const audit = process.argv.includes('--audit');
await mkdir(evidence, { recursive: true });
await mkdir(join(root, 'node_modules/.cache'), { recursive: true });
for (const scheme of ['dark', 'light']) {
  const profile = await mkdtemp(join(root, 'node_modules/.cache/onboarding-steps-'));
  let app;
  try {
    app = await electron.launch({ args: [root, `--user-data-dir=${profile}`, '--force-device-scale-factor=2'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: systemLocale, VSTUDY_FAKE_PROVIDER: '1' } });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme });
    await page.locator('.onboarding').waitFor();
    await page.evaluate(async ({ scheme, scale }) => { const settings = await window.desktop.invoke('settings:get', {}); await window.desktop.invoke('settings:set', { ...settings, colorScheme: scheme, uiScale: scale }); }, { scheme, scale });
    await page.reload();
    await page.waitForFunction(scheme => document.documentElement.dataset.scheme === scheme, scheme);
    for (const step of steps) {
      await page.locator('#onboarding-title').filter({ hasText: copy[`step_${step}`] }).waitFor();
      if (step === 'appearance') await page.locator('.onboarding input[name=onboarding-scheme]').first().waitFor();
      if (step === 'language' && prefix !== 'before') {
        assert.equal((await page.evaluate(() => window.desktop.invoke('settings:get', {}))).language, 'auto');
        assert.equal(await page.locator(`input[name=onboarding-language][value="${language}"]`).isChecked(), true);
        if (scale !== 100) {
          await page.locator('input[name=onboarding-scale][value="100"]').check();
          await page.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '16px');
          await page.locator(`input[name=onboarding-scale][value="${scale}"]`).check();
          await page.waitForFunction(scale => getComputedStyle(document.documentElement).fontSize === `${16 * scale / 100}px`, scale);
        }
      }
      await page.evaluate(() => document.fonts.ready);
      if (step === 'welcome') await page.locator('img.product-preview').evaluate(image => image.decode());
      await page.waitForFunction(() => !document.querySelector('.onboarding-top button')?.disabled);
      const dialog = page.locator('.onboarding');
      const size = await dialog.evaluate(element => {
        const { x, y, width, height } = element.getBoundingClientRect();
        const body = element.querySelector('.onboarding-content');
        return { x, y, width, height, bodyHeight: body.clientHeight, bodyScrollHeight: body.scrollHeight, dialogScroll: element.scrollHeight > element.clientHeight, horizontalOverflow: body.scrollWidth > body.clientWidth, dpr: devicePixelRatio };
      });
      if (step === 'welcome' && prefix !== 'before') {
        assert.equal(await page.locator('.product-preview-frame').evaluate(frame => frame.querySelector('img').getBoundingClientRect().height <= frame.clientHeight + 1), true, 'hero is not cropped inside its frame');
      }
      const file = `${prefix}-${scheme}-${step}.png`;
      await page.screenshot({ path: join(evidence, file), animations: 'disabled', scale: 'device' });
      sizes.push({ scheme, step, ...size, file });
      if (audit) {
        const result = await new AxeBuilder({ page }).setLegacyMode(true).analyze();
        const violations = result.violations.filter(item => ['serious', 'critical'].includes(item.impact));
        audits.push({ scheme, step, violations });
        assert.deepEqual(violations, [], `${scheme}/${step} accessibility`);
        if (step === 'language') {
          const radio = page.locator(`input[name=onboarding-language][value="${language}"]`);
          await radio.click();
          await page.waitForFunction(language => document.documentElement.lang === language && !document.querySelector('.onboarding-top button')?.disabled, language);
          assert.equal((await page.evaluate(() => window.desktop.invoke('settings:get', {}))).language, language, 'clicking the detected card writes an explicit language');
          await radio.focus();
          await page.keyboard.press('ArrowRight');
          await page.waitForFunction(() => !document.querySelector('.onboarding-top button')?.disabled);
          const saved = await page.evaluate(() => window.desktop.invoke('settings:get', {}));
          assert.notEqual(saved.language, 'auto', 'keyboard selection writes an explicit language');
          await radio.check();
          await page.waitForFunction(language => document.documentElement.lang === language && !document.querySelector('.onboarding-top button')?.disabled, language);
          await radio.focus();
          await page.keyboard.press('Tab');
          await page.keyboard.press('Shift+Tab');
          assert.equal(await radio.evaluate(input => getComputedStyle(input.closest('label')).outlineStyle), 'solid', 'keyboard focus ring is visible');
          await page.screenshot({ path: join(evidence, `${prefix}-${scheme}-keyboard-focus.png`), scale: 'device' });
        }
        if (step === 'appearance') {
          await page.emulateMedia({ contrast: 'more', forcedColors: 'active' });
          await page.screenshot({ path: join(evidence, `${prefix}-${scheme}-high-contrast.png`), scale: 'device' });
          await page.emulateMedia({ contrast: 'no-preference', forcedColors: 'none' });
        }
      }
      assert.equal(size.dpr, 2);
      if (prefix !== 'before') {
        assert.equal(size.dialogScroll, false, `${scheme}/${step} dialog must not scroll`);
        assert.equal(size.horizontalOverflow, false, `${scheme}/${step} horizontal overflow`);
      }
      if (step === 'start' || (languageOnly && step === 'language')) break;
      if (step === 'privacy') await onboardingConsent(page).click();
      else await onboardingForward(page).click();
    }
    assert.equal(new Set(sizes.filter(row => row.scheme === scheme).map(row => `${row.width}x${row.height}`)).size, 1, 'dialog size stays constant');
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
}
console.table(sizes.map(({scheme, step, width, height, bodyHeight, bodyScrollHeight}) => ({ scheme, step, width, height, bodyHeight, bodyScrollHeight })));
await writeFile(join(evidence, `${prefix}-sizes.json`), JSON.stringify({ sizes, errors, audits }, null, 2) + '\n');
assert.deepEqual(errors, [], 'renderer errors');
