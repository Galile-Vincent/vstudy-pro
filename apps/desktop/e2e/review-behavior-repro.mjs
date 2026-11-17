import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const profile=await mkdtemp(join(tmpdir(),'vstudy-review-behavior-'));
let app;
try {
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${profile}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
 const page=await app.firstWindow(); page.setDefaultTimeout(5000);
 await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,onboardingCompleted:true,welcomeSeen:true});});
 await page.reload(); await page.emulateMedia({reducedMotion:'reduce'});
 const trigger=page.getByRole('button',{name:/Find a conversation/});
 for (const shortcut of ['Meta+k','Control+k']) {
  await trigger.focus(); await page.keyboard.press(shortcut);
  const dialog=page.getByRole('dialog',{name:'History',exact:true}); await dialog.waitFor();
  await dialog.getByRole('searchbox').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Escape');
  await dialog.waitFor({state:'detached'}); await page.waitForTimeout(300);
  console.log(JSON.stringify({probe:'history-focus-return',shortcut,returnedToTrigger:await trigger.evaluate(el=>el===document.activeElement),active:await page.evaluate(()=>({tag:document.activeElement.tagName,label:document.activeElement.getAttribute('aria-label'),text:document.activeElement.textContent.slice(0,90)}))}));
  assert.ok(await trigger.evaluate(el => el === document.activeElement), `${shortcut} restores the finder opener`);
 }
 await page.locator('.shell-sidebar').first().getByRole('button',{name:'Library',exact:true}).click();
 await page.getByRole('button',{name:'New folder',exact:true}).click();
 await page.getByRole('dialog').getByRole('textbox').fill('中文フォルダー'); await page.getByRole('dialog').getByRole('textbox').press('Enter');
 console.log(JSON.stringify({probe:'folder-create-enter',names:await page.evaluate(()=>window.desktop.invoke('library:tree',{}).then(rows=>rows.map(r=>r.name)))}));
 await page.getByRole('button',{name:'Folder options: 中文フォルダー',exact:true}).click();
 await page.getByRole('dialog').getByRole('textbox').fill('改名日本語'); await page.getByRole('dialog').getByRole('textbox').press('Enter');
 console.log(JSON.stringify({probe:'folder-rename-enter',names:await page.evaluate(()=>window.desktop.invoke('library:tree',{}).then(rows=>rows.map(r=>r.name)))}));
 await page.keyboard.press('Meta+b'); console.log('sidebar after Meta+b',await page.locator('[data-sidebar]').getAttribute('data-sidebar'));
 await page.keyboard.press('Control+b'); console.log('sidebar after Control+b',await page.locator('[data-sidebar]').getAttribute('data-sidebar'));
} finally {await app?.close(); await rm(profile,{recursive:true,force:true});}
