import { _electron as electron } from 'playwright';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = join(root, '../../docs/evidence/onboarding/design-pass');
await mkdir(evidence, { recursive: true });
const profile = await mkdtemp(join(root, 'node_modules/.cache/onboarding-transition-'));
const results = [], errors = [];
let app;
try {
  app = await electron.launch({ args: [root, `--user-data-dir=${profile}`, '--force-device-scale-factor=2'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: 'en' } });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.locator('.onboarding').waitFor();
  for (const step of ['welcome', 'appearance']) {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    await page.waitForFunction(() => document.documentElement.dataset.scheme === 'light');
    await page.locator('.product-preview-light').evaluate(image => image.decode());
    if (step === 'appearance') {
      await page.locator('.onboarding footer .primary').click();
      await page.locator('.onboarding footer .primary').click();
      await page.locator('input[name=onboarding-scheme]').first().waitFor();
      assert.equal(await page.locator('input[name=onboarding-scheme]').count(), 3);
      assert.equal(await page.locator('.onboarding .themes-grid, .onboarding .settings-row').count(), 0);
    }
    const before = await page.locator('.onboarding').boundingBox();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('.onboarding').evaluate(async element => {
      await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.evaluate(() => {
      window.__pauseTheme = new MutationObserver(() => {
        if (document.documentElement.dataset.themeTransition !== 'view') return;
        const pause = () => {
          const animation = document.getAnimations().find(item => item.animationName === 'theme-crossfade');
          if (animation) { animation.pause(); animation.currentTime = 0; }
          else requestAnimationFrame(pause);
        };
        requestAnimationFrame(pause);
      });
      window.__pauseTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-transition'] });
    });
    if (step === 'welcome') await page.emulateMedia({ colorScheme: 'dark' });
    else await page.locator('input[name=onboarding-scheme][value=dark]').check();
    await page.waitForFunction(() => document.getAnimations().some(item => item.animationName === 'theme-crossfade' && item.playState === 'paused'));
    const frames = [];
    for (const time of [0, 40, 80, 120, 160, 200, 240, 280, 320, 400]) {
      const opacity = await page.evaluate(time => {
        document.getAnimations().find(item => item.animationName === 'theme-crossfade').currentTime = time;
        return getComputedStyle(document.documentElement, '::view-transition-new(root)').opacity;
      }, time);
      const file = join(evidence, `transition-${step}-${time}ms.png`);
      const pixels = await page.screenshot({ path: file, scale: 'device' });
      const panel = await sharp(pixels).extract({ left: 600, top: 400, width: 4, height: 4 }).png().toBuffer();
      const { channels } = await sharp(panel).stats();
      frames.push({ time, opacity: Number(opacity), panelRed: channels[0].mean, file });
    }
    assert.ok(frames[1].panelRed < frames[0].panelRed && frames[1].panelRed > frames[8].panelRed, '40ms contains blended panel pixels');
    assert.ok(frames[4].opacity > frames[1].opacity && frames[4].opacity < 1, 'intermediate compositor opacity advances');
    await page.evaluate(() => {
      window.__pauseTheme.disconnect();
      for (const animation of document.getAnimations()) if (animation.animationName === 'theme-crossfade') animation.finish();
    });
    await page.waitForFunction(() => !document.documentElement.dataset.themeTransition);
    assert.deepEqual(await page.locator('.onboarding').boundingBox(), before, 'scheme change does not move the dialog');
    results.push({ step, frames, before, after: await page.locator('.onboarding').boundingBox() });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    if (step === 'welcome') await page.emulateMedia({ colorScheme: 'light' });
    else await page.locator('input[name=onboarding-scheme][value=light]').check();
    await page.waitForFunction(() => document.documentElement.dataset.scheme === 'light');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.themeTransition), undefined, 'reduced motion is instant');
  }
  assert.deepEqual(errors, []);
  await writeFile(join(evidence, 'transition-verification.json'), JSON.stringify({ result: 'PASS', method: 'Real Electron root compositor animation paused at exact offsets. Welcome follows system scheme; Appearance uses its radio control.', results, errors }, null, 2) + '\n');
  console.table(results.flatMap(({step,frames}) => frames.map(({time,opacity,panelRed}) => ({step,time,opacity,panelRed}))));
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
