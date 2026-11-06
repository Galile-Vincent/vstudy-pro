import { temporaryPath } from '../scripts/platform.mjs';
import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const output=temporaryPath('vstudy-final/screens');await mkdir(output,{recursive:true});
const directory=await mkdtemp(join(tmpdir(),'vstudy-privacy-'));let app;const results=[];
try {
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
 const page=await app.firstWindow();page.setDefaultTimeout(10000);
 await app.evaluate(({dialog,shell})=>{dialog.showMessageBox=async()=>({response:1});shell.openExternal=async()=>{};});
 await page.evaluate(()=>window.desktop.invoke('shell:openExternal',{url:'https://example.invalid/activity-fixture'}));
 for(const language of ['en','zh-Hant','ja']) for(const theme of ['light','dark']) for(const width of [720,1200]) {
  await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,800),width);
  await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  await page.evaluate(async language=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,language,onboardingCompleted:false});window.localStorage.removeItem('vstudy-onboarding-v1');window.localStorage.setItem('vstudy-route',JSON.stringify({view:'home'}));},language);await page.reload();
  await page.locator('.onboarding[data-state=open]').waitFor();await page.locator('.onboarding footer button').last().click();
  assert.equal(await page.locator('.onboarding input[type=password]').count(),0);
  const cliProviders=await page.evaluate(()=>window.desktop.invoke('providers:list',{}).then(providers=>providers.filter(provider=>provider.config.kind==='cli')));
  assert.equal(cliProviders.length,3);assert.ok(cliProviders.every(provider=>!provider.config.enabled));
  for(const screen of ['onboarding','providers','privacy']) {
   if(screen==='providers') {await page.keyboard.press('Escape');await page.evaluate(()=>window.localStorage.setItem('vstudy-route',JSON.stringify({view:'workspace'})));await page.reload();await page.getByTestId('bridge-status').waitFor({state:'attached'});await page.evaluate(()=>window.dispatchEvent(new window.Event('vstudy:open-settings')));await page.locator('.settings-dialog[data-state=open]').waitFor();await page.locator('.settings-tabs [role=tab]').nth(2).click();}
   if(screen==='privacy')await page.locator('.settings-tabs [role=tab]').last().click();
   const findings=await new AxeBuilder({page}).setLegacyMode(true).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']).analyze();
   results.push({language,theme,width,screen,violations:findings.violations});
   await page.screenshot({path:`${output}/${language}-${theme}-${width}-${screen}.png`,animations:'disabled'});
   if(screen==='privacy') { await page.locator('.settings-dialog').evaluate(e => {e.scrollTop=e.scrollHeight;}); await page.screenshot({path:`${output}/${language}-${theme}-${width}-privacy-delete.png`,animations:'disabled'}); }
   if(screen==='privacy')assert.equal(await page.locator('[data-testid=privacy-settings] section').last().getByRole('button').isDisabled(),true);
  }
  await page.keyboard.press('Escape');
 }
 await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,language:'en'});});await page.reload();
 await app.evaluate(({safeStorage})=>{safeStorage.isAsyncEncryptionAvailable=async()=>{await new Promise(resolve=>globalThis.setTimeout(resolve,1000));return false;};});
 await page.evaluate(()=>window.dispatchEvent(new window.Event('vstudy:open-settings')));await page.locator('.settings-dialog[data-state=open]').waitFor();await page.locator('.settings-tabs [role=tab]').nth(2).click();
 const copy=JSON.parse(await readFile('src/shared/locales/en/settings.json','utf8'));
 const keyInput=page.getByLabel('Anthropic API key',{exact:true});const row=page.locator('.provider-row').filter({has:keyInput});
 await keyInput.fill('test-session-only-key');await row.getByRole('button',{name:'Save key',exact:true}).click();
 await row.getByRole('status').filter({hasText:copy.waiting}).waitFor();
 await page.evaluate(()=>window.desktop.invoke('settings:get',{}));
 await page.screenshot({path:`${output}/en-keychain-waiting.png`});
 await row.getByRole('alert').filter({hasText:copy.keychain_failed}).waitFor();await row.getByRole('button',{name:copy.retry,exact:true}).waitFor();
 await page.screenshot({path:`${output}/en-keychain-denied.png`});
 const keychainAxe=await new AxeBuilder({page}).setLegacyMode(true).analyze();await writeFile(`${output}/keychain-axe.json`,JSON.stringify(keychainAxe.violations,null,2));assert.deepEqual(keychainAxe.violations,[]);
 await row.getByRole('button',{name:copy.session_key,exact:true}).click();await page.waitForFunction(()=>window.document.querySelector('input[aria-label="Anthropic API key"]')?.value==='');
 assert.equal((await page.evaluate(()=>window.desktop.invoke('secrets:has',{providerId:'anthropic-api'}))).hasKey,false,'session-only key is never persisted');
} finally {await writeFile(`${output}/axe.json`,JSON.stringify(results,null,2));await app?.close();await rm(directory,{recursive:true,force:true});}
assert.equal(results.length,36);assert.deepEqual(results.filter(r=>r.violations.length),[]);
