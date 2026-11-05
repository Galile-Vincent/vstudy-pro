/** Real Electron theme acceptance and evidence. Moodle cards use deterministic IPC fixtures. */
import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const directory=await mkdtemp(join(tmpdir(),'vstudy-themes-'));
const evidence=resolve('../../docs/evidence/themes');
const screenshots=[],checks=[],errors=[];
let app;
try {
  await mkdir(evidence,{recursive:true});
  app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  const page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,1000));
  await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,language:'en',onboardingCompleted:true,welcomeSeen:true});});
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},resolve('e2e/fixtures/reading.md'));
  const doc=await page.evaluate(()=>window.desktop.invoke('documents:import',{}));
  await page.waitForFunction(async id=>(await window.desktop.invoke('documents:list',{})).find(d=>d.id===id)?.status==='ready',doc.id);
  const conversation=await page.evaluate(async documentId=>{
    await window.desktop.invoke('providers:configure',{kind:'api',id:'anthropic-api',enabled:true});
    const s=await window.desktop.invoke('settings:get',{});
    await window.desktop.invoke('settings:set',{...s,lastProviderId:'anthropic-api',lastModelId:'fake'});
    const c=await window.desktop.invoke('conversations:create',{documentId,providerId:'anthropic-api',modelId:'fake'});
    await window.desktop.invoke('chat:start',{requestId:window.crypto.randomUUID(),conversationId:c.id,documentId,providerId:'anthropic-api',modelId:'fake',userMessage:'Summarize the key ideas in this document.'});
    return c;
  },doc.id);
  await page.waitForFunction(async id=>(await window.desktop.invoke('messages:list',{conversationId:id})).some(m=>m.role==='assistant'),conversation.id);
  await app.evaluate(({ipcMain})=>{
    const account={id:'11111111-1111-4111-a111-111111111111',siteUrl:'https://moodle.example.edu',siteName:'Example University',remoteUserId:42,displayName:'Alex Chen',status:'connected',syncedAt:new Date().toISOString()};
    const courses=['Algorithms and Data Structures','Probability and Statistics','Design for Learning'].map((title,i)=>({id:`22222222-2222-4222-a222-22222222222${i}`,accountId:account.id,remoteId:i+1,fullName:title,shortName:`CS${210+i}`,imageUrl:null,progress:64+i*10,startAt:null,endAt:null,favourite:false,identity:{title:{zh:null,en:title},teachers:[{zh:null,en:'Dr. Lin'}],code:`CS${210+i}`,term:'1151',classLabel:{zh:null,en:'Year 2'},lifecycle:'current',lifecycleSource:'server',hidden:false,hasProgress:true,format:'weeks',summaryHtml:null}}));
    ipcMain.removeHandler('moodle:overview');
    ipcMain.handle('moodle:overview',()=>({accounts:[account],courses,upcoming:[],otherNotifications:[],unreadNotifications:0}));
  });
  const route=async(view,themeId,colorScheme)=>{
    await page.evaluate(async({view,themeId,colorScheme,id})=>{
      const s=await window.desktop.invoke('settings:get',{});
      await window.desktop.invoke('settings:set',{...s,themeId,colorScheme});
      window.localStorage.setItem('vstudy-route',JSON.stringify({view,documentId:id}));
    },{view,themeId,colorScheme,id:doc.id});
    await page.reload();
    await page.waitForFunction(({themeId,colorScheme})=>window.document.documentElement.dataset.theme===themeId&&window.document.documentElement.dataset.scheme===colorScheme,{themeId,colorScheme});
    await page.emulateMedia({reducedMotion:'reduce'});
  };
  const appearance=async()=>{
    await page.evaluate(()=>window.dispatchEvent(new window.Event('vstudy:open-settings')));
    await page.getByRole('tab',{name:'Appearance',exact:true}).click();
    await page.locator('.themes-grid').waitFor();
  };
  const shot=async(name)=>{const path=join(evidence,`${name}.png`);await page.screenshot({path,animations:'disabled'});screenshots.push(path);};
  for (const themeId of ['ocean','grove','ember','iris']) for (const scheme of ['light','dark']) {
    await route('library',themeId,scheme);
    await page.locator('.library-document').first().waitFor();
    const background=await page.evaluate(()=>window.getComputedStyle(window.document.documentElement).backgroundColor);
    const native=await app.evaluate(({BrowserWindow,nativeTheme})=>({background:BrowserWindow.getAllWindows()[0].getBackgroundColor(),source:nativeTheme.themeSource}));
    assert.equal(native.source,scheme);
    const hex='#'+background.match(/\d+/g).slice(0,3).map(n=>Number(n).toString(16).padStart(2,'0')).join('');
    assert.equal(native.background.slice(-6).toLowerCase(),hex.slice(1));
    const previous=checks.find(c=>c.scheme===scheme);
    if (previous) assert.notEqual(background,previous.background);
    checks.push({themeId,scheme,background,native});
    await shot(`${themeId}-${scheme}-library`);
    await page.locator('.shell-sidebar').getByRole('button',{name:'Courses',exact:true}).click();
    await page.locator('.moodle-course-card').first().waitFor();
    await shot(`${themeId}-${scheme}-courses`);
    await route('workspace',themeId,scheme);
    await page.locator('.markdown').waitFor();
    await page.locator('.aui-composer-input').waitFor();
    await page.locator('[data-role=assistant]').first().waitFor();
    await shot(`${themeId}-${scheme}-reader-chat`);
    await appearance();
    await shot(`${themeId}-${scheme}-settings`);
    await page.getByRole('slider',{name:'Glass opacity',exact:true}).scrollIntoViewIfNeeded();
    await shot(`${themeId}-${scheme}-interface`);
    const axe=await new AxeBuilder({page}).setLegacyMode(true).include('.appearance-layout').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),[],`${themeId}/${scheme} appearance accessibility`);
    await page.keyboard.press('Escape');
  }
  await appearance();
  await page.getByRole('button',{name:'Ocean',exact:true}).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.document.documentElement.dataset.theme==='ocean');
  await page.getByRole('button',{name:'Light',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.desktop.invoke('settings:get',{}).then(s=>s.colorScheme)),'light');
  await page.getByRole('button',{name:'Create theme',exact:true}).click();
  const editor=page.locator('.theme-editor');
  await editor.getByLabel('Theme name',{exact:true}).fill('My Ocean');
  await editor.getByLabel('Card surface',{exact:true}).fill('#f9fcff');
  await page.waitForFunction(()=>window.document.documentElement.style.getPropertyValue('--surface')==='#f9fcff');
  await shot('editor-live-preview');
  await editor.getByLabel('Text',{exact:true}).fill('#f9fcff');
  await editor.getByRole('status').getByText(/color pairs fall below/).waitFor();
  await editor.locator('.theme-contrast-result').scrollIntoViewIfNeeded();
  await shot('editor-contrast-warning');
  await editor.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.waitForFunction(()=>window.document.documentElement.dataset.theme==='ocean');
  await page.getByRole('button',{name:'Create theme',exact:true}).click();
  await editor.getByLabel('Theme name',{exact:true}).fill('My Ocean');
  await editor.getByRole('button',{name:'Save theme',exact:true}).click();
  await editor.waitFor({state:'hidden'});
  assert.equal(await page.getByRole('button',{name:'My Ocean',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Export My Ocean',exact:true}).click();
  const exported=JSON.parse(await page.getByLabel('Theme JSON',{exact:true}).inputValue());
  assert.equal(exported.version,1);
  await page.locator('.theme-transfer').getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Add theme',exact:true}).click();
  const transfer=page.locator('.theme-transfer');
  await transfer.getByLabel('Theme JSON',{exact:true}).fill('{"script":"alert(1)"}');
  await transfer.getByRole('button',{name:'Import theme',exact:true}).click();
  await transfer.getByRole('alert').waitFor();
  exported.name='Imported Ocean';
  await transfer.getByLabel('Theme JSON',{exact:true}).fill(JSON.stringify(exported));
  await transfer.getByRole('button',{name:'Import theme',exact:true}).click();
  await transfer.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Imported Ocean',exact:true}).waitFor();
  const slider=page.getByRole('slider',{name:'Contrast',exact:true});
  await slider.focus();await slider.press('ArrowRight');
  await page.waitForFunction(async()=>(await window.desktop.invoke('settings:get',{})).contrast===101);
  await page.getByRole('button',{name:'System',exact:true}).click();
  await page.emulateMedia({colorScheme:'dark'});
  await page.waitForFunction(()=>window.document.documentElement.dataset.scheme==='dark');
  await page.emulateMedia({colorScheme:'light'});
  await page.waitForFunction(()=>window.document.documentElement.dataset.scheme==='light');
  await page.reload();
  assert.equal(await page.evaluate(()=>window.document.documentElement.dataset.theme),exported.id);
  assert.equal(await page.evaluate(()=>window.desktop.invoke('settings:get',{}).then(s=>s.customThemes.length)),2);
  assert.deepEqual(errors,[]);
  await writeFile(join(evidence,'verification.json'),JSON.stringify({result:'PASS',artifact:'Production Electron. Real settings, library, and reader. Fixture Moodle overview. No school network.',screenshots,checks,behaviors:['Theme keyboard selection','Light/dark persistence','Editor live preview and cancel restoration','Create and save','Export JSON','Reject invalid JSON','Import JSON','Contrast keyboard control','System media changes','Custom theme reload'],errors},null,2)+'\n');
  console.log(`PASS. ${screenshots.length} screenshots. Theme settings, editor, JSON, keyboard, scheme changes, persistence, native source, and axe checks.`);
} catch(error) {
  if(app) {const page=await app.firstWindow();await page.screenshot({path:join(evidence,'failure.png')});console.log((await page.locator('body').innerText()).slice(-5000));}
  throw error;
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
