/** Verify the localized school guides against the built artifact. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const output = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(await realpath(join(process.env.QA_PACKAGE_DIR ?? '/tmp/vstudy-website-qa', 'node_modules/lighthouse/package.json')));
const { default: puppeteer } = await import(require.resolve('puppeteer-core'));
const axe = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const base = process.env.WEBSITE_URL ?? 'http://127.0.0.1:4337/vstudy-pro';
const report = { controls: [], guides: [], errors: [] };
try {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  page.on('pageerror', error => report.errors.push(error.message));
  for (const language of ['en', 'zh-Hant', 'ja']) {
    for (const width of [390, 1440]) {
      for (const scheme of ['light', 'dark']) {
        await page.setViewport({ width, height: 1000 });
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
        const response = await page.goto(`${base}/${language}/docs/connect-your-school/`, { waitUntil: 'networkidle0' });
        assert.equal(response.status(), 200);
        await page.addScriptTag({ content: axe });
        const audit = await page.evaluate(async () => ({
          violations: (await axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations,
          overflow: document.documentElement.scrollWidth > innerWidth,
          language: document.documentElement.lang,
          cycu: document.querySelector('#availability').parentElement.textContent.includes('CYCU'),
        }));
        assert.equal(audit.violations.length, 0, JSON.stringify(audit.violations));
        assert.equal(audit.overflow, false);
        assert.equal(audit.language, language);
        assert.equal(audit.cycu, true);
        report.guides.push({ language, width, scheme, ...audit });
      }
    }
  }
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({ controls: report.controls, guideStates: report.guides.length, errors: report.errors }, null, 2));
} finally {
  await writeFile(join(output, 'controls-guides-audit.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
