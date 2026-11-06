/** Real CSS timeout, without Electron or a server. Uses the installed Chrome. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from 'playwright';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const renderer = fileURLToPath(new URL('../src/renderer/', import.meta.url));
const html = (await readFile(new URL('../src/renderer/index.html', import.meta.url), 'utf8'))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
const fixture = await build({
  root, configFile: false, logLevel: 'error',
  plugins: [{
    name: 'bootstrap-fixture',
    resolveId: id => id === 'bootstrap-fixture' ? '\0bootstrap-fixture' : undefined,
    load: id => id === '\0bootstrap-fixture' ? `
      import { bootstrap } from ${JSON.stringify(renderer + 'bootstrap.ts')};
      import { createRoot } from 'react-dom/client';
      import { createElement } from 'react';
      void bootstrap(async () => {}, () => {
        createRoot(document.getElementById('root')).render(createElement('p', null, 'Application ready'));
      });
    ` : undefined,
  }],
  build: { write: false, rollupOptions: { input: 'bootstrap-fixture', output: { format: 'iife' } } },
});
const code = fixture.output.find(item => item.type === 'chunk').code;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  await Promise.all(['never-started', 'threw-before-render', 'completed'].map(async scenario => {
    const page = await browser.newPage();
    try {
      await page.setContent(html);
      const fallback = page.locator('.bootstrap-fallback');
      assert.equal(await fallback.isVisible(), false, `${scenario}: fallback starts hidden`);
      if (scenario === 'completed') {
        await page.addScriptTag({ content: code });
        await page.getByText('Application ready').waitFor();
      } else if (scenario === 'threw-before-render') {
        const error = page.waitForEvent('pageerror');
        await page.addScriptTag({ content: 'throw new Error("Module failed before React could render")' });
        assert.match((await error).message, /Module failed/);
      }
      // A real elapsed timeout proves CSS works even when no JavaScript can recover.
      await page.waitForTimeout(10_200);
      if (scenario === 'completed') {
        assert.equal(await fallback.count(), 0, 'successful React commit removes the fallback');
        assert.equal(await page.getByText('Application ready').isVisible(), true);
      } else {
        assert.equal(await fallback.isVisible(), true, `${scenario}: fallback must appear after ten seconds`);
        assert.equal(await fallback.locator('p[lang=en]').isVisible(), true);
      }
      console.log(`PASS: ${scenario}, checked after 10.2 seconds`);
    } finally { await page.close(); }
  }));
} finally { await browser.close(); }
