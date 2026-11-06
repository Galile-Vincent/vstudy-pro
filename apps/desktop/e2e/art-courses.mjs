/** Capture real Electron Courses surfaces with reusable public snapshots and isolated settings. Run after pnpm build. */
import { _electron as electron, chromium } from 'playwright';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { seedArtCourses } from './fixtures/art-courses.mjs';

const phase = process.env.ART_PHASE ?? 'final';
const evidence = resolve('../../docs/evidence/art/courses',phase);
await mkdir(evidence,{recursive:true});
if (phase === 'before') {
  const browser = await chromium.launch({channel:"chrome"});
  try {
    const page = await browser.newPage({viewport:{width:1200,height:650},deviceScaleFactor:1});
    await page.goto('file:///tmp/vstudy-courses-prototypes.html');
    await page.screenshot({path:join(evidence,'prototypes.png'),fullPage:true});
  } finally {await browser.close();}
}
const directory=await mkdtemp(join(tmpdir(),'vstudy-art-courses-'));
let app,server;
const results=[],errors=[];
try {
  if(phase==='pseudo') {
    server=await createServer({configFile:false,root:resolve('src/renderer'),resolve:{alias:{'@':resolve('src/renderer')}},html:{cspNonce:'vstudy-development'},plugins:[react(),tailwind()],server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd()]}}});
    await server.listen();
  }
  app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1',...(server?{ELECTRON_RENDERER_URL:server.resolvedUrls.local[0]}:{})}});
  const page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  const fixture=await seedArtCourses(app);
  await page.evaluate(()=>window.desktop.invoke('providers:configure',{kind:'api',id:'anthropic-api',enabled:true}));
  await page.emulateMedia({reducedMotion:'reduce'});
  const route=async(themeId,colorScheme,courseId,language='en',uiScale=100)=>{
    await page.evaluate(async ({themeId,colorScheme,courseId,language,uiScale})=>{
      const settings=await window.desktop.invoke('settings:get',{});
      await window.desktop.invoke('settings:set',{...settings,themeId,colorScheme,language:language==='en-XA'?'en':language,uiScale,onboardingCompleted:true,welcomeSeen:true});
      window.localStorage.setItem('vstudy-route',JSON.stringify({view:'courses',courseId}));
      window.localStorage.setItem('vstudy-onboarding-v1',JSON.stringify({version:1,step:'start',goal:'school',status:'completed',done:['setup'],dismissed:['courses']}));
    },{themeId,colorScheme,courseId,language,uiScale});
    await page.reload();
    if(language==='en-XA') await page.evaluate(async path=>{const {i18n}=await import(path);await i18n.changeLanguage('en-XA');window.document.documentElement.lang='en-XA';},'/@fs'+resolve('src/shared/i18n.ts'));
    if(language==='en-XA') await page.waitForFunction(()=>window.document.querySelector('.moodle-header')?.textContent.includes('［'));
    await page.locator(courseId?'.moodle-hero':'.moodle-course-card').first().waitFor();
    await page.locator('.moodle-page').evaluate(el=>{el.scrollTop=0;});
    await page.screenshot({path:join(evidence,`${themeId}-${colorScheme}-${courseId?'course':'home'}-${language}-${uiScale}-${size[0]}.png`),animations:'disabled'});
    if(!courseId && size[0]<=1000) assert.ok((await page.locator('.moodle-account').first().boundingBox()).height<220,'Account chip remains compact at narrow widths');
    assert.equal(await page.locator('.moodle-page').evaluate(el=>el.scrollWidth>el.clientWidth),false,'Page has horizontal overflow');
  };
  let size=[1440,900];
  const resize=async next=>{size=next;await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),size);};
  const themes=phase==='pseudo'?[]:phase==='final'?['vstudy','ocean','grove','ember','iris','rose','slate','paper','contrast']:['vstudy','ocean'];
  for (const dimensions of phase==='before'?[[1200,768],[1440,900]]:[[1440,900]]) {
    await resize(dimensions);
    for (const theme of themes) for (const scheme of ['light','dark']) {
      await route(theme,scheme);
      assert.equal(await page.locator('.moodle-course-card').count(),7);
      if(phase==='final') {
        const axe=await new AxeBuilder({page}).setLegacyMode(true).include('.moodle-page').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        assert.deepEqual(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],`${theme}/${scheme} home accessibility`);
      }
      await route(theme,scheme,fixture.details[0].course.id);
      if(phase!=='before') {
        const axe=await new AxeBuilder({page}).setLegacyMode(true).include('.moodle-page').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),[],`${theme}/${scheme} course accessibility`);
      }
      results.push(`${theme}/${scheme}/${dimensions.join('x')} home and course captured.`);
    }
  }
  if(phase!=='before') {
    if(phase!=='pseudo') {
    await route('ocean','dark',fixture.details[0].course.id);
    for(const tab of ['deadlines','announcements','grades','files','notifications']) {
      await page.getByRole('tab',{name:tab[0].toUpperCase()+tab.slice(1),exact:true}).click();
      await page.screenshot({path:join(evidence,`${tab}.png`)});
    }
    await page.getByRole('tab',{name:'Content',exact:true}).click();
    await page.locator('.moodle-module').first().click();
    await page.locator('[data-slot=sheet-content]').waitFor();
    await page.screenshot({path:join(evidence,'module-sheet.png')});
    await page.keyboard.press('Escape');
    await page.getByRole('tab',{name:'Content',exact:true}).focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>window.document.querySelector('.moodle-tabs [role=tab][aria-selected=true]')?.textContent==='Deadlines');
    assert.equal(await page.getByRole('tab',{name:'Deadlines',exact:true}).getAttribute('aria-selected'),'true');
    await page.keyboard.press('Home');
    await page.locator('.moodle-chat-button').focus();
    await page.keyboard.press('Enter');
    await page.locator('.moodle-assistant-panel:not([hidden])').waitFor();
    await page.locator('.moodle-course-chat .aui-composer-input').waitFor();
    await page.screenshot({path:join(evidence,'assistant.png')});
    const composer=await page.locator('.moodle-course-chat .aui-composer-input').boundingBox();
    const panel=await page.locator('.moodle-assistant-panel').boundingBox();
    assert.ok(composer.y>=panel.y && composer.y+composer.height<=panel.y+panel.height,'Composer fully inside assistant panel');

    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.moodle-chat-button').evaluate(el=>el===window.document.activeElement),true);
    }
    for (const [theme,language,dimensions,scale] of [['ocean','zh-Hant',[1200,768],100],['grove','ja',[1600,1000],100],['iris',phase==='pseudo'?'en-XA':'en',[720,768],125]]) {
      await resize(dimensions);
      for(const scheme of ['light','dark']) {
        await route(theme,scheme,undefined,language,scale);
        await page.locator('.moodle-course-card h3 button').first().focus();
        await page.keyboard.press('Enter');
        await page.locator('.moodle-hero').waitFor();
        await route(theme,scheme,fixture.details[0].course.id,language,scale);
      }
    }
    if(phase==='final') {
      await resize([1440,900]);
      await route('ocean','light');
      await page.locator('.moodle-grid').first().evaluate(el=>el.scrollIntoView({block:'start'}));
      await page.screenshot({path:join(evidence,'course-grid.png')});
      await page.locator('.moodle-page').evaluate(el=>{el.scrollTop=0;});
      await page.locator('.planner-entry').click();
      await page.locator('.planner').waitFor();
      await page.screenshot({path:join(evidence,'planner.png')});
      await route('ocean','light');
      await page.getByRole('button',{name:'Connect school',exact:true}).first().click();
      await page.locator('.moodle-connect').waitFor();
      await page.screenshot({path:join(evidence,'connect.png')});
      await page.keyboard.press('Escape');
      await route('ocean','light',fixture.details[0].course.id);
      await page.getByRole('tab',{name:'Announcements',exact:true}).click();
      await page.locator('.moodle-announcement').first().click();
      await page.locator('[data-slot=sheet-content]').waitFor();
      await page.screenshot({path:join(evidence,'announcement-sheet.png')});
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'Open in Moodle',exact:true}).first().click();
      await page.locator('.moodle-webview-pane').waitFor();
      await page.screenshot({path:join(evidence,'webview-toolbar.png')});
      await page.keyboard.press('Escape');
      await route('vstudy','light');
      for(const mode of ['loading','empty','error']) {
        await app.evaluate(({ipcMain},{mode,overview})=>{
          ipcMain.removeHandler('moodle:overview');
          ipcMain.handle('moodle:overview',async()=>{
            if(mode==='error') throw new Error('Fixture offline');
            if(mode==='loading') {await new Promise(resolve=>globalThis.setTimeout(resolve,2500));return overview;}
            return {accounts:[],courses:[],upcoming:[],summaries:[],unreadNotifications:0};
          });
        },{mode,overview:fixture.overview});
        await page.reload();
        await page.locator(mode==='loading'?'.moodle-skeleton':mode==='empty'?'.moodle-empty':'.moodle-banner[role=alert]').first().waitFor();
        await page.screenshot({path:join(evidence,`${mode}.png`)});
        if(mode==='loading') await page.locator('.moodle-course-card').first().waitFor();
      }
      results.push('Course grid, planner, connection dialog, announcement sheet, webview toolbar, loading, empty and offline error states captured. Webview content needs a live authenticated school.');
    }
    results.push(phase==='pseudo'?'en-XA at 720×768 and 125% scale, light/dark, home/course, no horizontal page overflow.':'All tab surfaces, module sheet, assistant Escape/focus return, keyboard course opening, zh-Hant/ja and 125% scale checked. Pseudo-localization runs separately with ART_PHASE=pseudo.');
  }
  assert.deepEqual(errors,[]);
  await writeFile(join(evidence,'verification.json'),JSON.stringify({phase,artifact:phase==='pseudo'?'Real Electron with a Vite renderer and fixture Moodle read handlers. No school connection.':'Real built Electron with fixture Moodle read handlers. No school connection.',results,errors},null,2)+'\n');
  console.log(results.join('\n'));
} finally {await app?.close();await server?.close();await rm(directory,{recursive:true,force:true});}
