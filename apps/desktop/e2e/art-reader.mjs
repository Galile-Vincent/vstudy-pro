/** Capture the real Electron reader family with isolated documents and provider fixtures. */
import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const phase = process.env.ART_PHASE ?? 'final';
const out = resolve('../../docs/evidence/art/reader', phase);
const dir = await mkdtemp(join(tmpdir(), 'vstudy-art-reader-'));
const themes = ['pseudo','responsive','interaction'].includes(phase) ? [] : phase === 'before' ? ['vstudy', 'ocean'] : phase === 'final' ? ['vstudy','ocean','grove','ember','iris','rose','slate','paper','contrast'] : ['vstudy'];
const errors = [], checks = [], screenshots = [];
let app, server;
try {
 await mkdir(out, {recursive:true});
 if(phase==='pseudo') {
  server=await createServer({configFile:false,root:resolve('src/renderer'),resolve:{alias:{'@':resolve('src/renderer')}},html:{cspNonce:'vstudy-development'},plugins:[react(),tailwind(),{name:'art-reader-pseudo',transform(code,id){if(id.endsWith('/renderer/main.tsx')) return code+'\nglobalThis.__readerArtI18n = i18n;';}}],server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd()]}}});
  await server.listen();
 }

 app = await electron.launch({args:[resolve('.'), `--user-data-dir=${dir}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1',VSTUDY_LOCALE:'en',...(server?{ELECTRON_RENDERER_URL:server.resolvedUrls.local[0]}:{})}});
 app.process().stderr.on('data', chunk => process.stderr.write(chunk));
 const page = await app.firstWindow(); page.setDefaultTimeout(15000);
 page.on('pageerror', e => errors.push(e.message));
 await page.emulateMedia({reducedMotion:'reduce'});
 const call = (channel, request) => page.evaluate(({channel,request})=>window.desktop.invoke(channel,request),{channel,request});
 let settings = await call('settings:get',{});
 await call('settings:set',{...settings,onboardingCompleted:true,welcomeSeen:true,displayName:'Alex',language:'en',chatSide:'right'});
 const folder = await call('library:folders:create',{name:'Reading room',parentId:null});
 const docs = [];
 for (const [i,title] of ['The art of paying attention','A field guide to better questions','Notes on learning'].entries()) {
  const path = join(dir, `reading-${i}.md`);
  await writeFile(path, `# ${title}\n\nLearning starts with a little curiosity. Read a passage, pause, and give the idea room to settle.\n\n## A closer look\n\nAttention shapes what we remember. When you connect a new idea to something you already know, the connection makes it easier to understand and recall.\n\n> A good question opens a door to a new way of seeing.\n\n## Try it for yourself\n\nChoose one idea from this section. Explain it in your own words, then find an example in everyday life.\n\n### Questions to carry with you\n\n- What is the central idea?\n- What evidence supports it?\n- Where might you use it?\n`);
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},path);
  const d = await call('documents:import',{folderId:folder.id});
  for(let attempt=0;attempt<200;attempt++) { const current=await call('documents:get',{documentId:d.id}); if(current.status==='ready') break; assert.notEqual(current.status,'failed'); await new Promise(resolve=>setTimeout(resolve,25)); }
  assert.equal((await call('documents:get',{documentId:d.id})).status,'ready');
  await call('library:documents:rename',{documentId:d.id,title});
  await call('documents:read',{documentId:d.id});
  docs.push(d);
 }
 const enabled = {kind:'api',id:'anthropic-api',enabled:true};
 await call('providers:configure',enabled);
 settings = await call('settings:get',{});
 await call('settings:set',{...settings,lastProviderId:'anthropic-api',lastModelId:'fake'});
 const conversation = await call('conversations:create',{documentId:docs[1].id,providerId:'anthropic-api',modelId:'fake'});
 await call('chat:start',{requestId:randomUUID(),conversationId:conversation.id,documentId:docs[1].id,providerId:'anthropic-api',modelId:'fake',userMessage:'test enriched'});
 await page.waitForFunction(async id=>(await window.desktop.invoke('messages:list',{conversationId:id})).some(m=>m.role==='assistant'),conversation.id);
 const go = async (view,documentId) => {
  await page.evaluate(route=>window.localStorage.setItem('vstudy-route',JSON.stringify(route)),{view,documentId});
  await page.reload();
  await page.locator(view==='home'?'.home-greeting':view==='library'?'.library-document':'.reading-pane .markdown').first().waitFor();
  if(view==='workspace') await page.locator('.aui-composer-input,.new-chat-composer').first().waitFor({state:'attached'});
  await page.evaluate(()=>window.document.fonts.ready);
  if(phase==='pseudo') { await page.evaluate(async()=>{await window.__readerArtI18n.changeLanguage('en-XA');window.document.documentElement.lang='en-XA';}); await page.waitForFunction(()=>window.document.body.textContent.includes('［')); }

 };
 const shot = async name => {
  await page.evaluate(()=>new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve))));
  const data = await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  await writeFile(join(out,name+'.png'),Buffer.from(data,'base64')); screenshots.push(name+'.png');
 };
 for(const themeId of themes) for(const colorScheme of ['light','dark']) for(const [width,height] of phase==='before'?[[1200,768],[1440,900]]:[[1440,900]]) {
  await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});
  settings=await call('settings:get',{});await call('settings:set',{...settings,themeId,colorScheme});
  const key=`${themeId}-${colorScheme}-${width}x${height}`;
  await page.evaluate(()=>window.localStorage.setItem('library-grid','true'));
  await go('home'); await shot(key+'-home');
  await go('library'); await shot(key+'-library');
  await call('providers:configure',enabled);
  await go('workspace',docs[0].id); await page.locator('.aui-composer-input').waitFor(); await page.locator('[data-slot=suggestions] button').first().waitFor();await shot(key+'-reader-empty');
  await go('workspace',docs[1].id); await page.locator('[data-slot=aui_assistant-message-root]').first().waitFor();await shot(key+'-reader-conversation');
  const providers=await call('providers:list',{discover:false});
  for(const p of providers) if(p.config.enabled) await call('providers:configure',{...p.config,enabled:false});
  await go('workspace',docs[2].id); await page.locator('.ai-setup-notice').waitFor();await shot(key+'-reader-no-ai');
  if(phase!=='before') {
   const geometry=await page.locator('.chat-pane').evaluate(p=>{
    const card=p.querySelector('.ai-setup-notice').getBoundingClientRect(), composer=p.querySelector('.new-chat-composer,[data-slot=aui_composer-shell]').getBoundingClientRect();
    return {overlap:card.bottom>composer.top,inside:composer.bottom<=p.getBoundingClientRect().bottom+1};
   });
   assert.equal(geometry.overlap,false,JSON.stringify({key,geometry})); assert.equal(geometry.inside,true);
   checks.push({key,...geometry});
  }
 }
 if(phase==='final'||phase==='pseudo'||phase==='responsive') {
  await call('providers:configure',enabled);
  for(const language of phase==='pseudo'?['en-XA']:['en','zh-Hant','ja']) for(const [width,height,uiScale] of [[1000,720,125],[1200,768,100],[1600,1000,100]]) {
   await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});
   settings=await call('settings:get',{});await call('settings:set',{...settings,themeId:'ocean',colorScheme:'dark',language:language==='en-XA'?'en':language,uiScale});
   for(const view of ['home','library','workspace']) {await go(view,view==='workspace'?docs[0].id:undefined);if(view==='workspace') await page.locator('.aui-composer-input').waitFor();await shot(`${language}-${width}-${uiScale}-${view}`);}
  }
  if(phase==='final') {
  settings=await call('settings:get',{});await call('settings:set',{...settings,language:'en',uiScale:100,themeId:'vstudy',colorScheme:'light'});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await go('workspace',docs[0].id);
  await page.locator('[data-slot=suggestions] button').first().click();assert.ok((await page.locator('.aui-composer-input').inputValue()).length>0);
  await page.locator('.aui-composer-input').press('Enter');await page.locator('[data-slot=aui_assistant-message-root]').first().waitFor();
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>window.document.activeElement!==window.document.body),true);
  const axe=await new AxeBuilder({page}).setLegacyMode(true).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  checks.push({axe:axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))});
  assert.deepEqual(axe.violations.map(v=>v.id),[]);
  }
 }
 if(phase==='interaction') {
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await go('workspace',docs[0].id);await page.locator('.aui-composer-input').waitFor();
  const toggle=page.getByRole('button',{name:'Toggle document library',exact:true});
  await toggle.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.shell-sidebar').isVisible(),false);
  await page.keyboard.press('Enter');assert.equal(await page.locator('.shell-sidebar').isVisible(),true);
  await page.getByRole('button',{name:'Reading tip',exact:true}).focus();await page.keyboard.press('Enter');
  await page.locator('.art-reader-coach').waitFor();await shot('coach-popover-keyboard');
  await page.getByRole('button',{name:'Dismiss this tip permanently',exact:true}).focus();await page.keyboard.press('Enter');
  await page.reload();await page.locator('.aui-composer-input').waitFor();assert.equal(await page.getByRole('button',{name:'Reading tip',exact:true}).count(),0);
  for(const p of await call('providers:list',{discover:false})) if(p.config.enabled) await call('providers:configure',{...p.config,enabled:false});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1000,720));
  settings=await call('settings:get',{});await call('settings:set',{...settings,uiScale:125});
  await go('workspace',docs[2].id);await page.locator('.art-reader-offline').waitFor();
  await page.getByRole('button',{name:'Set up AI',exact:true}).focus();await page.keyboard.press('Enter');await page.locator('.settings-dialog').waitFor();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Use without AI',exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.art-reader-offline').count(),0);
  await page.waitForFunction(()=>window.document.activeElement===window.document.getElementById('reading-content'));
  assert.equal(await page.locator('#reading-content').evaluate(e=>e===window.document.activeElement),true);
  await shot('read-without-ai-keyboard-125');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(720,720));
  await go('workspace',docs[2].id);const chatTab=page.locator('.workspace-tabs').getByRole('tab',{name:'Chat',exact:true});await chatTab.focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'Use without AI',exact:true}).focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.document.activeElement===window.document.getElementById('reading-content'));
  await shot('compact-read-without-ai-keyboard-125');
  await call('providers:configure',enabled);settings=await call('settings:get',{});await call('settings:set',{...settings,uiScale:100});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await page.evaluate(()=>window.localStorage.setItem('library-grid','true'));
  await go('library');const layoutToggle=page.locator('.library-toolbar button[aria-pressed]');await layoutToggle.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.document.querySelector('.library-results')?.getAttribute('data-view')==='list');
  assert.equal(await page.locator('.library-results').getAttribute('data-view'),'list');
  await page.locator('.library-document').first().focus();await page.keyboard.press('Enter');await page.locator('.reading-pane .markdown').waitFor();
  checks.push({keyboard:['sidebar collapse and expand','coach open and dismiss persists','AI setup dialog','continue without AI focuses reader','list toggle','open document']});
 }
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'verification.json'),JSON.stringify({phase,screenshots,checks,errors,artifact:'Built Electron application; local fixture documents and fake provider, no live AI.'},null,2));
 console.log(`PASS ${phase}. ${screenshots.length} screenshots. ${checks.length} checks. No renderer errors.`);
} catch(error) {if(app) {const p=await app.firstWindow(); console.log((await p.locator('body').innerText()).slice(-6000)); await p.screenshot({path:join(out,'failure.png')});} throw error;} finally {await app?.close();await server?.close();await rm(dir,{recursive:true,force:true});}
