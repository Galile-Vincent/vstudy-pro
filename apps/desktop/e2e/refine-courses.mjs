/** Courses art refinement captures. Reuse public Moodle snapshots in one isolated built Electron instance. */
import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { seedArtCourses } from './fixtures/art-courses.mjs';

const phase=process.env.REFINE_PHASE ?? 'final';
const evidence=resolve('../../docs/evidence/art/courses/refine',phase);
const directory=await mkdtemp(join(tmpdir(),'vstudy-courses-refine-'));
await mkdir(evidence,{recursive:true});
let app;
const results=[],errors=[];
try {
  app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  const page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  const fixture=await seedArtCourses(app);
  await page.emulateMedia({reducedMotion:'reduce'});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,900));
  const route=async(themeId,colorScheme,courseId)=>{
    await page.evaluate(async({themeId,colorScheme,courseId})=>{
      const settings=await window.desktop.invoke('settings:get',{});
      await window.desktop.invoke('settings:set',{...settings,themeId,colorScheme,language:'en',uiScale:100,onboardingCompleted:true,welcomeSeen:true});
      window.localStorage.setItem('vstudy-route',JSON.stringify({view:'courses',courseId}));
      window.localStorage.setItem('vstudy-onboarding-v1',JSON.stringify({version:1,step:'start',goal:'school',status:'completed',done:['setup'],dismissed:['courses']}));
    },{themeId,colorScheme,courseId});
    await page.reload();
    await page.locator(courseId?'.moodle-hero':'.moodle-course-card').first().waitFor();
    await page.locator('.moodle-page').evaluate(el=>{el.scrollTop=0;});
  };
  const shot=async name=>page.screenshot({path:join(evidence,`${name}.png`),animations:'disabled'});
  for(const themeId of phase==='final'?['vstudy','ocean','grove','ember','iris','rose','slate','paper','contrast']:['ember','grove']) for(const scheme of ['light','dark']) {
    await route(themeId,scheme);
    await shot(`${themeId}-${scheme}-home`);
    await page.locator('.moodle-grid').first().evaluate(el=>el.scrollIntoView({block:'start'}));
    await shot(`${themeId}-${scheme}-grid`);
    await page.locator('.moodle-course-card').first().screenshot({path:join(evidence,`${themeId}-${scheme}-card.png`),animations:'disabled'});
    if(phase==='final') {
      const axe=await new AxeBuilder({page}).setLegacyMode(true).include('.moodle-page').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),[],`${themeId}/${scheme} home`);
    }
    await page.locator('.moodle-course-card h3 button').first().focus();
    await page.keyboard.press('Enter');
    await page.locator('.moodle-hero').waitFor();
    await page.locator('.moodle-page').evaluate(el=>{el.scrollTop=0;});
    await shot(`${themeId}-${scheme}-course`);
    if(phase==='final') {
      const axe=await new AxeBuilder({page}).setLegacyMode(true).include('.moodle-page').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),[],`${themeId}/${scheme} course`);
    }
    assert.equal(await page.locator('.moodle-page').evaluate(el=>el.scrollWidth>el.clientWidth),false);
    results.push(`${themeId}/${scheme}. Home, grid, card close-up, and course hero. Keyboard course opening. No horizontal overflow.`);
  }
  if(phase==='final') {
    for(const size of [[1200,768],[720,768]]) {
      await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),size);
      for(const scheme of ['light','dark']) {
        await route('ember',scheme);
        await shot(`ember-${scheme}-home-${size[0]}`);
        await route('grove',scheme,fixture.details[0].course.id);
        await shot(`grove-${scheme}-course-${size[0]}`);
        assert.equal(await page.locator('.moodle-page').evaluate(el=>el.scrollWidth>el.clientWidth),false);
      }
    }
  }
  assert.deepEqual(errors,[]);
  await writeFile(join(evidence,'verification.json'),JSON.stringify({phase,artifact:'Built Electron with reusable public Moodle fixture. No school network.',results,errors},null,2)+'\n');
  console.log(results.join('\n'));
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
