/** Captures the branded production app and asserts borderless headers at rest and after scroll. */
import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const evidence=resolve('../../docs/evidence/brand/app');
const profile=await mkdtemp(join(tmpdir(),'vstudy-brand-'));
const report=[];
let app;
try {
  await mkdir(evidence,{recursive:true});
  app=await electron.launch({executablePath:process.env.VSTUDY_EXECUTABLE,args:[resolve('.'),`--user-data-dir=${profile}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  const page=await app.firstWindow();
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const doc=await page.evaluate(()=>window.desktop.invoke('documents:importSample',{language:'en'}));
  await page.waitForFunction(async id=>(await window.desktop.invoke('documents:list',{})).find(d=>d.id===id)?.status==='ready',doc.id);
  if (!process.env.BRAND_EXTRA_ONLY) for(const themeId of ['vstudy','ocean','high-contrast'])for(const colorScheme of ['light','dark'])for(const language of ['en','zh-Hant','ja']) {
    const size=language==='en'?[1440,900]:language==='ja'?[720,600]:[1200,768];
    await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),size);
    for(const view of ['home','library','workspace','welcome']) {
      await page.evaluate(async({view,id,themeId,colorScheme,language})=>{
        const settings=await window.desktop.invoke('settings:get',{});
        await window.desktop.invoke('settings:set',{...settings,themeId,colorScheme,language,uiScale:language==='ja'?125:100,onboardingCompleted:true,welcomeSeen:true});
        window.localStorage.setItem('vstudy-route',JSON.stringify({view,documentId:id}));
        window.localStorage.setItem('vstudy-onboarding-v1',JSON.stringify({version:1,step:'start',goal:'school',status:'completed',done:['setup'],dismissed:['home','library','workspace']}));
      },{view,id:doc.id,themeId,colorScheme,language});
      await page.reload();
      if(view==='welcome') await page.locator('#welcome-entry').click();
      await page.locator(view==='home'?'.home-greeting':view==='library'?'.library-view':view==='welcome'?'.w-hero':'.reading-pane').waitFor();
      await page.waitForFunction(()=>[...window.document.querySelectorAll('.vstudy-brand img')].every(img=>img.complete&&img.naturalWidth));
      const selector=view==='workspace'?'.app-header':view==='welcome'?'.w-header':'.shell-topbar';
      const header=page.locator(selector);
      for(const scrolled of [false,true]) {
        await page.evaluate(scroll=>window.document.querySelectorAll('.home-page,.library-results,.reading-scroll,.welcome').forEach(el=>{el.scrollTop=scroll?400:0;el.dataset.scrolled=String(scroll);}),scrolled);
        const style=await header.evaluate(el=>({border:window.getComputedStyle(el).borderBottomWidth,shadow:window.getComputedStyle(el).boxShadow,after:window.getComputedStyle(el,'::after').content}));
        assert.deepEqual(style,{border:'0px',shadow:'none',after:'none'});
      }
      if(language==='en' && themeId==='vstudy') await page.screenshot({path:join(evidence,`${themeId}-${colorScheme}-${language}-${view}-scrolled.png`),animations:'disabled'});
      await page.evaluate(()=>window.document.querySelectorAll('.home-page,.library-results,.reading-scroll,.welcome').forEach(el=>{el.scrollTop=0;el.dataset.scrolled='false';}));
      await page.screenshot({path:join(evidence,`${themeId}-${colorScheme}-${language}-${view}.png`),animations:'disabled'});
      if(language==='en' && themeId==='vstudy') {
        const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).setLegacyMode(true).analyze();
        report.push({themeId,colorScheme,language,view,axe:axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))});
      }
    }
  }
  await page.evaluate(async()=>{
    const settings=await window.desktop.invoke('settings:get',{});
    await window.desktop.invoke('settings:set',{...settings,onboardingCompleted:true,welcomeSeen:true,language:'en',uiScale:100,themeId:'vstudy',colorScheme:'light'});
    window.localStorage.setItem('vstudy-route',JSON.stringify({view:'home'}));
  });
  await page.reload();
  await page.locator('.home-greeting').waitFor();
  await page.evaluate(()=>window.dispatchEvent(new window.Event('vstudy:open-settings')));
  await page.getByRole('tab',{name:'Appearance',exact:true}).click();
  for(const scrolled of [false,true]) {
    await page.locator('.settings-pane[data-state=active]').evaluate((el,scroll)=>{el.scrollTop=scroll?500:0;el.dataset.scrolled=String(scroll);},scrolled);
    assert.deepEqual(await page.locator('.settings-header').evaluate(el=>({border:window.getComputedStyle(el).borderBottomWidth,shadow:window.getComputedStyle(el).boxShadow,after:window.getComputedStyle(el,'::after').content})),{border:'0px',shadow:'none',after:'none'});
  }
  await page.screenshot({path:join(evidence,'settings.png'),animations:'disabled'});
  await page.keyboard.press('Escape');
  await page.evaluate(()=>window.dispatchEvent(new window.CustomEvent('vstudy:learning-help',{detail:'setup'})));
  await page.locator('.onboarding .vstudy-lockup').waitFor();
  await page.waitForFunction(()=>[...window.document.querySelectorAll('.onboarding .vstudy-brand img')].every(img=>img.complete&&img.naturalWidth));
  await page.screenshot({path:join(evidence,'onboarding.png'),animations:'disabled'});
  const onboardingAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).setLegacyMode(true).analyze();
  report.push({view:'onboarding',axe:onboardingAxe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))});
  assert.deepEqual(errors,[]);
  await writeFile(join(evidence,process.env.BRAND_EXTRA_ONLY?'extra-results.json':'results.json'),JSON.stringify({errors,headers:'No border, shadow, or after pseudo-element before and after scroll.',checks:report},null,2)+'\n');
  assert.deepEqual(report.flatMap(item=>item.axe),[]);
  console.log(JSON.stringify({screenshots:process.env.BRAND_EXTRA_ONLY?2:82,errors,axe:report},null,2));
} finally {await app?.close();await rm(profile,{recursive:true,force:true});}
