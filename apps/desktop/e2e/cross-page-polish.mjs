/** Run against `pnpm dev`; deterministic mock routes, no live accounts. */
import { checkHeaderRegressions } from './header-regressions.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const round = process.env.ROUND ?? 'after';
const output = process.env.VSTUDY_POLISH_EVIDENCE ?? `/tmp/vstudy-cross-page/${round}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [], errors = [];
try {
 for (const language of ['en', 'zh-Hant']) for (const scheme of ['light', 'dark']) for (const width of [1280, 900, 600]) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
  for (const route of ['design', 'home', 'library', 'courses', 'history', 'review', 'exams', 'ai-chats']) {
   const page = await context.newPage();
   page.on('pageerror', error => errors.push({route, message:error.message, stack:error.stack}));
   await page.addInitScript(view => {localStorage.clear(); localStorage.setItem('vstudy-route', JSON.stringify({view}));}, route);
   await page.goto(`${process.env.VSTUDY_RENDERER_URL ?? 'http://localhost:5173'}/?libraryDemo=1&reviewDemo=1&updateState=ready${route === 'design' ? '#/design' : ''}`);
   await page.locator('[data-slot=page-header]').first().waitFor();
   await page.evaluate(async ({language, scheme}) => {
    const { desktop } = await import('/bridge.ts');
    const { applyLanguage } = await import('/i18n.tsx');
    const { applyAppearance } = await import('/settings/apply-appearance.ts');
    const s = await desktop.invoke('settings:get', {});
    await desktop.invoke('settings:set', {...s, language, colorScheme: scheme});
    await applyLanguage(language); applyAppearance({...s, colorScheme: scheme});
   }, {language, scheme});
   await page.evaluate(() => document.fonts.ready);
   const measurements = await page.evaluate(() => {
    const all = selector => [...document.querySelectorAll(selector)].filter(e => e.getBoundingClientRect().width).map(e => {
     const s = getComputedStyle(e), r = e.getBoundingClientRect();
     return {text:e.textContent.trim().slice(0,60), x:r.x,y:r.y,width:r.width,height:r.height,font:s.fontSize,weight:s.fontWeight,padding:s.padding,gap:s.gap,margin:s.margin,border:s.borderBottomWidth,radius:s.borderRadius,shadow:s.boxShadow,background:s.backgroundColor};
    });
    return {headers:all('[data-slot=page-header]'),titles:all('[data-slot=page-header] h1'),descriptions:all('[data-slot=page-header] p'),containers:all('[data-slot=page-container]'),rows:all('.ui-row-target'),labels:all('.shell-sidebar [data-slot=sidebar-group-label]'),meters:all('.subscription-progress'),tabs:all('[data-slot=segmented-tabs-trigger],.library-mode button')};
   });
   assert.ok(measurements.titles.length, `${route} must render a page title`);
   const path = `${output}/${language}-${scheme}-${width}-${route}.png`;
   await page.screenshot({path, fullPage:false});
   results.push({language,scheme,width,route,path,...measurements});
   if (route === 'library') {
    const folders = page.locator('.library-mode [data-slot=segmented-control-item],.library-mode button').nth(1);
    await folders.click(); await page.locator('.folder-grid').waitFor();
   }
   await page.close();
  }
  await context.close();
 }
 const regressionPage = await browser.newPage();
 results.push({regressions: await checkHeaderRegressions(regressionPage, output)});
 await regressionPage.close();
 const unexpected = errors.filter(error => !(error.route === 'review' && error.message === "Cannot read properties of undefined (reading 'filter')" && error.stack.includes('materializeActiveMoodleCourses')));
 assert.deepEqual(unexpected, [], 'No new renderer error types relative to the before audit');
} finally { await browser.close(); await writeFile(`${output}/measurements.json`, JSON.stringify({results,errors},null,2)); }
console.log(`${results.filter(result => result.route).length} page captures plus 2 regression captures; ${errors.length} renderer errors; library mode interaction passed`);
