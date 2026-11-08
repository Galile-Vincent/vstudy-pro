const { chromium } = require(process.cwd() + '/apps/desktop/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
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
        await page.waitForSelector('[data-os-download-text]');
        assert.equal(await page.locator('[data-installer="mac-x64"], [data-installer="win-arm64"], #other-platforms').count(), 0);
        assert.doesNotMatch(await page.locator('main').innerText(), /Intel|ARM64/);
        const primary = page.locator('.dl-card-main');
        assert.deepEqual(await page.locator('[data-installer]').evaluateAll(els => els.map(el => el.dataset.installer)), enabled);
        assert.equal(await primary.count(), 2);
        assert.ok((await primary.nth(0).getAttribute('href')).endsWith('.dmg'));
        assert.ok((await primary.nth(1).getAttribute('href')).endsWith('.exe'));
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
        await primary.first().focus();
        assert.equal(await primary.first().evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
        assert.ok(await primary.first().evaluate(el => parseFloat(getComputedStyle(el).outlineWidth) >= 3));
        await page.screenshot({ path: `docs/evidence/download-cards/focus-${lang}-${width}-${theme}.png` });
        await primary.first().evaluate(el => el.blur());
        await primary.first().hover();
        assert.notEqual(await primary.first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
        await page.screenshot({path:`docs/evidence/download-cards/hover-${lang}-${width}-${theme}.png`});
        await page.mouse.move(0,0);
        const screenshot = `docs/evidence/download-cards/${lang}-${width}-${theme}.png`;
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
  for (const [userAgent, expected] of [['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'mac-arm64'], ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'win-x64']]) {
    const context = await browser.newContext({ userAgent });
    await context.addInitScript(() => Object.defineProperty(navigator, 'userAgentData', { value: undefined }));
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4322/en/download/');
    await page.waitForSelector(`.is-recommended[data-installer="${expected}"]`);
    const platform = expected.startsWith('mac') ? 'mac' : 'win';
    for (const lang of ['en', 'zh-Hant', 'ja']) {
      for (const width of [375, 1280]) {
        for (const theme of ['light', 'dark']) {
          await page.setViewportSize({width, height:800});
          await page.emulateMedia({colorScheme:theme, reducedMotion:'reduce'});
          await page.goto(`http://127.0.0.1:4322/${lang}/`);
          await page.waitForFunction(platform => [...document.querySelectorAll('[data-os-download]')].every(el => !el.querySelector(`[data-os-logo="${platform}"]`).hidden), platform);
          const buttons = await page.locator('[data-os-download]').evaluateAll(els => els.map(el => ({
            text:el.innerText, expected:el.dataset[navigator.userAgent.includes('Macintosh') ? 'labelMac' : 'labelWin'],
            logos:[...el.querySelectorAll('[data-os-logo]')].filter(logo => !logo.hidden).map(logo => logo.dataset.osLogo),
          })));
          assert.equal(buttons.length, 3);
          for (const button of buttons) {
            assert.equal(button.text.trim(), button.expected);
            assert.deepEqual(button.logos,[platform]);
            assert.doesNotMatch(button.text, /[↓↗→]/);
          }
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({path:`docs/evidence/download-cards/home-${lang}-${platform}-${width}-${theme}.png`});
          results.push({home:true,lang,width,theme,platform,buttons});
        }
      }
    }
    await context.close();
  }
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({javaScriptEnabled, userAgent:'Unknown device'});
    await context.addInitScript(() => Object.defineProperty(navigator,'userAgentData',{value:undefined}));
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4322/en/');
    const buttons = page.locator('[data-os-download]');
    assert.equal(await buttons.count(),3);
    assert.deepEqual(await buttons.allTextContents().then(texts => texts.map(text=>text.trim())),['Download','Download','Download']);
    assert.equal(await page.locator('[data-os-logo]:visible').count(),0);
    await context.close();
  }
  } finally { await browser.close(); }
  fs.writeFileSync('docs/evidence/download-cards/browser.json', JSON.stringify(results, null, 2) + '\n');
  console.log('PASS. 12 locale, viewport, and theme combinations. Both cards fit within 800px. No overflow. 72 keyboard section openings and 36 real clipboard matches. Mac and Windows recommendations pass. 24 home captures prove matching header and hero logos and localized labels.');
})().catch(error => { console.error(error); process.exitCode = 1; });
