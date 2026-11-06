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
const report = { responsive: [], palettes: [], behavior: [], errors: [] };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  page.on('pageerror', error => report.errors.push(error.message));
  async function go(language = 'en') {
    const response = await page.goto(`${base}/${language}/`, { waitUntil: 'networkidle0' });
    assert.equal(response.status(), 200);
    await page.waitForSelector('[data-provider-id]');
  }
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
            providers: document.querySelectorAll('[data-provider-id]').length, h1: document.querySelectorAll('h1').length };
        });
        assert.equal(audit.overflow, false, `${language} ${width} ${scheme}`);
        assert.equal(audit.providers, 6);
        assert.equal(audit.h1, 1);
        assert.equal(audit.violations.length, 0, JSON.stringify(audit.violations));
        report.responsive.push({ language, width, scheme, ...audit });
        if ([390, 1440].includes(width)) {
          for (const section of ['providers']) {
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
          const result = await axe.run({ include: ['.providers-section'] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
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
  assert.equal(await page.$$eval('[data-provider-id]', els => els.length), 6);
  report.behavior.push('Without JavaScript all provider connections remain visible.');
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({ responsive: report.responsive.length, palettes: report.palettes.length, behavior: report.behavior, errors: report.errors }, null, 2));
} finally {
  await writeFile(join(output, 'browser-audit.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
