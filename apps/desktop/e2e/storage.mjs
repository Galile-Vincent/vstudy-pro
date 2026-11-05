/** Verify storage controls in one isolated Electron instance, including a real restart restore. */
import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const evidence=resolve('../../docs/evidence/storage');await mkdir(evidence,{recursive:true});
const root=await mkdtemp(join(tmpdir(),'vstudy-storage-e2e-')),userData=join(root,'user-data'),zip=join(root,'backup.zip');
let app;let logs='';const results=[];
async function launch(){
  const otherElectron=execFileSync('ps',['-axo','comm'],{encoding:'utf8'}).split('\n').some(line=>line.includes('/electron/dist/') && line.endsWith('/MacOS/Electron'));
  assert.equal(otherElectron,false,'Another Electron test is running. Retry after it exits.');
  app=await electron.launch({args:[resolve('.'),`--user-data-dir=${userData}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  app.process().stdout?.on('data',chunk=>{logs+=chunk;});app.process().stderr?.on('data',chunk=>{logs+=chunk;});
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForFunction(()=>Boolean(window.desktop));return page;
}
async function openSettings(page,language){
  await page.evaluate(async language=>{const settings=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...settings,language,onboardingCompleted:true,welcomeSeen:true});window.localStorage.setItem('vstudy-route',JSON.stringify({view:'workspace'}));},language);
  await page.reload();await page.getByTestId('bridge-status').waitFor({state:'attached'});
  await page.evaluate(()=>window.dispatchEvent(new Event('vstudy:open-settings')));
  const strings=JSON.parse(await readFile(`src/shared/locales/${language}/storage.json`,'utf8'));
  await page.getByRole('tab',{name:strings.title,exact:true}).click();await page.getByTestId('storage-settings').locator('output').first().waitFor();return strings;
}
try {
  let page=await launch();
  await app.evaluate(({dialog},zip)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:zip});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[zip]});dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});},zip);
  const imported=await page.evaluate(()=>window.desktop.invoke('documents:importSample',{language:'en'}));
  await page.waitForFunction(async id=>(await window.desktop.invoke('documents:get',{documentId:id}))?.status==='ready',imported.id);
  await writeFile(join(evidence,'import.json'),JSON.stringify(imported,null,2));
  const original=await page.evaluate(id=>window.desktop.invoke('documents:read',{documentId:id}),imported.id);
  for(const language of ['en','zh-Hant','ja'])for(const theme of ['light','dark']){
    await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1200,900));
    await openSettings(page,language);
    const panel=page.getByTestId('storage-settings');assert.equal(await panel.locator('output').count(),7);
    const axe=await new AxeBuilder({page}).setLegacyMode(true).include('.settings-dialog').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    results.push({language,theme,violations:axe.violations});
    await page.screenshot({path:join(evidence,`${language}-${theme}.png`),animations:'disabled'});await page.keyboard.press('Escape');
  }
  const strings=await openSettings(page,'en');const panel=page.getByTestId('storage-settings');
  await panel.getByRole('button',{name:strings.integrity,exact:true}).click();await panel.getByRole('status').filter({hasText:strings.integrity_ok}).waitFor();
  await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,chatSide:'right'});});
  await panel.getByRole('button',{name:strings.export,exact:true}).click();await panel.getByRole('status').filter({hasText:strings.done}).waitFor();
  const archiveCheck=execFileSync('/usr/bin/unzip',['-t',zip],{encoding:'utf8'});assert.ok(archiveCheck.includes('No errors detected'));
  await panel.getByRole('button',{name:strings.clear_converted,exact:true}).click();
  await page.waitForFunction(async id=>(await window.desktop.invoke('documents:get',{documentId:id}))?.status==='failed',imported.id);
  await panel.getByRole('button',{name:strings.clear_cache,exact:true}).click();await panel.getByRole('status').filter({hasText:strings.done}).waitFor();
  await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,chatSide:'left'});});
  await panel.getByRole('button',{name:strings.restore,exact:true}).click();await panel.getByRole('status').filter({hasText:strings.scheduled}).waitFor();
  await page.screenshot({path:join(evidence,'restore-validated.png'),animations:'disabled'});
  await assert.rejects(page.evaluate(()=>window.desktop.invoke('settings:get',{})),/storage.busy/);
  await app.close();app=undefined;
  page=await launch();
  assert.equal((await page.evaluate(()=>window.desktop.invoke('settings:get',{}))).chatSide,'right');
  assert.equal(await page.evaluate(id=>window.desktop.invoke('documents:read',{documentId:id}),imported.id),original);
  const restored=await page.evaluate(()=>window.desktop.invoke('storage:integrity',{}));assert.equal(restored.ok,true);
  await openSettings(page,'en');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(720,900));
  await page.screenshot({path:join(evidence,'en-narrow-restored.png'),animations:'disabled'});
  assert.deepEqual(results.flatMap(result=>result.violations),[]);
  await writeFile(join(evidence,'electron.json'),JSON.stringify({ok:true,locales:results,backupZipValid:true,restoreAfterRestart:true,originalPreserved:true,integrity:restored},null,2));
} catch(error){await writeFile(join(evidence,'failure.txt'),String(error));const window=app?.windows()[0];if(window)await window.screenshot({path:join(evidence,'failure.png')}).catch(()=>{});throw error;
} finally {await app?.close();await writeFile(join(evidence,'runtime.log'),logs);await rm(root,{recursive:true,force:true,maxRetries:3});}
