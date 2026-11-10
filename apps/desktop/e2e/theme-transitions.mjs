/** Built Electron acceptance. Pixel frames use a paused compositor timeline for exact sample offsets. */
import { _electron as electron } from 'playwright';
import sharp from 'sharp';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { seedArtCourses } from './fixtures/art-courses.mjs';

const evidence=resolve('../../docs/evidence/art/clean/transitions');
const directory=await mkdtemp(join(tmpdir(),'vstudy-clean-theme-'));
const results=[], errors=[];
let app;
try {
  await mkdir(evidence,{recursive:true});
  app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  const page=await app.firstWindow();
  page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,900));
  await seedArtCourses(app);
  const readingPath=join(directory,'Reading notes.md');
  await writeFile(readingPath,(await readFile(resolve('e2e/fixtures/reading.md'),'utf8'))+'\n'+Array.from({length:50},(_,i)=>`## Study section ${i+1}\n\nReview the worked examples and connect each result to the next exercise.\n\n`).join(''));
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},readingPath);
  const doc=await page.evaluate(()=>window.desktop.invoke('documents:import',{}));
  await page.waitForFunction(async id=>(await window.desktop.invoke('documents:list',{})).find(d=>d.id===id)?.status==='ready',doc.id);
  const conversation=await page.evaluate(async documentId=>{
    await window.desktop.invoke('providers:configure',{kind:'api',id:'anthropic-api',enabled:true});
    const c=await window.desktop.invoke('conversations:create',{documentId,providerId:'anthropic-api',modelId:'fake'});
    await window.desktop.invoke('chat:start',{requestId:window.crypto.randomUUID(),conversationId:c.id,documentId,providerId:'anthropic-api',modelId:'fake',userMessage:'Summarize the key ideas.'});
    return c;
  },doc.id);
  await page.waitForFunction(async id=>(await window.desktop.invoke('messages:list',{conversationId:id})).some(m=>m.role==='assistant'),conversation.id);
  const route=async view=>{
    await page.evaluate(async({view,id,conversationId})=>{
      const s=await window.desktop.invoke('settings:get',{});
      await window.desktop.invoke('settings:set',{...s,themeId:'vstudy',colorScheme:'light',language:'en',onboardingCompleted:true,welcomeSeen:true,lastProviderId:'anthropic-api',lastModelId:'fake'});
      window.localStorage.setItem('vstudy-route',JSON.stringify({view,documentId:id,conversationId}));
      window.localStorage.setItem('vstudy-onboarding-v1',JSON.stringify({version:1,step:'start',goal:'school',status:'completed',done:['setup'],dismissed:['courses']}));
    },{view,id:doc.id,conversationId:conversation.id});
    await page.reload();
    await page.locator(view==='courses'?'.moodle-course-card':'.aui-composer-input').first().waitFor();
    assert.equal(await page.evaluate(()=>window.document.documentElement.dataset.themeTransition),undefined,'No startup animation');
  };
  const appearance=async()=>{
    await page.evaluate(()=>window.dispatchEvent(new window.Event('vstudy:open-settings')));
    await page.getByRole('tab',{name:'Appearance',exact:true}).click();
    await page.locator('.themes-grid').waitFor();
    await page.locator('.settings-dialog').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));await new Promise(r=>window.requestAnimationFrame(()=>window.requestAnimationFrame(r)));});
  };
  const waitEnd=()=>page.waitForFunction(()=>!window.document.documentElement.dataset.themeTransition);
  const click=async selector=>page.locator(selector).evaluate(el=>el.click());
  for(const view of ['courses','workspace']) {
    await route(view);
    await page.emulateMedia({reducedMotion:'reduce'});
    const header=view==='courses'?'.shell-topbar':'.app-header';
    const scroller=view==='courses'?'.moodle-page':'.reading-scroll';
    assert.equal(await page.locator(header).evaluate(el=>window.getComputedStyle(el).borderBottomWidth),'0px');
    await page.locator(scroller).evaluate(el=>{el.scrollTop=180;});
    await page.waitForFunction(selector=>window.document.querySelector(selector)?.dataset.scrolled==='true',scroller);
    await page.screenshot({path:join(evidence,`${view}-scrolled.png`)});
    await page.locator(scroller).evaluate(el=>{el.scrollTop=0;});
    await page.waitForFunction(selector=>window.document.querySelector(selector)?.dataset.scrolled==='false',scroller);
    await page.screenshot({path:join(evidence,`${view}-rest.png`)});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await appearance();
    await page.evaluate(()=>{
      window.__themeObserver=new window.MutationObserver(()=>{
        if(window.document.documentElement.dataset.themeTransition!=='view')return;
        const pause=()=>{
          const animation=window.document.getAnimations().find(a=>a.animationName==='theme-crossfade');
          if(animation){animation.pause();animation.currentTime=0;}else window.requestAnimationFrame(pause);
        };
        window.requestAnimationFrame(pause);
      });
      window.__themeObserver.observe(window.document.documentElement,{attributes:true,attributeFilter:['data-theme-transition']});
    });
    const dialogLayout=await page.locator('.settings-dialog').boundingBox();
    await click('.scheme-card:last-child');
    await page.waitForFunction(()=>window.document.getAnimations().some(a=>a.animationName==='theme-crossfade'&&a.playState==='paused'));
    assert.equal(await page.evaluate(()=>window.document.getAnimations().find(a=>a.animationName==='theme-crossfade').effect.getTiming().duration),320,'Scheme cross-fade lasts 320ms');
    const frames=[];
    for(const time of [0,80,160,320]) {
      const opacity=await page.evaluate(time=>{
        const animation=window.document.getAnimations().find(a=>a.animationName==='theme-crossfade');
        animation.currentTime=time;
        return window.getComputedStyle(window.document.documentElement,'::view-transition-new(root)').opacity;
      },time);
      const path=join(evidence,`${view}-${time}ms.png`);
      await page.screenshot({path});
      const {data}=await sharp(path).removeAlpha().raw().toBuffer({resolveWithObject:true});
      const offset=(350*1440+80)*3;
      frames.push({time,opacity,pixel:Array.from(data.slice(offset,offset+3)),path});
    }
    assert.equal(Number(frames[0].opacity),0,'New theme starts transparent');
    assert.ok(Number(frames[1].opacity)>0&&Number(frames[1].opacity)<Number(frames[2].opacity),'New theme fades in through intermediate opacity');
    assert.equal(Number(frames[3].opacity),1,'New theme is opaque at 320ms');
    assert.notDeepEqual(frames[0].pixel,frames[1].pixel,'80ms has an intermediate rendered color');
    assert.notDeepEqual(frames[1].pixel,frames[2].pixel,'160ms advances the rendered color');
    assert.notDeepEqual(frames[2].pixel,frames[3].pixel,'320ms reaches the final color');
    await page.evaluate(()=>{window.__themeObserver.disconnect();for(const a of window.document.getAnimations())if(a.animationName==='theme-crossfade')a.finish();});
    await waitEnd();
    assert.deepEqual(await page.locator('.settings-dialog').boundingBox(),dialogLayout,'The settings dialog does not move during a scheme change');
    const layout=await page.locator(scroller).boundingBox();
    const trials=[];
    for(let trial=0;trial<5;trial++) for(const approach of ['view','tokens']) {
      const timing=await page.evaluate(async approach=>{
        window.__nativeViewTransition ??= window.document.startViewTransition;
        window.document.startViewTransition=approach==='view'?window.__nativeViewTransition:undefined;
        const gaps=[],shifts=[];
        const observer=new window.PerformanceObserver(list=>shifts.push(...list.getEntries().map(e=>e.value)));
        observer.observe({type:'layout-shift',buffered:false});
        const start=window.performance.now();
        let previous=start;
        return await new Promise(resolve=>{
          const frame=time=>{gaps.push(time-previous);previous=time;if(time-start<700)window.requestAnimationFrame(frame);else{observer.disconnect();resolve({gaps,shifts});}};
          window.requestAnimationFrame(frame);
          const index=window.document.documentElement.dataset.theme==='ocean'?1:2;
          window.document.querySelector(`.theme-card:nth-child(${index}) .theme-select`).click();
        });
      },approach);
      await waitEnd();
      assert.deepEqual(await page.locator(scroller).boundingBox(),layout,'Theme does not move the underlying workspace');
      assert.equal(timing.shifts.reduce((a,b)=>a+b,0),0,'No layout shift during the appearance change');
      trials.push({trial,approach,...timing});
    }
    await page.evaluate(()=>{window.document.startViewTransition=window.__nativeViewTransition;});
    const recording=app.evaluate(async ({BrowserWindow})=>{
      const window=BrowserWindow.getAllWindows()[0];
      const start=globalThis.performance.now();
      return await Promise.all([0,80,160,320].map(async time=>{
        await new Promise(resolve=>globalThis.setTimeout(resolve,time));
        const capturedAt=globalThis.performance.now()-start;
        const nativeColor=window.getBackgroundColor();
        const png=(await window.capturePage()).toPNG().toString('base64');
        return {time,capturedAt,nativeColor,png};
      }));
    });
    await click('.scheme-card:nth-child(2)');
    const liveFrames=[];
    for(const {png,...frame} of await recording) {
      const path=join(evidence,`${view}-live-${frame.time}ms.png`);
      await writeFile(path,Buffer.from(png,'base64'));
      liveFrames.push({...frame,path});
    }
    await waitEnd();
    results.push({view,frames,liveFrames,trials});
    await page.locator('.appearance-layout details').evaluate(details=>{details.open=true;});
    await page.getByRole('slider',{name:'Contrast',exact:true}).focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>window.document.documentElement.dataset.themeTransition==='view');
    await waitEnd();
    await page.keyboard.press('Escape');
  }
  await route('courses');
  await appearance();
  await page.evaluate(()=>{window.document.startViewTransition=undefined;});
  await click('.scheme-card:last-child');
  await page.waitForFunction(()=>window.document.documentElement.dataset.themeTransition==='tokens');
  const interpolated=await page.evaluate(async()=>{
    const values=[];
    for(let i=0;i<6;i++){values.push(window.getComputedStyle(window.document.documentElement).getPropertyValue('--background'));await new Promise(r=>window.setTimeout(r,40));}
    return values;
  });
  assert.ok(new Set(interpolated).size>2,'Registered tokens interpolate without View Transitions');
  await waitEnd();
  await page.emulateMedia({reducedMotion:'reduce'});
  await click('.scheme-card:nth-child(2)');
  await page.waitForFunction(()=>window.document.documentElement.dataset.scheme==='light');
  assert.equal(await page.evaluate(()=>window.document.documentElement.dataset.themeTransition),undefined);
  await page.getByRole('button',{name:'System',exact:true}).click();
  await page.emulateMedia({colorScheme:'dark'});
  await page.waitForFunction(()=>window.document.documentElement.dataset.scheme==='dark');
  assert.equal(await page.evaluate(()=>window.document.documentElement.dataset.themeTransition),undefined);
  assert.deepEqual(errors,[]);
  await writeFile(join(evidence,'verification.json'),JSON.stringify({result:'PASS',artifact:'Built Electron. Fixture Moodle reads and a local Markdown document with fake-provider chat.',frameMethod:'Pause the real View Transition compositor animation and set currentTime to exact offsets. Separate unpaused rAF samples record timing with no screenshots.',results,interpolated,errors},null,2)+'\n');
  console.log('PASS. Exact 0/80/160/320ms pixel frames, intermediate colors, unpaused timing, no layout shift, scroll chrome, sliders, reduced motion, system sync, and token fallback.');
} catch(error) {
  if(app){const page=await app.firstWindow();console.log(await page.evaluate(()=>({transition:window.document.documentElement.dataset.themeTransition,animations:window.document.getAnimations().map(a=>({name:a.animationName,state:a.playState})),body:window.document.body.innerText.slice(-1000)})));await page.screenshot({path:join(evidence,'failure.png')});}
  throw error;
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
