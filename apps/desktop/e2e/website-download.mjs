/** Exercise the built download UI in Chrome with local assets and synthetic installer responses. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const dist = resolve(fileURLToPath(new URL('../../website/dist/', import.meta.url)));
const evidence = fileURLToPath(new URL('../../../docs/evidence/distribution/', import.meta.url));
const origin = 'https://vstudy-distribution.test';
const base = (process.env.BASE_PATH ?? '/vstudy-pro').replace(/\/$/, '');
const downloadBase = 'https://github.com/ava-apple/vstudy-pro/releases/latest/download/';
const targets = JSON.parse(await readFile(new URL('../distribution-targets.json', import.meta.url), 'utf8'));
const media = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const cases = [
  { name: 'mac-default', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', file: 'VStudy-Pro-mac-arm64.dmg' },
  { name: 'mac-intel-hints', ua: 'Macintosh', hints: { platform: 'macOS', architecture: 'x86', bitness: '64' }, file: 'VStudy-Pro-mac-x64.dmg' },
  { name: 'windows-default', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', file: 'VStudy-Pro-win-x64.exe' },
  { name: 'windows-arm-hints', ua: 'Windows NT 10.0; Win64; x64', hints: { platform: 'Windows', architecture: 'arm', bitness: '64' }, file: 'VStudy-Pro-win-arm64.exe' },
];

await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const language of ['en', 'zh-Hant', 'ja']) for (const scenario of cases) {
    const context = await browser.newContext({ userAgent: scenario.ua, viewport: { width: 1440, height: 1100 } });
    try {
      await context.addInitScript(hints => {
        Object.defineProperty(window.navigator, 'userAgentData', { configurable: true, value: hints ? {
          platform: hints.platform,
          getHighEntropyValues: () => new Promise(accept => window.setTimeout(() => accept(hints), 100)),
        } : undefined });
      }, scenario.hints);
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.href.startsWith(downloadBase)) {
          const name = url.pathname.split('/').at(-1);
          assert.equal(name, scenario.file);
          await route.fulfill({ status: 200, contentType: 'application/octet-stream', headers: { 'Content-Disposition': `attachment; filename="${name}"` }, body: 'Synthetic installer fixture. No public release was downloaded.' });
          return;
        }
        if (url.origin !== origin) { await route.abort(); return; }
        assert.ok(url.pathname.startsWith(base + '/'), 'Requests must use the built website base');
        const pathname = decodeURIComponent(url.pathname.slice(base.length));
        const file = resolve(dist, `.${pathname}${pathname.endsWith('/') ? 'index.html' : ''}`);
        assert.ok(file.startsWith(dist + sep), 'Only built website files may be served');
        try { await route.fulfill({ status: 200, contentType: media[extname(file)] ?? 'application/octet-stream', body: await readFile(file) }); }
        catch { await route.fulfill({ status: 404, body: 'Fixture file missing' }); }
      });
      const page = await context.newPage();
      await page.goto(`${origin}${base}/${language}/`);
      const href = downloadBase + scenario.file;
      const target = targets.find(target => `VStudy-Pro-${target.key}.${target.installer}` === scenario.file);
      await page.waitForFunction(expected => {
        const links = [...window.document.querySelectorAll('[data-download-primary]')];
        return links.length >= 3 && links.every(link => expected.enabled ? link.href === expected.href
          : !link.hasAttribute('href') && link.getAttribute('aria-disabled') === 'true' && link.getAttribute('aria-label')?.includes(expected.label));
      }, {href, enabled: target.releaseEnabled, label: target.label});
      const picker = page.locator('[data-download-picker]:not(.compact)').first();
      assert.equal(await picker.locator('.download-actions').evaluate(element => window.getComputedStyle(element).display), 'flex', 'Built download styles must load');
      assert.equal(await picker.locator('.intel-alternative').getAttribute('href'),
        targets.find(target => target.key === 'mac-x64').releaseEnabled ? downloadBase + 'VStudy-Pro-mac-x64.dmg' : null);
      assert.ok(await picker.locator('.intel-alternative').isVisible());
      await picker.locator('.download-platforms summary').click();
      assert.equal(await picker.locator('[data-installer]').count(), 4);
      assert.equal(await picker.locator('[data-installer][aria-disabled="true"]').count(), targets.filter(target => !target.releaseEnabled).length);
      assert.ok(await picker.locator(`a[href="${downloadBase}SHA256SUMS.txt"]`).isVisible());
      await picker.locator('.download-platforms summary').click();
      if (scenario.name === 'windows-arm-hints') {
        await picker.screenshot({ path: resolve(evidence, `website-${language}-windows-download.png`), animations: 'disabled' });
      }
      if (!target.releaseEnabled) {
        assert.equal(await page.locator(`a[href="${href}"]`).count(), 0, 'Planned targets must never offer a download');
        results.push({language, scenario: scenario.name, planned: true, clickDownloaded: false});
        continue;
      }
      const [download] = await Promise.all([page.waitForEvent('download'), picker.locator('[data-download-primary]').click()]);
      assert.equal(download.suggestedFilename(), scenario.file);
      assert.equal(await download.failure(), null);
      results.push({ language, scenario: scenario.name, href, suggestedFilename: download.suggestedFilename(), clickDownloaded: true });
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
await writeFile(resolve(evidence, 'website-download-browser.json'), JSON.stringify({
  verifiedAt: new Date().toISOString(), browser: 'installed Google Chrome, headless',
  surface: 'built website with intercepted static files and synthetic installer responses',
  publicDownloadAvailabilityVerified: false, results,
}, null, 2) + '\n');
console.log(`PASS: ${results.length} browser cases across three languages download enabled installers in one click and disable planned targets.`);
