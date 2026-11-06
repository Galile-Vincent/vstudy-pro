import { temporaryPath } from '../scripts/platform.mjs';
import { poll } from '../scripts/poll.mjs';
import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID as uuid } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const round=process.env.DESIGN_ROUND??'1',root=temporaryPath('vstudy-design1');await mkdir(root,{recursive:true});const screenshots=[],audits=[];
for(const language of ['en','ja','zh-Hant']) {
 const dir=await mkdtemp(join(tmpdir(),'design1-'));let app,db;
 try {
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${dir}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1',VSTUDY_LOCALE:language}});
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('.onboarding[data-state=open]').waitFor();
 const call=(channel,request={})=>page.evaluate(({channel,request})=>window.desktop.invoke(channel,request),{channel,request});
 await call('settings:set',{...await call('settings:get'),language,onboardingCompleted:true,monthlyBudgetUsd:20});await page.reload({waitUntil:'domcontentloaded'});await page.locator('.home-upload').waitFor();const sample=await call('documents:importSample',{language});await poll(()=>page.evaluate(async id=>(await window.desktop.invoke('documents:list',{})).find(d=>d.id===id)?.status==='ready',sample.id));
 db=new DatabaseSync(join(dir,'vstudy.sqlite'));db.exec('PRAGMA busy_timeout=5000');const now=new Date().toISOString(),folders=[];
 // Same metadata/file shapes as bench-db.mjs, reduced to review scale.
 for(let i=0;i<12;i++){const id=uuid();folders.push(id);db.prepare('INSERT INTO folders(id,parentId,name,position,pinned,pinnedAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)').run(id,i%3===2?folders[i-1]:i%3===1?folders[i-1]:null,['Biology 201','講義・細胞の情報伝達と遺伝子発現','研究資料・從問題到理解的學習筆記'][i%3]+` ${i}`,i,i%4===0?1:0,now,now,now);}
 db.prepare('UPDATE documents SET folderId=?,pinned=1,pinnedAt=?,lastOpenedAt=?,sizeBytes=? WHERE id=?').run(folders[1],now,now,4820113,sample.id);
 const titles=['Lecture 7 — Cell Signalling','非常に長い研究資料の名前・細胞の情報伝達と遺伝子発現を理解するための講義ノート','很長的文件名稱・從提問到理解的學習方法與資料整理','Strang — Linear Algebra and Its Applications'];
 db.prepare('UPDATE documents SET title=? WHERE id=?').run(titles[language==='en'?0:language==='ja'?1:2],sample.id);
 for(let i=1;i<42;i++){const id=uuid();db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt,folderId,position,lastOpenedAt,pinned,pinnedAt,sizeBytes,error,converter) VALUES(?,?,?,?,?,'text/markdown',?,?,?,?,?,?,?,?,?,?,'markitdown')").run(id,titles[i%4],`lecture-${i}.md`,id.replaceAll('-','').padEnd(64,'0'),sample.sourcePath,i===40?'failed':i===41?'converting':'ready',sample.markdownPath,new Date(Date.now()-i*86400000).toISOString(),folders[i%12],i,i<3?now:null,i<5?1:0,now,i*260000,i===40?"Fixture conversion failure":null);}
 for(let i=0;i<14;i++){const d=new Date();d.setDate(d.getDate()-i);const date=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d);db.prepare('INSERT OR REPLACE INTO usage_daily(date,providerId,modelId,documentId,inputTokens,outputTokens,costUsd,calls) VALUES(?,?,?,?,?,?,?,?)').run(date,'openai-api','fake',sample.id,1000+i*320,500+i*80,.04+i*.01,3);if(i<5||i>7)db.prepare('INSERT OR REPLACE INTO activity_days VALUES(?,3,720,1)').run(date);}
 const go=async(view,extra={})=>{await page.waitForLoadState('domcontentloaded');await page.evaluate(route=>window.localStorage.setItem('vstudy-route',JSON.stringify(route)),{view,...extra});await page.reload({waitUntil:'domcontentloaded'});await page.locator(view==='home'?'.home-upload':view==='library'?'.library-view':'.workspace').waitFor();};
 const capture=async(state,width,theme)=>{const current=(await call('documents:list')).find(d=>d.id===sample.id);if(current?.status==='failed')throw new Error(state+': '+current.error);await page.waitForTimeout(100);const path=`${root}/round${round}-${language}-${width}-${theme}-${state}.png`;await page.screenshot({path,animations:'disabled'});screenshots.push({round,language,width,theme,state,path});};
 const audit=async(state)=>{const result=await new AxeBuilder({page}).setLegacyMode(true).analyze();audits.push({language,state,violations:result.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))}))});};
 const common=JSON.parse(await readFile(`src/shared/locales/${language}/common.json`,'utf8')),library=JSON.parse(await readFile(`src/shared/locales/${language}/library.json`,'utf8'));
 for(const width of [720,900,1200])for(const theme of ['light','dark']) {
 await app.evaluate(({BrowserWindow},w)=>BrowserWindow.getAllWindows()[0].setSize(w,900),width);await page.setViewportSize({width,height:872});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
 await go('home');await page.locator('.home-stat').first().waitFor();await capture('home',width,theme);if(width===1200)await audit('home-'+theme);
 await go('library');await page.locator('.library-document').first().waitFor();await capture('library-list',width,theme);
 const transfer=await page.evaluateHandle(async()=>{const data=new window.DataTransfer();const result=await window.desktop.invoke('library:documents:list',{sort:'manual',direction:'asc',limit:1});data.setData('application/vstudy-documents',JSON.stringify([result.items[0].document.id]));return data;});
 const target=page.getByRole('treeitem').first();await target.dispatchEvent('dragover',{dataTransfer:transfer});await capture('library-drag',width,theme);await target.dispatchEvent('dragleave');
 await page.getByTestId('library-filters').click();await capture('library-filters',width,theme);await page.getByTestId('library-filters').click();
 await page.locator('.library-document').first().click({position:{x:4,y:4}});await capture('library-selection',width,theme);await page.keyboard.press('Escape');
 await page.locator('.library-document').first().locator('.document-actions').click();await page.getByRole('menu').waitFor();await capture('library-menu',width,theme);if(width===1200)await audit('menu-'+theme);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:library.viewToggle}).click();await capture('library-grid',width,theme);await page.getByRole('button',{name:library.viewToggle}).click();
 await page.getByRole('textbox',{name:library.search,exact:true}).fill('no-matching-document-999');await page.locator('.library-empty').waitFor();await capture('library-no-results',width,theme);
 await go('library',{query:{folderId:folders[0],subfolders:true},title:'Biology 201'});await page.locator('.library-document').first().waitFor();await capture('library-folder',width,theme);if(width===1200)await audit('library-'+theme);
 await go('workspace',{documentId:sample.id});if(width<820)await page.getByRole('tab',{name:common.document,exact:true}).click();await page.getByTestId('document-markdown').waitFor({state:'attached'});if(width<820)await page.getByRole('tab',{name:common.document,exact:true}).click();await capture('reader',width,theme);
 if(width<820)await page.getByRole('tab',{name:common.chat,exact:true}).click();
 const start=page.getByRole('button',{name:common.start_a_conversation,exact:true});if(await start.count())await start.click();await page.locator('.aui-composer-input').waitFor();await capture('chat',width,theme);if(width===1200)await audit('chat-'+theme);
 await page.getByRole('combobox',{name:common.model,exact:true}).click();await page.locator('[data-slot=model-selector-content]').waitFor();await capture('picker',width,theme);if(width===1200)await audit('picker-'+theme);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:common.open_settings,exact:true}).click();await page.getByRole('dialog').waitFor();await capture('settings',width,theme);if(width===1200)await audit('settings-'+theme);await page.keyboard.press('Escape');
 }
 await call('settings:set',{...await call('settings:get'),onboardingCompleted:false});await go('home');await page.locator('.onboarding[data-state=open]').waitFor();
 for(let step=0;step<4;step++){for(const width of [720,900,1200])for(const theme of ['light','dark']){await page.setViewportSize({width,height:872});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await capture('onboarding-'+step,width,theme);if(width===1200)await audit('onboarding-'+step+'-'+theme);}await page.locator('.onboarding footer .primary').click();}
 db.exec('DELETE FROM document_tags; DELETE FROM messages; DELETE FROM conversations; DELETE FROM activity_events; DELETE FROM activity_days; DELETE FROM usage_daily; DELETE FROM documents;');
 for(const width of [720,900,1200])for(const theme of ['light','dark']){await page.setViewportSize({width,height:872});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await go('home');await capture('home-empty',width,theme);await go('library');await page.locator('.library-empty').waitFor();await capture('library-empty',width,theme);}
 assert.deepEqual(errors,[]);console.log(language,'capture complete');
 }catch(error){console.error('Original design1 failure:', error);if(app){const p=await app.firstWindow();await p.waitForLoadState('domcontentloaded');console.log(await p.evaluate(async()=>(await window.desktop.invoke('documents:list',{})).filter(d=>d.status==='failed')).catch(()=>[]));await p.screenshot({path:`${root}/capture-failure-${language}.png`});console.log('URL',p.url());console.log(await p.locator('body').innerText());}throw error;}finally{db?.close();await app?.close();await rm(dir,{recursive:true,force:true});await writeFile(`${root}/round${round}-manifest.json`,JSON.stringify({screenshots,audits},null,2));}
}
assert.equal(audits.flatMap(a=>a.violations).length,0,JSON.stringify(audits.filter(a=>a.violations.length)));
