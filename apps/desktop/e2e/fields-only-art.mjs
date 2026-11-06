/** Fields-only art acceptance uses the original striped cover fixtures as regression inputs. */
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { builtinThemes } from '../src/shared/themes/index.ts';
import { seedArtCourses } from './fixtures/art-courses.mjs';

const evidence=resolve('../../docs/evidence/art/clean/fields-only');
const directory=await mkdtemp(join(tmpdir(),'vstudy-fields-only-'));
const results=[],errors=[];
let app;
try {
  await mkdir(evidence,{recursive:true});
  app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  const page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,900));
  const fixture=await seedArtCourses(app);
  const patterned=fixture.details.filter(d=>d.course.imageUrl);
  assert.deepEqual(patterned.map(d=>d.course.identity.code),['CS305','SCI108']);
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},resolve('e2e/fixtures/reading.md'));
  const doc=await page.evaluate(()=>window.desktop.invoke('documents:import',{}));
  await page.waitForFunction(async id=>(await window.desktop.invoke('documents:list',{})).find(d=>d.id===id)?.status==='ready',doc.id);
  await page.evaluate(id=>window.desktop.invoke('documents:read',{documentId:id}),doc.id);
  await page.emulateMedia({reducedMotion:'reduce'});
  const route=async(themeId,colorScheme,view='courses',courseId)=>{
    await page.evaluate(async({themeId,colorScheme,view,courseId})=>{
      const settings=await window.desktop.invoke('settings:get',{});
      await window.desktop.invoke('settings:set',{...settings,themeId,colorScheme,language:'en',uiScale:100,onboardingCompleted:true,welcomeSeen:true});
      window.localStorage.setItem('vstudy-route',JSON.stringify({view,courseId}));
      window.localStorage.setItem('library-grid','true');
      window.localStorage.setItem('vstudy-onboarding-v1',JSON.stringify({version:1,step:'start',goal:'school',status:'completed',done:['setup'],dismissed:['workspace','courses']}));
    },{themeId,colorScheme,view,courseId});
    await page.reload();
    await page.locator(view==='courses'?(courseId?'.moodle-hero':'.moodle-course-card'):'.art-reader-cover').first().waitFor();
  };
  const audit=async(selector,flat,curve)=>{
    const styles=await page.locator(selector).evaluateAll(elements=>elements.map(el=>{
      const style=window.getComputedStyle(el),before=window.getComputedStyle(el,'::before');
      return {classes:el.className,children:Array.from(el.children,child=>({tag:child.tagName,class:child.className})),background:style.backgroundImage,curveDisplay:before.display,curveBackground:before.backgroundImage};
    }));
    assert.ok(styles.length>0);
    for(const art of styles) {
      assert.equal(/(?:img|svg|canvas|picture|pattern)/i.test(art.children.map(c=>c.tag).join(' ')),false,'No externally supplied image or pattern layer');
      assert.equal(/(?:hatch|stripe|grid|ring|grain|noise|orbit|contour|pattern)/i.test(art.classes+' '+art.children.map(c=>c.class).join(' ')),false);
      assert.equal((art.background.match(/radial-gradient\(/g)??[]).length,flat?0:2);
      assert.equal(/(?:repeating-|conic-gradient|url\()/i.test(art.background),false);
      if(flat || !curve) assert.equal(art.curveDisplay,'none','Cards and high contrast have no curve');
      else assert.match(art.curveBackground,/0\.06/,'Hero curve stays at six percent');
    }
    return styles;
  };
  for(const theme of builtinThemes) for(const scheme of ['light','dark']) {
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
    await route(theme.id,scheme);
    const grid=page.locator('.moodle-grid').first();
    await grid.evaluate(el=>el.scrollIntoView({block:'start'}));
    assert.equal(await page.locator('.moodle-course-card img, .moodle-course-card .soft-art').count(),0);
    const backgrounds=await page.locator('.moodle-course-card').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundImage));
    assert.ok(backgrounds.every(value=>value==='none'));
    for(const view of ['home','library']) {
      await route(theme.id,scheme,view);
      await audit('.art-reader-cover',theme.id==='contrast',false);
      if(theme.id==='ocean') await page.screenshot({path:join(evidence,`${theme.id}-${scheme}-${view}.png`),animations:'disabled'});
    }
    results.push({theme:theme.id,scheme,backgrounds,courses:patterned.map(d=>d.course.identity.code),documentViews:['home','library']});
  }
  await app.evaluate(({ipcMain})=>{
    ipcMain.removeHandler('moodle:overview');
    ipcMain.handle('moodle:overview',()=>({accounts:[],courses:[],upcoming:[],summaries:[],unreadNotifications:0}));
  });
  for(const theme of builtinThemes) for(const scheme of ['light','dark']) {
    await page.evaluate(async({themeId,colorScheme})=>{
      const s=await window.desktop.invoke('settings:get',{});
      await window.desktop.invoke('settings:set',{...s,themeId,colorScheme});
      window.localStorage.setItem('vstudy-route',JSON.stringify({view:'courses'}));
    },{themeId:theme.id,colorScheme:scheme});
    await page.reload();
    await page.locator('.moodle-empty').waitFor();
    const style=await page.locator('.moodle-empty').evaluate(el=>({background:window.getComputedStyle(el).backgroundImage,layers:el.querySelectorAll('img,image,canvas,pattern,[data-pattern],[data-motif],[class*=art-pattern],[class*=art-grain],[class*=art-reader-orbit]').length}));
    assert.equal(/(?:repeating-|conic-gradient|url\()/i.test(style.background),false);
    assert.equal(style.layers,0);
    if(theme.id==='contrast') assert.equal(style.background,'none');
    if(theme.id==='ocean') await page.screenshot({path:join(evidence,`${theme.id}-${scheme}-empty.png`),animations:'disabled'});
  }
  assert.deepEqual(errors,[]);
  await writeFile(join(evidence,'verification.json'),JSON.stringify({result:'PASS',artifact:'Built Electron with fictional course snapshots. Courses use flat text rows. Document art remains checked in Home and Library.',results,errors},null,2)+'\n');
  console.log('PASS. Flat course rows and Home/Library art across all themes.');
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
