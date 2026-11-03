import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const output='/tmp/vstudy-final/screens';await mkdir(output,{recursive:true});
const directory=await mkdtemp(join(tmpdir(),'vstudy-privacy-'));let app;const results=[];
try {
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
 const page=await app.firstWindow();page.setDefaultTimeout(10000);
 for(const language of ['en','zh-Hant','ja']) for(const theme of ['light','dark']) for(const width of [720,1200]) {
  await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,800),width);
  await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  await page.evaluate(async language=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,language,onboardingCompleted:false});window.localStorage.setItem('vstudy-route',JSON.stringify({view:'home'}));},language);await page.reload();
  await page.locator('.onboarding[open]').waitFor();await page.locator('.onboarding footer button').last().click();
  const toggles=page.locator('.onboarding .provider-row input[type=checkbox]');await toggles.first().waitFor();assert.equal(await toggles.count(),3);for(const toggle of await toggles.all())assert.equal(await toggle.isChecked(),false);
  for(const screen of ['onboarding','providers','privacy']) {
   if(screen==='providers') {await page.keyboard.press('Escape');await page.evaluate(()=>window.localStorage.setItem('vstudy-route',JSON.stringify({view:'workspace'})));await page.reload();await page.getByTestId('bridge-status').waitFor({state:'attached'});await page.evaluate(()=>window.dispatchEvent(new window.Event('vstudy:open-settings')));await page.locator('.settings-dialog[open]').waitFor();}
   if(screen==='privacy')await page.locator('.settings-tabs [role=tab]').last().click();
   const findings=await new AxeBuilder({page}).setLegacyMode(true).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']).analyze();
   results.push({language,theme,width,screen,violations:findings.violations});
   await page.screenshot({path:`${output}/${language}-${theme}-${width}-${screen}.png`,animations:'disabled'});
   if(screen==='privacy') { await page.locator('.settings-dialog').evaluate(e => {e.scrollTop=e.scrollHeight;}); await page.screenshot({path:`${output}/${language}-${theme}-${width}-privacy-delete.png`,animations:'disabled'}); }
   if(screen==='privacy')assert.equal(await page.locator('[data-testid=privacy-settings] section').last().getByRole('button').isDisabled(),true);
  }
  await page.keyboard.press('Escape');
 }
} finally {await writeFile(`${output}/axe.json`,JSON.stringify(results,null,2));await app?.close();await rm(directory,{recursive:true,force:true});}
assert.equal(results.length,36);assert.deepEqual(results.filter(r=>r.violations.length),[]);
