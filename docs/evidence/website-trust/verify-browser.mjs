/** Exercise the built website. QA dependencies live outside the production workspace. Run with QA_PACKAGE_DIR and WEBSITE_URL. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const output = fileURLToPath(new URL('.', import.meta.url));
const qa = process.env.QA_PACKAGE_DIR ?? '/tmp/vstudy-website-qa';
const require = createRequire(await realpath(join(qa, 'node_modules/lighthouse/package.json')));
const { default: puppeteer } = await import(require.resolve('puppeteer-core'));
const axe = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const base = process.env.WEBSITE_URL ?? 'http://127.0.0.1:4337/vstudy-pro';
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--disable-gpu'] });
const report = { responsive: [], palettes: [], behavior: [], frames: [], errors: [] };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  page.on('pageerror', error => report.errors.push(error.message));
  async function go(language = 'en') {
    const response = await page.goto(`${base}/${language}/`, { waitUntil: 'networkidle0' });
    assert.equal(response.status(), 200);
    await page.waitForSelector('[data-school-demo][data-playback]');
  }
  async function state() {
    return page.evaluate(() => {
      const demo = document.querySelector('[data-school-demo]');
      const stage = document.querySelector('[data-school-stage]');
      return { playback: demo.dataset.playback, active: document.querySelector('[data-school-slide][data-active]').dataset.query,
        live: stage.getAttribute('aria-live'), height: stage.getBoundingClientRect().height,
        visible: [...document.querySelectorAll('[data-school-slide]')].filter(el => !el.inert && getComputedStyle(el).visibility !== 'hidden').length,
        query: document.querySelector('[data-active] [data-school-query]').textContent,
        focus: document.activeElement?.getAttribute('data-school-dot') };
    });
  }
  async function frame(name) {
    const file = `${name}.png`;
    const target = name.includes('reduced-motion') ? await page.$('.school-demo') : page;
    await target.screenshot({ path: join(output, file) });
    report.frames.push({ file, ...await state(), at: Date.now() });
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await go();
  await page.$eval('.school-demo', el => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.mouse.move(1, 1);
  await wait(1200);
  const initial = await state();
  assert.equal(initial.playback, 'playing');
  assert.equal(initial.live, 'off');
  assert.equal(initial.visible, 1);
  await frame('frame-01-playing');
  await wait(4900);
  const advanced = await state();
  assert.notEqual(advanced.active, initial.active);
  assert.equal(advanced.height, initial.height);
  await frame('frame-02-advanced');
  await page.hover('.school-demo');
  const hovered = await state();
  assert.equal(hovered.playback, 'paused');
  assert.equal(hovered.live, 'polite');
  await frame('frame-03-hover-paused');
  await wait(5100);
  assert.deepEqual(await state(), hovered);
  await frame('frame-04-hover-still-paused');
  await page.mouse.move(1, 1);
  await page.focus('[data-school-next]');
  const focused = await state();
  await wait(5000);
  assert.deepEqual(await state(), focused);
  await page.keyboard.press('Enter');
  assert.notEqual((await state()).active, focused.active);
  await page.focus('[data-active] [data-school-connect]');
  await page.keyboard.press('ArrowRight');
  assert.notEqual((await state()).focus, null);
  const requests = [];
  const onRequest = request => requests.push(request.url());
  page.on('request', onRequest);
  const urlBefore = page.url();
  await page.focus('[data-active] [data-school-connect]');
  await page.keyboard.press('Enter');
  await wait(550);
  assert.equal(page.url(), urlBefore);
  assert.equal(requests.length, 0);
  page.off('request', onRequest);
  await page.click('[data-school-play]');
  await page.mouse.move(1, 1);
  await page.$eval('[data-school-play]', el => el.blur());
  assert.equal((await state()).playback, 'playing');
  await page.click('[data-school-play]');
  await page.mouse.move(1, 1);
  await page.$eval('[data-school-play]', el => el.blur());
  const paused = await state();
  assert.equal(paused.playback, 'paused');
  await frame('frame-05-manually-paused');
  await wait(5000);
  assert.deepEqual(await state(), paused);
  await frame('frame-06-manually-still-paused');
  report.behavior.push('Autoplay advances, maintains stage height, and exposes one slide. Hover, focus, Pause, and keyboard navigation pass. Connect makes no request or navigation.');

  await page.setViewport({ width: 390, height: 1000, isMobile: true, hasTouch: true });
  await go();
  await page.$eval('.school-demo', el => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.tap('.school-search');
  const touched = await state();
  assert.equal(touched.playback, 'paused');
  await wait(5000);
  assert.deepEqual(await state(), touched);
  report.behavior.push('Touch persistently pauses playback.');

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await go();
  await page.$eval('.school-demo', el => el.scrollIntoView({ behavior: 'instant', block: 'start' }));
  const reduced = await state();
  assert.equal(reduced.playback, 'static');
  assert.equal(reduced.visible, 5);
  assert.equal(await page.$eval('[data-school-controls]', el => getComputedStyle(el).display), 'none');
  await frame('frame-07-reduced-motion-static');
  await wait(5100);
  assert.deepEqual(await state(), reduced);
  await frame('frame-08-reduced-motion-unchanged');
  await page.addScriptTag({ content: axe });
  const reducedAxe = await page.evaluate(() => axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
  assert.equal(reducedAxe.violations.length, 0, JSON.stringify(reducedAxe.violations));
  report.behavior.push('Native prefers-reduced-motion emulation shows all five static cards, hides controls, and remains unchanged after 5.1 seconds. Axe reports zero violations.');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  for (const language of ['en', 'zh-Hant', 'ja']) {
    for (const width of [390, 768, 1024, 1440, 1920]) {
      for (const scheme of ['light', 'dark']) {
        await page.setViewport({ width, height: 1000 });
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'no-preference' }]);
        await go(language);
        await page.click('#motion-toggle');
        await page.addScriptTag({ content: axe });
        const audit = await page.evaluate(async () => {
          const result = await axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
          return { overflow: document.documentElement.scrollWidth > innerWidth, violations: result.violations,
            providers: document.querySelectorAll('[data-provider-id]').length, h1: document.querySelectorAll('h1').length,
            realSchoolClaim: document.querySelector('.schools-section').textContent.includes('UCL') };
        });
        assert.equal(audit.overflow, false, `${language} ${width} ${scheme}`);
        assert.equal(audit.providers, 6);
        assert.equal(audit.h1, 1);
        assert.equal(audit.realSchoolClaim, false);
        assert.equal(audit.violations.length, 0, JSON.stringify(audit.violations));
        report.responsive.push({ language, width, scheme, ...audit });
        if ([390, 1440].includes(width)) {
          for (const section of ['schools', 'providers']) {
            await page.$eval(`.${section}-section`, el => el.scrollIntoView({ behavior: 'instant', block: 'start' }));
            await wait(350);
            await page.screenshot({ path: join(output, `${section}-${language}-${width}-${scheme}.png`) });
          }
        }
      }
    }
  }
  console.log('Responsive matrix passed.');
  await page.setViewport({ width: 1440, height: 1000 });
  const palettes = JSON.parse(await readFile(new URL('../../../apps/desktop/src/shared/themes/palettes.json', import.meta.url), 'utf8'));
  for (const language of ['en', 'zh-Hant', 'ja']) {
    for (const scheme of ['light', 'dark']) {
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
      await go(language);
      await page.click('#motion-toggle');
      await page.addScriptTag({ content: axe });
      for (const palette of palettes) {
        const audit = await page.evaluate(async ({ palette, scheme }) => {
          const button = document.querySelector(`[data-theme-id="${palette.id}"]`);
          if (button) button.click();
          else {
            document.documentElement.style.setProperty('--accent', palette[scheme][7]);
            document.documentElement.style.setProperty('--on-accent', scheme === 'dark' ? '#0b0b0d' : '#ffffff');
          }
          await new Promise(resolve => setTimeout(resolve, 400));
          const result = await axe.run({ include: ['.schools-section', '.providers-section'] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
          return { method: button ? 'visible-control' : 'unexposed-pack-tokens', violations: result.violations, scheme: document.documentElement.dataset.scheme, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent') };
        }, { palette, scheme });
        assert.equal(audit.scheme, scheme);
        assert.equal(audit.violations.length, 0, JSON.stringify(audit.violations));
        report.palettes.push({ language, palette: palette.id, ...audit });
      }
    }
  }
  await page.setJavaScriptEnabled(false);
  await page.goto(`${base}/en/`, { waitUntil: 'networkidle0' });
  assert.equal(await page.$$eval('[data-school-slide]', els => els.filter(el => getComputedStyle(el).visibility === 'visible').length), 5);
  report.behavior.push('Without JavaScript all five school examples remain visible.');
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({ responsive: report.responsive.length, palettes: report.palettes.length, behavior: report.behavior, errors: report.errors }, null, 2));
} finally {
  await writeFile(join(output, 'browser-audit.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
