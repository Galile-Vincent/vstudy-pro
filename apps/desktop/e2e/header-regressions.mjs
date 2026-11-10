/** Real components and computed CSS; no live Moodle or AI session required. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

export async function checkHeaderRegressions(page, output, { assertValues = true } = {}) {
 await page.goto(`${process.env.VSTUDY_RENDERER_URL ?? 'http://localhost:5173'}/?libraryDemo=1`);
 await page.locator('[data-slot=page-header]').first().waitFor();
 await page.evaluate(async path => (await import(/* @vite-ignore */ path)).mount(), `/@fs/${resolve(import.meta.dirname, 'fixtures/header-regressions.tsx')}`);
 await page.locator('.moodle-webview-header').waitFor();
 await page.evaluate(() => document.fonts.ready);
 const results = [];
 for (const width of [900, 600]) {
  await page.setViewportSize({width, height: 500});
  const values = await page.evaluate(() => {
   const header = document.querySelector('.moodle-webview-header');
   const title = getComputedStyle(header.querySelector('h1'));
   return {width: innerWidth, height: header.getBoundingClientRect().height, font: title.fontSize, weight: title.fontWeight, whiteSpace: title.whiteSpace, overflow: title.textOverflow, lineHeight: title.lineHeight, descriptionMargin: getComputedStyle(header.querySelector('p')).marginTop, session: getComputedStyle(document.querySelector('.web-chat-toolbar small')).display, plannerTitleMargin: getComputedStyle(document.querySelector('.planner h1')).margin, plannerDescriptionMargin: getComputedStyle(document.querySelector('.planner p')).margin, reviewLeading: getComputedStyle(document.querySelector('.review-page p')).lineHeight};
  });
  results.push(values);
  if (output) await page.screenshot({path: `${output}/headers-${width}.png`});
  if (assertValues) {
   assert.equal(values.font, '17px');
   assert.equal(values.weight, '700');
   assert.equal(values.whiteSpace, 'nowrap');
   assert.equal(values.overflow, 'ellipsis');
   assert.equal(values.lineHeight, '22px');
   assert.equal(values.descriptionMargin, '4px');
   if (width === 900) assert.equal(values.height, 76);
   assert.equal(values.session, width === 600 ? 'none' : 'inline');
   assert.equal(values.plannerTitleMargin, '0px');
   assert.equal(values.plannerDescriptionMargin, '0px');
  }
 }
 return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 const output = process.env.VSTUDY_POLISH_EVIDENCE;
 if (output) await mkdir(output, {recursive: true});
 const browser = await chromium.launch();
 try { console.log(await checkHeaderRegressions(await browser.newPage(), output)); }
 finally { await browser.close(); }
}
