import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const output=process.env.VSTUDY_A11Y_EVIDENCE??'/tmp/vstudy-a11y-regressions';await mkdir(output,{recursive:true});
const results=[];const directory=await mkdtemp(join(tmpdir(),'vstudy-a11y-'));let app;
try {
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1',VSTUDY_LOCALE:'en'}});
 const page=await app.firstWindow();page.setDefaultTimeout(8000);
 await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,onboardingCompleted:true});});
 const path=join(directory,'mixed.md');await writeFile(path,'# 資料と学習\n\nA paragraph for keyboard selection.\n\n```js\nconst ready = true;\n```');
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},path);
 const doc=await page.evaluate(()=>window.desktop.invoke('documents:import',{}));assert.ok(doc);
 for(const language of ['en','zh-Hant','ja']) for(const theme of ['light','dark']) for(const width of [1200,900,720]) for(const zoom of [1,2]) {
  await app.evaluate(({BrowserWindow},{width,zoom})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(width,800);w.webContents.setZoomFactor(zoom);},{width,zoom});
  await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  for(const view of ['home','library','grid','workspace']) {
   await page.evaluate(async({language,view,id})=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,language});window.localStorage.setItem('vstudy-route',JSON.stringify({view:view==='grid'?'library':view,documentId:id}));window.localStorage.setItem('library-grid',String(view==='grid'));},{language,view,id:doc.id});await page.reload();
   await page.locator(view==='workspace'?'.markdown':view==='home'?'.home-page':'.library-results').waitFor();
   const findings=await new AxeBuilder({page}).setLegacyMode(true).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']).analyze();
   const overflow=await page.evaluate(()=>({root:window.document.documentElement.scrollWidth>window.document.documentElement.clientWidth,content:(()=>{const e=window.document.querySelector('.home-page,.library-view');return !!e&&e.scrollWidth>e.clientWidth;})()}));
   results.push({language,theme,width,zoom,view,overflow,violations:findings.violations});
   await writeFile(join(output,'matrix.json'),JSON.stringify(results,null,2));
  }
 }
 // Name dialogs must accept spaces without activating Close.
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(1200,800);w.webContents.setZoomFactor(1);});
 await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,language:'en'});window.localStorage.setItem('vstudy-route',JSON.stringify({view:'library'}));});await page.reload();
 await page.getByRole('button',{name:'New folder',exact:true}).click();await page.waitForFunction(()=>window.document.activeElement?.tagName==='INPUT');await page.keyboard.type('Keyboard Folder');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>!window.document.querySelector('.library-dialog[data-state=open]'));assert.ok(await page.evaluate(()=>window.document.activeElement!==window.document.body));
 const folder=(await page.evaluate(()=>window.desktop.invoke('library:tree',{}))).find(f=>f.name==='Keyboard Folder');
 const ids=[doc.id];
 for(let n=0;n<3;n++) {
  const path=join(directory,`extra-${n}.md`);await writeFile(path,`# Extra ${n}\n\nKeyboard learning ${n}.`);
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},path);
  const extra=await page.evaluate(folderId=>window.desktop.invoke('documents:import',{folderId}),n%2===0?folder.id:null);ids.push(extra.id);
 }
 for(const id of ids) {await page.evaluate(documentId=>window.desktop.invoke('library:documents:pin',{documentId,pinned:true}),id);await page.evaluate(documentId=>window.desktop.invoke('documents:read',{documentId}),id);}
 const keyboard=[];
 const origins=ids.map((id,index)=>({id,folderId:index===0||index===2?null:folder.id}));
 for(const query of [{view:'all'},{view:'recent'},{view:'pinned'},{view:'unfiled'},{text:'Keyboard'}, {folderId:folder.id}]) {
  for(const origin of origins) await page.evaluate(({id,folderId})=>window.desktop.invoke('library:documents:move',{documentIds:[id],folderId}),origin);
  await page.evaluate(query=>window.localStorage.setItem('vstudy-route',JSON.stringify({view:'library',query})),query);await page.reload();
  const rows=page.locator('.library-document');await rows.first().waitFor();const count=await rows.count();
  if(count>1) {await rows.first().focus();await rows.first().press('Meta+Alt+ArrowDown');await page.waitForTimeout(200);assert.equal(await page.getByRole('alert').count(),0);assert.ok(await page.evaluate(()=>window.document.activeElement!==window.document.body));}
  if(query.view==='all') {
    const transfer=await page.evaluateHandle(()=>{const transfer=new window.DataTransfer();const first=window.document.querySelector('.library-document');transfer.setData('application/vstudy-documents',JSON.stringify([first.id.replace('library-document-','')]));return transfer;});
    await rows.nth(1).dispatchEvent('drop',{dataTransfer:transfer});await transfer.dispose();assert.equal(await page.getByRole('alert').count(),0);
  }
  keyboard.push({query,count});
 }
 await writeFile(join(output,'keyboard.json'),JSON.stringify(keyboard,null,2));
 await page.evaluate(id=>window.localStorage.setItem('vstudy-route',JSON.stringify({view:'workspace',documentId:id})),doc.id);await page.reload();await page.locator('.markdown').waitFor();
 await page.getByRole('button',{name:'Start a conversation',exact:true}).click();const input=page.locator('.aui-composer-input');await input.fill('Question');await input.press('Enter');await page.waitForFunction(()=>window.document.querySelector('[data-testid=chat-announcement]')?.textContent?.startsWith('Answer complete'));
 const cdp=await page.context().newCDPSession(page);const tree=await cdp.send('Accessibility.getFullAXTree');await cdp.detach();
 await writeFile(join(output,'chat-ax.json'),JSON.stringify(tree,null,2));
 assert.ok(tree.nodes.filter(n=>n.role?.value==='article' && n.name?.value).length>=2);
 await page.screenshot({path:join(output,'library.png')});
 const failures=results.filter(r=>r.violations.length||r.overflow.root||r.overflow.content);console.log(JSON.stringify({audits:results.length,failures:failures.map(({violations,...r})=>({...r,rules:violations.map(v=>v.id)}))}));assert.equal(failures.length,0);
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
