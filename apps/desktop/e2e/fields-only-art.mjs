/** Fields-only art acceptance uses the original striped cover fixtures as regression inputs. */
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { builtinThemes } from '../src/shared/themes/index.ts';
import { seedArtCourses } from './fixtures/art-courses.mjs';

const evidence=resolve('../../docs/evidence/art/clean/fields-only');
const directory=await mkdtemp(join(tmpdir(),'vstudy-fields-only-'));
const results=[],errors=[];
async function fieldEdges(input) {
  const {width,height}=await sharp(input).metadata();
  const {data,info}=await sharp(input).extract({left:Math.floor(width*.08),top:Math.floor(height*.24),width:Math.floor(width*.62),height:Math.floor(height*.38)}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let maximum=0;
  for(let y=1;y<info.height-1;y++)for(let x=1;x<info.width-1;x++)for(let channel=0;channel<info.channels;channel++) {
    const offset=(y*info.width+x)*info.channels+channel;
    maximum=Math.max(maximum,Math.abs(data[offset-info.channels]-2*data[offset]+data[offset+info.channels]),Math.abs(data[offset-info.width*info.channels]-2*data[offset]+data[offset+info.width*info.channels]));
  }
  return maximum;
}

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
    const normal=await audit('.moodle-cover .soft-art',theme.id==='contrast',false);
    await page.screenshot({path:join(evidence,`${theme.id}-${scheme}-grid-1x.png`),animations:'disabled'});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2));
    await page.waitForFunction(()=>window.innerWidth===720);
    const zoom=await audit('.moodle-cover .soft-art',theme.id==='contrast',false);
    const tiles=[];
    for(let index=0;index<await page.locator('.moodle-course-card').count();index++) {
      const card=page.locator('.moodle-course-card').nth(index);
      const cover=card.locator('.moodle-cover');
      await cover.evaluate(async el=>{el.scrollIntoView({block:'center'});await new Promise(r=>window.requestAnimationFrame(()=>window.requestAnimationFrame(r)));});
      await page.screenshot();
      const box=await cover.boundingBox();
      const capture=await app.evaluate(async({BrowserWindow},box)=>{
        const contents=BrowserWindow.getAllWindows()[0].webContents;
        const zoom=contents.getZoomFactor();
        const rectangle={x:Math.round(box.x*zoom),y:Math.round(box.y*zoom),width:Math.round(box.width*zoom),height:Math.round(box.height*zoom)};
        const image=(await contents.capturePage()).crop(rectangle);
        return {base64:image.toPNG().toString('base64'),zoom,rectangle,size:image.getSize()};
      },box);
      assert.equal(capture.zoom,2);
      const input=Buffer.from(capture.base64,'base64');
      const code=await card.locator('.moodle-course-code').textContent();
      if(/CS305|SCI108/.test(code))await writeFile(join(evidence,`${theme.id}-${scheme}-${code.includes('CS305')?'CS305':'SCI108'}-2x.png`),input);
      tiles.push({input,left:index%2*capture.size.width,top:Math.floor(index/2)*capture.size.height,width:capture.size.width,height:capture.size.height});
    }
    const width=tiles[0].width,height=tiles[0].height;
    await sharp({create:{width:width*2,height:height*Math.ceil(tiles.length/2),channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(tiles.map(({input,left,top})=>({input,left,top}))).png().toFile(join(evidence,`${theme.id}-${scheme}-grid-2x.png`));
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
    for(const detail of patterned) {
      await route(theme.id,scheme,'courses',detail.course.id);
      await audit('.moodle-hero .soft-art',theme.id==='contrast',true);
      if(theme.id==='ocean') await page.locator('.moodle-hero').screenshot({path:join(evidence,`${theme.id}-${scheme}-${detail.course.identity.code}-hero.png`),animations:'disabled'});
    }
    for(const view of ['home','library']) {
      await route(theme.id,scheme,view);
      await audit('.art-reader-cover',theme.id==='contrast',false);
      if(theme.id==='ocean') await page.screenshot({path:join(evidence,`${theme.id}-${scheme}-${view}.png`),animations:'disabled'});
    }
    results.push({theme:theme.id,scheme,normal,zoom,courses:patterned.map(d=>d.course.identity.code),documentViews:['home','library']});
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
  const pixels=[];
  const priorGrid=resolve('../../docs/evidence/art/clean/round-2/course-grid.png');
  for(const [code,left] of [['CS305',296],['SCI108',1059]]) {
    const previous=await sharp(priorGrid).extract({left,top:411,width:340,height:180}).png().toBuffer();
    const edges=await fieldEdges(previous);
    assert.ok(edges>8,'The pixel check must reject the original striped screenshot');
    pixels.push({source:'before',code,maximumSecondDifference:edges});
  }
  for(const theme of builtinThemes)for(const scheme of ['light','dark'])for(const code of ['CS305','SCI108']) {
    const path=join(evidence,`${theme.id}-${scheme}-${code}-2x.png`);
    const edges=await fieldEdges(path);
    assert.ok(edges<=8,`${theme.id}/${scheme}/${code} has a sharp edge in its field`);
    pixels.push({source:'after',theme:theme.id,scheme,code,maximumSecondDifference:edges});
  }
  assert.deepEqual(errors,[]);
  await writeFile(join(evidence,'verification.json'),JSON.stringify({result:'PASS',artifact:'Built Electron. Original striped SVG cover fixture inputs retained. Seven course cards, real local document import. No school network.',zoom:'Electron webContents.setZoomFactor(2), confirmed 720 CSS pixels in a 1440-pixel window. Native Electron capturePage crops at CSS bounds multiplied by the verified zoom factor. All seven cover crops form the 2x grid, including both formerly striped covers.',results,pixels,pixelMethod:'Maximum horizontal/vertical RGB second difference inside an undecorated central field crop. Limit 8 allows gradient quantization. The original CS305 and SCI108 stripe crops must fail this same threshold.',errors},null,2)+'\n');
  console.log('PASS. All nine themes, light/dark. Grids at 1x and 2x zoom. CS305/SCI108 card close-ups and heroes. Home/Library art and course empty states.');
} catch(error) {
  if(app){const page=await app.firstWindow();await page.screenshot({path:join(evidence,'failure.png')});}
  throw error;
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
