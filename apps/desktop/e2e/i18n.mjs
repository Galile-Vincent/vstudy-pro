import { temporaryPath } from '../scripts/platform.mjs';
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp,rm,mkdir,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
const evidence=temporaryPath('vstudy-i18n');await mkdir(evidence,{recursive:true});
async function assertAstryxLocale(page, language) {
 const locale = { en: 'en', ja: 'ja-JP', 'zh-Hant': 'zh-TW' }[language];
 const catalog = JSON.parse(await readFile(`node_modules/@astryxdesign/core/locales/${locale}.json`, 'utf8'));
 await page.getByTestId('skip-to-content').waitFor({state:'attached'});
 assert.equal(await page.getByTestId('skip-to-content').textContent(), catalog['@astryx.appShell.skipToContent'].defaultMessage);
 assert.ok(await page.getByRole('navigation', {name:catalog['@astryx.sideNav.label'].defaultMessage, exact:true}).count(), 'Astryx navigation follows the app locale');
 return catalog;
}
for(const language of ['en','zh-Hant','ja']) {
 const catalog=JSON.parse(await readFile(`src/shared/locales/${language}/common.json`,'utf8'));
 const directory=await mkdtemp(join(tmpdir(),'vstudy-i18n-'));
 let app;
 try {
  app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:language,VSTUDY_FAKE_PROVIDER:'1'}});
  const page=await app.firstWindow();
  await page.addInitScript(() => { if (localStorage.getItem('vstudy-route')) localStorage.removeItem('vstudy-tabs-v1'); });
 await page.evaluate(()=>{window.localStorage.removeItem('vstudy-tabs-v1');window.localStorage.setItem('vstudy-route',JSON.stringify({view:'workspace'}));}); await page.reload();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(lang=>window.document.documentElement.lang===lang,language);
  await page.getByTestId('bridge-status').waitFor({state:'attached'});
  const astryxCatalog = await assertAstryxLocale(page, language);
  assert.ok((await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.map(i=>i.label))).includes(catalog.file));
  await page.waitForFunction(()=>!window.document.querySelector('[data-testid=import-document]')?.disabled);
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},resolve('e2e/fixtures/reading.md'));
  await page.getByTestId('import-document').click();
  await page.getByTestId('document-markdown').waitFor();
  await page.locator('.aui-composer-input').waitFor();
  await page.locator('.aui-composer-input').waitFor();
  await page.getByRole('button',{name:catalog.open_settings,exact:true}).click();await page.locator('.settings-dialog[open] .settings-tabs [role=tab]').first().click();
  await page.getByTestId('language').click();await page.getByRole('option',{name:language==='en'?'English':language==='ja'?'日本語':'繁體中文',exact:true}).click();
  await page.waitForFunction(lang=>window.document.querySelector('[data-testid=language]')?.dataset.value===lang,language);
  await page.getByRole('button',{name:catalog.close_settings}).click();await page.locator('.settings-dialog').waitFor({state:'detached'});
  for(const width of [720,900,1200]) {
   await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,800),width);
   for(const colorScheme of ['light','dark']) {
    await page.emulateMedia({colorScheme});
    await page.screenshot({path:`${evidence}/${language}-${width}-${colorScheme}-chat.png`,animations:'disabled'});
    assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=window.innerWidth),true,'window has no horizontal overflow');
    if(await page.locator('.workspace-tabs').isVisible())await page.locator('.workspace-tabs button').nth(1).click();await page.locator('[data-slot=model-selector-trigger]').first().click();
    await page.locator('[data-slot=model-selector-search]').waitFor();
    await page.locator('[role=option]').first().waitFor();
    assert.ok(await page.getByRole('button', {name:astryxCatalog['@astryx.popover.close'].defaultMessage, exact:true}).count(), 'Astryx popover close label follows the app locale');
    await page.screenshot({path:`${evidence}/${language}-${width}-${colorScheme}-picker.png`,animations:'disabled'});
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('[data-slot=model-selector-trigger]').first().evaluate(el => el === document.activeElement), 'model popover returns focus to its trigger');
    await page.getByRole('button',{name:catalog.open_settings,exact:true}).click();await page.locator('.settings-dialog[open] .settings-tabs [role=tab]').first().click();
    await page.waitForFunction(()=>{const select=window.document.querySelector('[data-testid=language]');return select&&!select.disabled&&select.getAttribute('aria-disabled')!=='true';});
    assert.equal(await page.getByTestId('language').getAttribute('data-value'),language);
    await page.screenshot({path:`${evidence}/${language}-${width}-${colorScheme}-settings.png`,animations:'disabled'});
    await page.getByRole('button',{name:catalog.close_settings}).click();await page.locator('.settings-dialog').waitFor({state:'detached'});
   }
  }
  // Change language in the same running window, retaining the workspace.
  await page.getByRole('button',{name:catalog.open_settings,exact:true}).click();await page.locator('.settings-dialog[open] .settings-tabs [role=tab]').first().click();
  const next=language==='en'?'ja':language==='ja'?'zh-Hant':'en';await page.getByTestId('language').click();await page.getByRole('option',{name:next==='en'?'English':next==='ja'?'日本語':'繁體中文',exact:true}).click();
  await page.waitForFunction(lang=>window.document.documentElement.lang===lang,next);
  await assertAstryxLocale(page, next);
  assert.deepEqual(errors,[]);console.log(`${language}: live language switch, chat/picker/settings, 720/900/1200 light/dark passed`);
 } finally {await app?.close();await rm(directory,{recursive:true,force:true});}
}
console.log(`Screenshots: ${evidence}`);
