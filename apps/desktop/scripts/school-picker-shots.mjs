/** Real Electron picker capture. Set UI_SHOTS_OUT and UI_SHOTS_PHASE=before|after. Uses only a disposable seeded profile. */
import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { seedArtCourses } from '../e2e/fixtures/art-courses.mjs';

const out = process.env.UI_SHOTS_OUT;
const phase = process.env.UI_SHOTS_PHASE ?? 'after';
assert(out, 'Set UI_SHOTS_OUT');
await mkdir(out, {recursive:true});
const directory = await mkdtemp(join(tmpdir(),'vstudy-school-picker-'));
let app;
try {
  app = await electron.launch({args:[resolve(import.meta.dirname,'..'),`--user-data-dir=${directory}`,'--force-device-scale-factor=1'],env:{...process.env,ELECTRON_RUN_AS_NODE:'',HOME:directory,XDG_CONFIG_HOME:directory,VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page.emulateMedia({reducedMotion:'reduce'});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await page.waitForFunction(()=>!!window.desktop?.invoke);
  await seedArtCourses(app,Date.now());
  for (const mode of ['light','dark']) {
    await page.evaluate(async mode=>{
      const settings=await window.desktop.invoke('settings:get',{});
      await window.desktop.invoke('settings:set',{...settings,themeId:'vstudy',colorScheme:mode,onboardingCompleted:true,welcomeSeen:true,language:'en'});
      window.localStorage.removeItem('vstudy-tabs-v1');
      window.localStorage.setItem('vstudy-route',JSON.stringify({view:'courses'}));
      window.localStorage.setItem('vstudy-onboarding-v1',JSON.stringify({version:1,status:'completed',done:[],dismissed:['courses']}));
    },mode);
    await page.reload();
    await page.getByRole('button',{name:/^Connect (another )?school$/}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByRole('combobox').waitFor();
    await dialog.getByRole('option').last().waitFor();
    await page.evaluate(()=>window.document.fonts.ready);
    await page.mouse.move(1400,880);
    await page.screenshot({path:join(out,`${phase}-${mode}.png`)});
    console.log(mode,await dialog.boundingBox());
    if(phase==='after') {
      const input=dialog.getByRole('combobox');
      await input.press('End');
      assert.equal(await input.getAttribute('aria-activedescendant'),`moodle-school-${await dialog.getByRole('option').count()-1}`);
      await page.screenshot({path:join(out,`after-${mode}-scrolled.png`)});
      await input.press('Escape');
      await input.fill('new-school.example/moodle');
      await dialog.getByRole('button',{name:'Find my school',exact:true}).waitFor();
      await input.fill('zzzz-no-matching-school');
      await page.screenshot({path:join(out,`after-${mode}-no-results.png`)});
      await input.fill('Taiwan');
      assert((await dialog.getByRole('option').count())>0);
      await page.screenshot({path:join(out,`after-${mode}-searching.png`)});
      if(mode==='light') {
        await app.evaluate(({ipcMain})=>{
          const original=ipcMain._invokeHandlers.get('moodle:check-site');
          if(!original)throw Error('Missing school check handler');
          ipcMain.removeHandler('moodle:check-site');
          ipcMain.handle('moodle:check-site',()=>new Promise(()=>{}));
        });
        await dialog.getByRole('option').first().click();
        await dialog.locator('small[role=status]').filter({hasText:'Checking your school'}).waitFor();
        await page.screenshot({path:join(out,'after-light-checking.png')});
      }
    }
    if(phase==='after' && mode==='dark') {
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(720,600));
      await page.waitForFunction(()=>window.innerWidth===720 && window.innerHeight===600);
      await dialog.locator('summary').click();
      const bounds=await dialog.boundingBox();
      console.log('small viewport',bounds);
      assert(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=720 && bounds.y+bounds.height<=600, 'Dialog fits a small viewport');
      await dialog.getByRole('button',{name:'Add by URL',exact:true}).click();
      assert(await dialog.getByRole('combobox').evaluate(el=>el===window.document.activeElement), 'Add by URL focuses search');
    }
    await page.keyboard.press('Escape');
  }
} finally {
  try {await app?.close();} finally {await rm(directory,{recursive:true,force:true});}
}
