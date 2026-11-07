import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'vstudy-welcome-details-'));let app;
const results={};
const evidence=resolve('../../docs/evidence/welcome-details');await mkdir(evidence,{recursive:true});
try {
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
 const page=await app.firstWindow();const goHome=async()=>{if(!await page.locator('.shell-sidebar').isVisible()){if(await page.locator('.app-header').isVisible())await page.locator('.app-header').getByRole('button',{name:'Library',exact:true}).click();await page.getByRole('button',{name:'Toggle document library',exact:true}).click();}await page.locator('.shell-sidebar').getByRole('button',{name:'Home',exact:true}).click();};await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.onboarding[data-state=open]').waitFor();
 for(const step of ['welcome','language','appearance','acquisition']) {await page.locator(`.onboarding[data-step=${step}]`).waitFor();await page.locator('.onboarding footer .primary').click();}
 await page.locator('.onboarding[data-step=privacy]').getByRole('button',{name:'No thanks',exact:true}).click();
 await page.locator('.onboarding[data-step=goal]').getByRole('radio',{name:/Import my own documents/}).check();await page.locator('.onboarding footer .primary').click();
 await page.locator('.onboarding[data-step=start]').waitFor();await page.locator('.onboarding footer .primary').click();await page.locator('.onboarding').waitFor({state:'detached'});await goHome();
 await page.locator('.home-page').waitFor();assert.equal(await page.locator('.welcome').count(),0);assert.equal((await page.evaluate(()=>window.desktop.invoke('settings:get',{}))).welcomeSeen,false);results.noAutomaticTour=true;
 await page.evaluate(()=>window.dispatchEvent(new window.Event('vstudy:open-settings')));
 await page.locator('#welcome-settings-entry').click();await page.locator('.welcome').waitFor();
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('.settings-dialog[data-state=open] #welcome-settings-entry:focus').waitFor();results.settingsReturnFocus=true;
 await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.locator('#welcome-entry').click();
 await page.locator('#welcome-title').focus();await page.keyboard.press('Tab');await page.evaluate(()=>new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve))));assert.equal(await page.locator('#welcome-pause').evaluate(e=>e===window.document.activeElement),true);results.pauseFirstTab=true;
 await page.getByRole('button',{name:'Pause animations',exact:true}).click();assert.equal(await page.locator('.welcome').getAttribute('data-motion'),'paused');
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('#welcome-entry:focus').waitFor();await page.locator('#welcome-entry').click();assert.equal(await page.locator('.welcome').getAttribute('data-motion'),'paused');results.pausePersists=true;
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(100);
 assert.ok(await page.locator('#welcome-title .w-word').evaluateAll(nodes=>nodes.every(n=>window.getComputedStyle(n).opacity==='1')));results.pausedReopenReadable=true;

 await page.getByRole('button',{name:'Play animations',exact:true}).click();
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(1600);
 const entrances=()=>page.locator('#welcome-hero').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>['w-word-in','w-in','w-card-in'].includes(a.animationName)).map(a=>({name:a.animationName,time:a.currentTime})));
 const before=await entrances();await page.locator('#welcome-pause').click();await page.waitForTimeout(100);await page.locator('#welcome-pause').click();const after=await entrances();assert.deepEqual(after.map(a=>a.name),before.map(a=>a.name));assert.ok(after.every((a,i)=>a.time>=before[i].time));assert.ok(await page.locator('#welcome-title .w-word').evaluateAll(nodes=>nodes.every(n=>window.getComputedStyle(n).opacity==='1')));results.resumeDoesNotReplay=true;
 await page.emulateMedia({reducedMotion:'reduce'});

 await page.getByRole('button',{name:'Go to Models',exact:true}).click();
 await page.getByRole('button',{name:'Set up a model',exact:true}).click();
 await page.locator('.settings-dialog[data-state=open]').waitFor();
 await page.keyboard.press('Escape');
 await page.locator('.settings-dialog').waitFor({state:'hidden'});
 await page.locator('.welcome').waitFor();results.settingsEscapeKeepsTour=true;

 await page.getByRole('button',{name:'Go to Demo',exact:true}).click();await page.locator('#w-demo-title:focus').waitFor();results.dotFocus=true;
 await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,chatSide:'right'});});await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('#welcome-entry').click();await page.locator('.demo-stage[data-side=right]').waitFor();results.chatSideMirrorsSettings=true;
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2));
 for(const id of ['hero','values','demo','who','models','data','start']){await page.locator(`#welcome-${id}`).evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));assert.ok(await page.locator('.welcome').evaluate(e=>e.scrollWidth<=e.clientWidth),id+' at 200%');}
 await page.screenshot({path:join(evidence,'en-200-percent.png')});results.zoom200=true;await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
 await page.evaluate(()=>{const original=window.document.startViewTransition.bind(window.document);window.transitions=[];window.document.startViewTransition=update=>{const item={source:!!window.document.querySelector('[style*="vt-document"]'),started:window.performance.now()};window.transitions.push(item);const transition=original(()=>{const result=update();item.target=!!window.document.querySelector('.reading-pane[style*="vt-document"]');return result;});transition.finished.then(()=>item.duration=window.performance.now()-item.started);return transition;};});
 await page.getByRole('button',{name:'Try a sample document',exact:true}).click();await page.locator('.workspace [data-testid=document-markdown]').waitFor();
 assert.equal(await page.evaluate(()=>window.transitions.length),0);results.reducedTransitionsSkipped=true;
 await goHome();
 await page.emulateMedia({reducedMotion:'no-preference'});const snapshotCount=await page.evaluate(()=>window.transitions.length);await page.locator('.home-continue .home-reading-action').click();
 await page.getByTestId('document-markdown').waitFor();assert.equal(await page.evaluate(()=>window.transitions.length),snapshotCount);results.documentNavigationSkipsSnapshots=true;
 await page.evaluate(()=>{window.document.startViewTransition=()=>{throw new Error('forced failure');};});
 await goHome();await page.locator('.home-page').waitFor();results.throwingTransitionStillNavigates=true;
 await page.locator('#welcome-entry').click();await page.locator('.welcome').waitFor();results.optionalTour=true;
 console.log(JSON.stringify(results,null,2));
} finally {await app?.close();await writeFile(join(evidence,'details.json'),JSON.stringify(results,null,2));await rm(directory,{recursive:true,force:true});}
