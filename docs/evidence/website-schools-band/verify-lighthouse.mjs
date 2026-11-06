/** Audit the production preview sequentially with one Chrome process. Scores describe these local mobile runs. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const output = fileURLToPath(new URL('.', import.meta.url));
const qa = process.env.QA_PACKAGE_DIR ?? '/tmp/vstudy-w4-qa';
const require = createRequire(await realpath(join(qa, 'node_modules/lighthouse/package.json')));
const { default: lighthouse } = await import(require.resolve('lighthouse'));
const chromeLauncher = await import(require.resolve('chrome-launcher'));
const base = process.env.WEBSITE_URL ?? 'http://127.0.0.1:4338/vstudy-pro';
const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--disable-gpu'] });
const reports = [];
try {
  for (const language of ['en', 'zh-Hant', 'ja']) {
    for (const name of ['home']) {
      const url = `${base}/${language}/${name === 'home' ? '' : 'docs/connect-your-school/'}`;
      const { lhr } = await lighthouse(url, { port: chrome.port, logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] });
      await writeFile(join(output, `lighthouse-${name}-${language}.json`), JSON.stringify(lhr, null, 2) + '\n');
      const result = { language, name, url, scores: Object.fromEntries(Object.entries(lhr.categories).map(([key, value]) => [key, value.score * 100])), cls: lhr.audits['cumulative-layout-shift'].numericValue, runtimeError: lhr.runtimeError ?? null };
      reports.push(result);
      console.log(JSON.stringify(result));
      assert.equal(result.runtimeError, null);
      for (const score of Object.values(result.scores)) assert.ok(score >= 95);
      assert.equal(result.cls, 0);
    }
  }
} finally {
  await writeFile(join(output, 'lighthouse-summary.json'), JSON.stringify(reports, null, 2) + '\n');
  await chrome.kill();
}
