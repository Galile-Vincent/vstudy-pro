const { chromium } = require(process.cwd() + '/apps/desktop/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const release = JSON.parse(fs.readFileSync('apps/website/src/data/release.json'));
const labels = { en: ['Version', 'Updated'], 'zh-Hant': ['版本', '更新日期'], ja: ['バージョン', '更新日'] };
const enabled = JSON.parse(fs.readFileSync('apps/desktop/distribution-targets.json')).filter(target => target.releaseEnabled).map(target => target.key);
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
        await page.goto(`http://127.0.0.1:4322/${lang}/download/`);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForSelector('[data-os-download-text]', {state:'attached'});
        assert.equal(await page.locator('[data-installer="mac-x64"], [data-installer="win-arm64"], #other-platforms').count(), 0);
        assert.doesNotMatch(await page.locator('main').innerText(), /Intel|ARM64/);
        const date = new Intl.DateTimeFormat({ en: 'en-US', 'zh-Hant': 'zh-TW', ja: 'ja-JP' }[lang], {year:'numeric', month:lang === 'en' ? 'short' : 'long', day:'numeric', timeZone:'UTC'}).format(new Date(release.publishedAt));
        assert.equal(await page.locator('.dl-release').innerText(), `${labels[lang][0]} ${release.version} · ${labels[lang][1]} ${date}`);
        assert.equal(await page.locator('.dl-release time').getAttribute('datetime'), release.publishedAt);
        for (const [key, asset] of Object.entries(release.assets)) {
          assert.ok((await page.locator(`[data-installer="${key}"]`).innerText()).includes(`${(asset.bytes / 1_000_000).toFixed(1)} MB`));
          assert.ok((await page.locator(`[data-installer="${key}"] a`).getAttribute('href')).includes(`/v${release.version}/`));
        }
        const primary = page.locator('.dl-card-main');
        assert.deepEqual(await page.locator('[data-installer]').evaluateAll(els => els.map(el => el.dataset.installer)), enabled);
        assert.equal(await primary.count(), 2);
        assert.ok((await primary.nth(0).getAttribute('href')).endsWith('.dmg'));
        assert.ok((await primary.nth(1).getAttribute('href')).endsWith('.exe'));
        const metrics = await page.evaluate(() => ({
          width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          theme: document.documentElement.dataset.scheme,
          cards: [...document.querySelectorAll('.dl-card')].map(el => ({ text: el.innerText, ...el.getBoundingClientRect().toJSON() })),
          heading: document.querySelector('.dl-head').getBoundingClientRect().toJSON(),
          releaseText: document.querySelector('.dl-release').innerText,
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
        await primary.first().focus();
        assert.equal(await primary.first().evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
        assert.ok(await primary.first().evaluate(el => parseFloat(getComputedStyle(el).outlineWidth) >= 3));
        await page.screenshot({ path: `docs/evidence/download-version/focus-${lang}-${width}-${theme}.png` });
        await primary.first().evaluate(el => el.blur());
        await primary.first().hover();
        assert.notEqual(await primary.first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
        await page.screenshot({path:`docs/evidence/download-version/hover-${lang}-${width}-${theme}.png`});
        await page.mouse.move(0,0);
        const screenshot = `docs/evidence/download-version/${lang}-${width}-${theme}.png`;
        await page.screenshot({ path: screenshot });
        const summaries = page.locator('main details > summary');
        assert.equal(await summaries.count(), 6);
        for (let i = 0; i < 6; i++) {
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
        results.push({ lang, width, theme, ...metrics, keyboardSections: 6, clipboardMatches: 3, firstOpenLink: true, errors, screenshot });
        await context.close();
      }
    }
  }
  for (const lang of ['en', 'zh-Hant', 'ja']) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: {width:375,height:800} });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:4322/${lang}/download/`);
    assert.ok((await page.locator('.dl-release').innerText()).includes(release.version));
    assert.equal(await page.locator('.dl-release time').getAttribute('datetime'), release.publishedAt);
    assert.equal(await page.locator('.dl-card').count(), 2);
    await context.close();
  }
  } finally { await browser.close(); }
  fs.writeFileSync('docs/evidence/download-version/browser.json', JSON.stringify(results, null, 2) + '\n');
  console.log('PASS. 12 locale, viewport, and theme combinations. Both cards fit within 800px. No overflow. 72 keyboard section openings and 36 real clipboard matches. Release version, localized UTC date, exact asset sizes, pinned links, and no-JavaScript metadata pass.');
})().catch(error => { console.error(error); process.exitCode = 1; });
