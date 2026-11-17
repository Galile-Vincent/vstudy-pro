import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { seedRoute } from './helpers/tab-route.mjs';
import { captureTime, seedCoursesDesign } from './fixtures/courses-design.mjs';

const phase = process.env.COURSES_CAPTURE_PHASE ?? 'after';
const evidence = `/Users/vc/.t3/evidence/vc-4/${phase}`;
const profile = await mkdtemp(join(tmpdir(), 'vc4-library-'));
await mkdir(evidence, { recursive: true });
const results = [];
const layouts = [];
let app;
try {
  app = await electron.launch({ executablePath:createRequire(import.meta.url)('electron'), args: [resolve('apps/desktop'), `--user-data-dir=${profile}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: 'en', VSTUDY_FAKE_PROVIDER: '1' } });
  const page = await app.firstWindow();
  await page.evaluate(async () => {
    await window.desktop.invoke('analytics:setConsent', {enabled:false});
    await window.desktop.invoke('providers:configure', {kind:'api', id:'anthropic-api', enabled:true});
    const settings = await window.desktop.invoke('settings:get', {});
    await window.desktop.invoke('settings:set', {...settings, lastProviderId:'anthropic-api', lastModelId:'fake', onboardingCompleted:true, welcomeSeen:true});
  });
  await seedCoursesDesign(app, profile);
  await page.clock.setFixedTime(captureTime);
  await page.emulateMedia({reducedMotion:'reduce'});
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setMinimumSize(720, 600));
  const navigate = async (scheme, language = 'en', view = 'list') => {
    await page.evaluate(async ({scheme, language, view}) => {
      const settings = await window.desktop.invoke('settings:get', {});
      await window.desktop.invoke('settings:set', {...settings, language, colorScheme:scheme, themeId:'vstudy', material:'solid', onboardingCompleted:true, welcomeSeen:true});
      localStorage.setItem('vstudy.courses.view', view);
      localStorage.setItem('vstudy-onboarding-v1', JSON.stringify({version:1,step:'start',goal:'school',status:'completed',done:['setup'],dismissed:['courses']}));
    }, {scheme, language, view});
    await seedRoute(page, {view:'courses'});
    await page.reload();
    await page.locator('.moodle-course-card').first().waitFor();
  };
  const capture = async name => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name);
    if (phase === 'after' && await page.locator('.course-library-row').count()) {
      const rows = await page.locator('.course-library-row').evaluateAll(nodes => nodes.map(row => {
        const rect = node => { const {x,y,width,height} = node.getBoundingClientRect(); return {x,y,width,height}; };
        const meta = row.querySelector('.course-meta');
        const deadline = meta?.querySelector('time');
        return {
          row:rect(row),
          view:row.closest('[data-view]').dataset.view,
          title:rect(row.querySelector('.course-title')),
          deadline:deadline ? {...rect(deadline), scrollWidth:deadline.scrollWidth, text:deadline.textContent} : null,
          meta:meta ? rect(meta) : null,
          slots:[...row.querySelectorAll('.course-count,.course-pin,button[aria-label]')].map(rect),
        };
      }));
      for (const row of rows) {
        if (row.view === 'list') {
          assert.equal(row.row.height, 64, `${name}: dense row height`);
          if (row.meta) assert.ok(row.meta.y >= row.title.y + row.title.height, `${name}: metadata below title`);
        }
        if (row.deadline) {
          assert.ok(row.deadline.scrollWidth <= Math.ceil(row.deadline.width), `${name}: complete deadline`);
          assert.ok(row.deadline.x + row.deadline.width <= row.meta.x + row.meta.width + 1, `${name}: deadline fits metadata`);
        }
      }
      const groups = Map.groupBy(rows, row => row.row.x);
      for (const group of groups.values()) {
        for (const row of group) assert.deepEqual(row.slots.map(slot => Math.round(slot.x)), group[0].slots.map(slot => Math.round(slot.x)), `${name}: aligned action slots`);
      }
      layouts.push({name, rows});
    }
    await page.screenshot({path:join(evidence, `${name}.png`), animations:'disabled'});
    results.push(name);
  };
  for (const [width,height] of [[1440,900],[960,800],[760,700],[720,700]]) {
    await app.evaluate(({BrowserWindow}, {width,height}) => BrowserWindow.getAllWindows()[0].setContentSize(width,height), {width,height});
    for (const scheme of ['light','dark']) {
      await navigate(scheme);
      await capture(`${scheme}-${width}-populated`);
      const first = page.locator('.course-open').first();
      await first.hover();
      await capture(`${scheme}-${width}-hover`);
      await first.focus();
      await capture(`${scheme}-${width}-focus`);
      if (phase === 'after') {
        await page.keyboard.press('Tab');
        assert.match(await page.locator(':focus').getAttribute('aria-label'), /Open .+ in new tab/);
        await capture(`${scheme}-${width}-open-focus`);
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('.course-pin').first().evaluate(node => node === document.activeElement), true);
        await capture(`${scheme}-${width}-pin-focus`);
      }
      await page.locator('.course-pin').first().click();
      await page.waitForFunction(() => document.querySelector('.course-pin[aria-pressed=true]'));
      await capture(`${scheme}-${width}-pinned`);
      await page.locator('.course-pin[aria-pressed=true]').first().click();
      await navigate(scheme, 'en', 'cards');
      await capture(`${scheme}-${width}-cards`);
      await page.getByRole('tab', {name:/Upcoming/}).click();
      await capture(`${scheme}-${width}-empty-term`);
    }
  }
  if (phase === 'after') {
    await navigate('light');
    const entries = page.locator('.course-open');
    await entries.first().focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await entries.nth(1).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Home');
    assert.equal(await entries.first().evaluate(node => node === document.activeElement), true);
    const firstId = await page.locator('[data-course-id]').first().getAttribute('data-course-id');
    await page.getByRole('button', {name:'Refresh all schools', exact:true}).click();
    await page.locator(`[data-course-id="${firstId}"]`).waitFor();
    const report = await new AxeBuilder({page}).setLegacyMode(true).include('.course-library').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(report.violations.map(item => ({id:item.id, targets:item.nodes.map(node=>node.target)})), []);
    await page.getByRole('button', {name:/^Updates/}).click();
    const update = page.locator('[data-update-id]').first();
    const unread = await update.getAttribute('data-unread');
    await update.locator('.update-open').focus();
    await page.keyboard.press('m');
    await page.waitForFunction(({id,unread}) => document.querySelector(`[data-update-id="${id}"]`)?.getAttribute('data-unread') !== unread, {id:await update.getAttribute('data-update-id'),unread});
  }
  for (const language of ['zh-Hant','ja']) {
    await navigate('light', language);
    await capture(`${language}-720`);
  }
  for (const width of [1440,720]) for (const scheme of ['light','dark']) {
    await app.evaluate(({BrowserWindow},width) => BrowserWindow.getAllWindows()[0].setContentSize(width, width === 1440 ? 900 : 700), width);
    await app.evaluate(({ipcMain}) => {
      ipcMain.removeHandler('moodle:overview');
      ipcMain.handle('moodle:overview', () => new Promise(() => {}));
    });
    await page.evaluate(async scheme => {
      const settings = await window.desktop.invoke('settings:get', {});
      await window.desktop.invoke('settings:set', {...settings, language:'en', colorScheme:scheme});
    }, scheme);
    await page.reload();
    await page.getByRole('status').filter({hasText:'Loading'}).first().waitFor();
    await capture(`${scheme}-${width}-loading`);
    await app.evaluate(({ipcMain}) => {
      ipcMain.removeHandler('moodle:overview');
      ipcMain.handle('moodle:overview', () => {throw new Error('Synthetic offline fixture');});
    });
    await page.reload();
    await page.getByRole('alert').first().waitFor();
    await capture(`${scheme}-${width}-error`);
  }
  console.log(`PASS ${results.length} library captures, no page overflow`);
} finally {
  await writeFile(join(evidence,'layout-results.json'), JSON.stringify(layouts,null,2));
  await writeFile(join(evidence,'results.json'), JSON.stringify(results,null,2));
  await app?.close();
  await rm(profile,{recursive:true,force:true});
}
