/** Capture real built Electron views sequentially in a disposable profile. No student data or remote services. */
import { _electron as electron } from 'playwright';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { seedMarketing, captureTime } from './marketing-seed.mjs';
import { installMarketingMoodle } from './marketing-webview.mjs';

const desktop = resolve(import.meta.dirname,'..');
const root = resolve(desktop,'../..');
const evidence = join(root,'docs/evidence/marketing');
const shots = join(root,'apps/website/src/assets/shots');
const readme = join(root,'docs/assets/readme');
const directory = await mkdtemp(join(tmpdir(),'vstudy-marketing-'));
const themes = (process.env.SHOT_THEMES ?? 'vstudy,ocean,grove,ember,iris,rose').split(',');
const modes = (process.env.SHOT_MODES ?? 'light,dark').split(',');
const only = process.env.SHOT_ONLY?.split(',');
const aliases = {'courses-home':'courses','course-page':'course','planner-today':'planner','reader-chat-with-answer':'reader','history-search':'history',library:'library',home:'home','themes-settings':'themes','moodle-webview':'webview','storage-settings':'storage','onboarding-welcome':'onboarding'};
const previous = only ? await readFile(join(evidence,'manifest.json'),'utf8').then(JSON.parse).then(data=>data.shots).catch(error=>{if(error.code==='ENOENT') return [];throw error;}) : [];
const manifest = [], errors = [];
let app, moodle;
try {
  for (const dir of [evidence,shots,readme,join(evidence,'raw')]) await mkdir(dir,{recursive:true});
  app = await electron.launch({args:[desktop,`--user-data-dir=${directory}`,'--force-device-scale-factor=2'],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  const page = await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await page.clock.setFixedTime(captureTime);
  await page.emulateMedia({reducedMotion:'reduce'});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  const {fixture,documents,call} = await seedMarketing(app,page,directory);
  moodle = await installMarketingMoodle(app,directory,desktop,fixture);
  const go = async (route,selector) => {
    await page.evaluate(route=>window.localStorage.setItem('vstudy-route',JSON.stringify(route)),route);
    await page.reload();
    await page.locator(selector).first().waitFor();
    await page.evaluate(()=>window.document.fonts.ready);
  };
  const settings = async tab => {
    await go({view:'home'},'.home-greeting');
    await page.evaluate(tab=>window.dispatchEvent(new window.CustomEvent('vstudy:open-settings',{detail:{tab}})),tab);
    await page.locator('.settings-dialog').waitFor();
    await page.locator('.settings-dialog').getByRole('heading',{name:'Settings',exact:true}).click();
  };
  const capture = async (name,theme,mode) => {
    await page.addStyleTag({content:'* { scrollbar-width: none !important; caret-color: transparent !important; } ::-webkit-scrollbar { display: none !important; }'});
    await page.mouse.move(1438,898);
    await page.evaluate(()=>{if(window.document.activeElement instanceof window.HTMLElement) window.document.activeElement.blur();});
    await page.evaluate(()=>new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve))));
    const layers = await app.evaluate(async ({BrowserWindow})=>{
      const window=BrowserWindow.getAllWindows()[0];
      return {base:(await window.webContents.capturePage()).toPNG().toString('base64'),children:await Promise.all(window.contentView.children.filter(view=>view.webContents&&view.webContents!==window.webContents).map(async view=>({bounds:view.getBounds(),png:(await view.webContents.capturePage()).toPNG().toString('base64')})))};
    });
    let raw=Buffer.from(layers.base,'base64');
    if(layers.children.length) raw=await sharp(raw).composite(layers.children.map(view=>({input:Buffer.from(view.png,'base64'),left:view.bounds.x*2,top:view.bounds.y*2}))).png().toBuffer();
    const meta = await sharp(raw).metadata();
    assert.equal(meta.width,2880,'Capture must be 1440 CSS pixels at 2x');
    assert.equal(meta.height,1800);
    const key = `${name}-${theme}-${mode}`;
    await writeFile(join(evidence,'raw',`${key}.png`),raw);
    const webp = await sharp(raw).webp({quality:82,effort:6}).toBuffer();
    assert.ok(webp.length<=220_000,`${key} exceeds 220 KB (${webp.length})`);
    await writeFile(join(shots,`${key}.webp`),webp);
    let avifBytes;
    if (sharp.format.heif.output.buffer) {
      const avif=await sharp(raw).avif({quality:50,effort:4}).toBuffer();
      assert.ok(avif.length<=220_000,`${key} AVIF exceeds 220 KB`);
      await writeFile(join(shots,`${key}.avif`),avif);avifBytes=avif.length;
    }
    if (theme==='vstudy'&&mode==='light') {
      for (const dest of [join(readme,`${aliases[name]}.webp`),join(shots,`${name}.webp`)]) await writeFile(dest,webp);
      if (avifBytes) for(const dest of [join(readme,`${aliases[name]}.avif`),join(shots,`${name}.avif`)]) await copyFile(join(shots,`${key}.avif`),dest);
    }
    manifest.push({name,theme,mode,width:2880,height:1800,webpBytes:webp.length,avifBytes,file:`${key}.webp`});
    console.log(`${key}: ${(webp.length/1024).toFixed(1)} KiB`);
  };
  const views = {
    'courses-home': async()=>{await go({view:'courses'},'.moodle-course-card');await page.evaluate(()=>window.dispatchEvent(new window.Event('vstudy:toggle-sidebar')));await page.locator('.moodle-grid-heading').first().evaluate(el=>el.scrollIntoView({block:'start'}));},
    'course-page': async()=>{await go({view:'courses',courseId:fixture.details[0].course.id},'.moodle-module');await page.locator('.moodle-page').evaluate(el=>{el.scrollTop=0;});},
    'planner-today': async()=>{await go({view:'courses'},'.planner-entry');await page.locator('.planner-entry').click();await page.locator('.planner-task-list li').first().waitFor();await page.locator('.planner-forms details[open] summary').click();await page.locator('.planner-view-tabs').evaluate(el=>el.scrollIntoView({block:'start'}));},
    'reader-chat-with-answer': async()=>{await go({view:'workspace',documentId:documents[0].id},'[data-slot=aui_assistant-message-root]');await page.locator('.selection-preview').first().waitFor();await page.locator('.aui-composer-input').waitFor();},
    'history-search': async()=>{await go({view:'history'},'[data-testid=history-result]');await page.keyboard.press('Meta+k');await page.getByRole('dialog').getByRole('searchbox').fill('the');await page.getByRole('dialog').locator('[data-testid=history-result]').first().waitFor();},
    library: async()=>go({view:'library'},'.library-document'),
    home: async()=>go({view:'home'},'.home-greeting'),
    'themes-settings': async()=>settings('appearance'),
    'moodle-webview': async()=>{await go({view:'courses',courseId:fixture.details[0].course.id},'.moodle-hero');await page.getByRole('button',{name:'Open in Moodle',exact:true}).click();await page.waitForFunction(()=>window.document.querySelector('.moodle-webview-header strong')?.textContent==='Exploring connections · CS201');await moodle.ready();},
    'storage-settings': async()=>{await settings('storage');await page.locator('[data-testid=storage-settings][aria-busy=false]').waitFor();},
    'onboarding-welcome': async()=>{await call('settings:set',{...await call('settings:get',{}),onboardingCompleted:false});await page.evaluate(()=>window.localStorage.setItem('vstudy-onboarding-v1',JSON.stringify({version:1,step:'welcome',goal:'sample',status:'active',done:[],dismissed:[]})));await go({view:'home'},'.onboarding');},
  };
  for (const theme of themes) for (const mode of modes) {
    for (const [name,prepare] of Object.entries(views)) {
      if(only&&!only.includes(name)) continue;
      await call('settings:set',{...await call('settings:get',{}),themeId:theme,colorScheme:mode,onboardingCompleted:true});
      await page.evaluate(()=>window.localStorage.setItem('vstudy-onboarding-v1',JSON.stringify({version:1,step:'start',goal:'documents',status:'completed',done:['setup','document','walkthrough','help'],dismissed:['workspace','courses']})));
      await prepare();await capture(name,theme,mode);
      if(name==='moodle-webview') await page.getByRole('button',{name:'Close Moodle page',exact:true}).click();
    }
  }
  assert.ok(manifest.length>0,'No views matched SHOT_ONLY');
  assert.deepEqual(errors,[]);
  manifest.push(...previous.filter(old=>!manifest.some(shot=>shot.file===old.file)));
  manifest.sort((a,b)=>themes.indexOf(a.theme)-themes.indexOf(b.theme)||a.mode.localeCompare(b.mode)||a.name.localeCompare(b.name));
  await rm(join(evidence,'failure.png'),{force:true});
  await writeFile(join(evidence,'manifest.json'),JSON.stringify({captureTime:new Date(captureTime).toISOString(),viewport:{width:1440,height:900,scale:2},artifact:'Built Electron app, synthetic course/provider/saved-conversation fixtures, real document imports and planner IPC',shots:manifest,errors},null,2)+'\n');
  const columns=3, w=480, h=330;
  const thumbs=await Promise.all(manifest.map(async (shot,i)=>({input:await sharp(join(shots,shot.file)).resize(w,300).extend({bottom:30,background:'#f3f2ef'}).composite([{input:Buffer.from(`<svg width="480" height="30"><text x="12" y="20" fill="#302e3a" font-family="sans-serif" font-size="12">${shot.name} · ${shot.theme} ${shot.mode}</text></svg>`),top:300,left:0}]).png().toBuffer(),left:(i%columns)*w,top:Math.floor(i/columns)*h})));
  await sharp({create:{width:columns*w,height:Math.ceil(manifest.length/columns)*h,channels:3,background:'#f3f2ef'}}).composite(thumbs).png().toFile(join(evidence,'contact-sheet.png'));
} catch(error) {
  if(app) {const page=await app.firstWindow();await page.screenshot({path:join(evidence,'failure.png')});console.error(await page.locator('body').innerText());}
  throw error;
} finally {
  try {await moodle?.close();} finally {try {await app?.close();} finally {await rm(directory,{recursive:true,force:true});}}
}
