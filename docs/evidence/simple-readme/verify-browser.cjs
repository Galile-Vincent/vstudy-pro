const { chromium } = require(process.cwd() + '/apps/desktop/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
  for (const lang of ['en', 'zh-Hant', 'ja']) {
    for (const width of [375, 1280]) {
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: theme, permissions: ['clipboard-read', 'clipboard-write'] });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:4321/${lang}/download/`);
        await page.evaluate(() => document.fonts.ready);
        const metrics = await page.evaluate(() => ({
          width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          theme: document.documentElement.dataset.scheme,
          cards: [...document.querySelectorAll('.dl-card')].map(el => ({ text: el.innerText, ...el.getBoundingClientRect().toJSON() })),
          heading: document.querySelector('main h1').getBoundingClientRect().toJSON(),
          closed: [...document.querySelectorAll('main details')].every(el => !el.open),
        }));
        assert.equal(metrics.width, width);
        assert.ok(metrics.scrollWidth <= width);
        assert.equal(metrics.theme, theme);
        assert.equal(metrics.cards.length, 2);
        assert.ok(metrics.closed);
        for (const card of metrics.cards) assert.ok(card.top >= 0 && card.bottom <= 800, JSON.stringify(metrics));
        if (width === 1280) assert.equal(metrics.cards[0].top, metrics.cards[1].top);
        else assert.ok(metrics.cards[1].top >= metrics.cards[0].bottom);
        assert.ok(metrics.cards[0].top - metrics.heading.bottom <= 25);
        const screenshot = `docs/evidence/simple-readme/${lang}-${width}-${theme}.png`;
        await page.screenshot({ path: screenshot });
        const summaries = page.locator('main details > summary');
        assert.equal(await summaries.count(), 7);
        for (let i = 0; i < 7; i++) {
          const summary = summaries.nth(i);
          await summary.focus();
          await page.keyboard.press(i % 2 ? 'Space' : 'Enter');
          assert.ok(await summary.locator('..').evaluate(el => el.open));
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        const buttons = page.locator('[data-install-copy]');
        assert.equal(await buttons.count(), 3);
        for (let i = 0; i < 3; i++) {
          const button = buttons.nth(i);
          const expected = await button.locator('..').locator('code').textContent();
          await button.focus();
          await page.keyboard.press('Enter');
          await page.waitForFunction(label => document.querySelector('[data-install-status]').textContent === label, { en: 'Copied', 'zh-Hant': '已複製', ja: 'コピーしました' }[lang]);
          assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected);
        }
        await page.locator('main details').evaluateAll(els => els.forEach(el => el.open = false));
        await page.locator('[data-open-help]').click();
        assert.ok(await page.locator('#mac-first-open').evaluate(el => el.open));
        assert.equal(await page.evaluate(() => document.activeElement.tagName), 'SUMMARY');
        assert.deepEqual(errors, []);
        results.push({ lang, width, theme, ...metrics, keyboardSections: 7, clipboardMatches: 3, firstOpenLink: true, errors, screenshot });
        await context.close();
      }
    }
  }
  for (const [userAgent, expected] of [['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'mac-arm64'], ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'win-x64']]) {
    const context = await browser.newContext({ userAgent });
    await context.addInitScript(() => Object.defineProperty(navigator, 'userAgentData', { value: undefined }));
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4321/en/download/');
    await page.waitForSelector(`.is-recommended[data-installer="${expected}"]`);
    await context.close();
  }
  } finally { await browser.close(); }
  fs.writeFileSync('docs/evidence/simple-readme/browser.json', JSON.stringify(results, null, 2) + '\n');
  console.log('PASS. 12 locale, viewport, and theme combinations. Both cards fit within 800px. No overflow. 84 keyboard section openings and 36 real clipboard matches. Mac and Windows recommendations pass.');
})().catch(error => { console.error(error); process.exitCode = 1; });
