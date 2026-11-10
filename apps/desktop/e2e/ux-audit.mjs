/** Cross-screen Electron audit. Runs serially and saves geometry, accessible names and screenshots. */
import { waitForDocumentStatus } from './helpers/document-status.mjs';
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { installSchoolFixture } from './ux-fixture.mjs';
import { onboardingForward } from './helpers/onboarding.mjs';
const evidence = resolve('../../docs/evidence/ux');
const profile = await mkdtemp(join(tmpdir(), 'vstudy-ux-audit-'));
const phase = process.env.UX_PHASE ?? 'after';
const captures = [], errors = [];
let app, server;
try {
  await mkdir(evidence, { recursive: true });
  server = await createServer({ configFile: false, root: resolve('src/renderer'), resolve: { alias: { '@': resolve('src/renderer') } }, html: { cspNonce: 'vstudy-development' }, plugins: [react(), tailwind()], server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd()] } } });
  await server.listen();
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${profile}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', ELECTRON_RENDERER_URL: server.resolvedUrls.local[0], VSTUDY_FAKE_PROVIDER: '1', VSTUDY_LOCALE: 'en' } });
  const page = await app.firstWindow();
  page.setDefaultTimeout(6000);
  page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const size = async (width, height) => { await app.evaluate(({ BrowserWindow }, [w,h]) => BrowserWindow.getAllWindows()[0].setSize(w,h), [width,height]); };
  const capture = async (name, axe = false) => {
    await page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
    if (name.includes('en-XA')) await language('en-XA');
    const path = `${phase}-${name}.png`;
    await page.screenshot({ path: join(evidence, path), animations: 'disabled' });
    const geometry = await page.evaluate(() => {
      const nodes = [...window.document.querySelectorAll('.shell-topbar,main,[role=dialog],[role=tabpanel],.onboarding-content,.moodle-page,.settings-pane,.library-main,.history-dialog')].filter(el => el.getBoundingClientRect().width > 0);
      const overflow = nodes.filter(el => el.scrollWidth > el.clientWidth + 2).map(el => ({
        cls: el.className, width: el.clientWidth, scrollWidth: el.scrollWidth,
        children: [...el.querySelectorAll('*')].filter(node => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.right > el.getBoundingClientRect().right + 1;
        }).map(node => ({
          cls: node.className, text: node.textContent.slice(0, 80),
          width: node.clientWidth, scrollWidth: node.scrollWidth,
        })).slice(0, 12),
      }));
      const dialogs = [...window.document.querySelectorAll('[role=dialog]')].map(el => {
        const rect = el.getBoundingClientRect();
        return {
          cls: el.className,
          outside: rect.x < -1 || rect.y < -1 || rect.right > window.innerWidth + 1 || rect.bottom > window.innerHeight + 1,
        };
      });
      return { width: window.innerWidth, height: window.innerHeight, overflow, dialogs };
    });
    const violations = axe ? (await new AxeBuilder({page}).setLegacyMode(true).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })) : [];
    await writeFile(join(evidence, `${phase}-${name}.txt`), await page.locator('body').ariaSnapshot());
    captures.push({ name, path, ...geometry, accessibilityChecked: axe, violations });
    console.log(name, JSON.stringify({ overflow: geometry.overflow, outside: geometry.dialogs.filter(d => d.outside), violations }));
  };
  await page.locator('.onboarding').waitFor();
  const modulePath = [...server.moduleGraph.idToModuleMap.values()].find(module => module.file === resolve('src/shared/i18n.ts'))?.url;
  if (!modulePath) throw new Error('The active localization module was not loaded');
  const language = async value => { await page.evaluate(async ({path,value}) => { const {i18n} = await import(path); await i18n.changeLanguage(value); window.document.documentElement.lang = value; }, {path:modulePath,value}); };
  const set = async patch => { await page.evaluate(async patch => { const s = await window.desktop.invoke('settings:get', {}); await window.desktop.invoke('settings:set', {...s,...patch}); },patch); };
  const route = async (view, extra={}) => { await page.evaluate(value => window.localStorage.setItem('vstudy-route',JSON.stringify(value)), {view,...extra}); await page.reload(); await page.locator('.shell-content').waitFor(); await page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))); await page.evaluate(() => window.desktop.invoke('settings:get',{})); };
  await page.locator('.onboarding').waitFor();
  for (const [width,height] of [[720,480],[1200,800],[1600,1000]]) {
    await size(width,height);
    await capture(`welcome-guide-${width}`, true);
  }
  await size(720,480);
  await language('en-XA');
  await capture('guide-pseudo-min');
  await language('en');
  for (let step=1;step<6;step++) { await onboardingForward(page).click(); await capture(`guide-step-${step}-min`); }
  await page.keyboard.press('Escape');
  await page.locator('.onboarding').waitFor({state:'detached'});
  await capture('home-fresh-min',true);
  await route('library'); await capture('library-empty-min',true);
  await route('courses'); await capture('courses-empty-min',true);
  await page.getByRole('button',{name:'Connect school',exact:true}).first().click();
  await page.locator('.moodle-connect').waitFor(); await capture('connect-min',true);
  await page.keyboard.press('Escape');
  await page.locator('.moodle-connect').waitFor({state:'detached'});
  const sample = await page.evaluate(() => window.desktop.invoke('documents:importSample',{language:'en'}));
  await waitForDocumentStatus(page, sample.id);
  await set({onboardingCompleted:true,welcomeSeen:true,lastProviderId:'anthropic-api',lastModelId:'fake'});
  await installSchoolFixture(app);
  for (const [locale,width,height,uiScale] of [['en',1200,800,100],['zh-Hant',720,480,125],['ja',1600,1000,100],['en-XA',720,480,125]].filter(row => !process.env.UX_LOCALE || row[0] === process.env.UX_LOCALE)) {
    await size(width,height); await set({uiScale,density:uiScale===125?'compact':'comfortable',language:locale==='en-XA'?'en':locale});
    const visit = async (view, extra={}) => { await route(view === 'welcome' ? 'home' : view,extra); if(view === 'welcome') await page.locator('#welcome-entry').click(); await language(locale); };
    const label = `${locale}-${width}-${uiScale}`;
    await visit('home'); await capture(`home-${label}`);
    await visit('welcome'); await capture(`welcome-${label}`);
    await visit('library'); await page.locator('.library-document').first().waitFor(); await capture(`library-${label}`,true);
    await visit('workspace',{documentId:sample.id}); await page.getByTestId('document-markdown').waitFor(); await capture(`reader-${label}`,true);
    await visit('history'); await capture(`history-${label}`,true);
    await visit('courses'); await page.locator('.moodle-course-card').first().waitFor(); await capture(`courses-${label}`,true);
    for (const tab of await page.locator('.moodle-term-tabs [role=tab]').all()) { await tab.click(); await tab.evaluate(el => { if (!window.document.getElementById(el.getAttribute('aria-controls'))) throw new Error('The selected course term has no accessible panel'); }); }
    await visit('courses',{courseId:'10000000-0000-4000-8000-000000000010'});
    await page.locator('.moodle-module').first().waitFor(); await capture(`course-content-${label}`,true);
    await page.locator('.moodle-module').first().click(); await page.locator('[data-slot=sheet-content]').waitFor(); await capture(`module-${label}`,true);
    await page.keyboard.press('Escape'); await page.locator('[data-slot=sheet-content]').waitFor({state:'detached'});
    for (const tab of await page.locator('.moodle-tabs > [role=tablist] [role=tab]').all()) { await tab.click(); await capture(`course-${await tab.getAttribute('data-state')}-${await tab.getAttribute('id')}-${label}`); }
    await page.locator('.moodle-chat-button').click(); await capture(`course-assistant-${label}`,true); await page.keyboard.press('Escape');
    await visit('courses'); await page.locator('.moodle-course-card').first().waitFor();
    await page.getByRole('button',{name:/Planner|讀書計畫|学習プラン|Plánnër/}).first().click();
    await page.getByTestId('student-planner').waitFor(); await capture(`planner-${label}`,true);
    await page.evaluate(() => window.dispatchEvent(new window.Event('vstudy:open-settings')));
    await page.locator('.settings-dialog').waitFor();
    for (const tab of await page.locator('.settings-tabs [role=tab]').all()) { await tab.click(); await capture(`settings-${await tab.getAttribute('id')}-${label}`,true); }
    await page.keyboard.press('Escape');
    await page.locator('.settings-dialog').waitFor({state:'detached'});
  }
  await size(1200,800); await set({uiScale:100,language:'en'}); await route('home');
  for(const themeId of ['ocean','grove','ember','iris']) for(const colorScheme of ['light','dark']) {
    await set({themeId,colorScheme}); await route('library'); await capture(`theme-${themeId}-${colorScheme}`,true);
    await page.evaluate(() => window.dispatchEvent(new window.CustomEvent('vstudy:open-settings',{detail:{tab:'appearance'}})));
    await page.locator('.themes-grid').waitFor(); await capture(`appearance-${themeId}-${colorScheme}`); await page.keyboard.press('Escape');
  }
  for (const state of ['expired','error']) {
    await app.evaluate((_electron,state) => {globalThis.uxSchoolState=state;},state);
    await route('courses'); await capture(`courses-${state}`,true);
  }
  await writeFile(join(evidence, `${phase}-audit.json`),JSON.stringify({captures,errors},null,2));
  console.log(`Captured ${captures.length} states. Renderer errors ${errors.length}.`);
  if (phase === 'after') {
    assert.deepEqual(errors, []);
    assert.deepEqual(captures.filter(capture => capture.overflow.length || capture.violations.length || capture.dialogs.some(dialog => dialog.outside)), [], 'no container overflow, offscreen dialogs, or accessibility violations');
  }
} catch(error) {
  if(app) {const page=await app.firstWindow(); await page.screenshot({path:join(evidence,`${phase}-failure.png`)});console.error((await page.locator('body').innerText()).slice(-4000));}
  throw error;
} finally {
  await writeFile(join(evidence, `${phase}-audit.json`),JSON.stringify({captures,errors},null,2));
  await app?.close(); await server?.close(); await rm(profile,{recursive:true,force:true});
}
