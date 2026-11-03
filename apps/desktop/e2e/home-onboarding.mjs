import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
const evidence='/tmp/vstudy-home'; await mkdir(evidence,{recursive:true});
const screenshots=[],checks=[];
const full=process.env.VSTUDY_FULL_MATRIX==='1';
for(const language of full?['en','zh-Hant','ja']:['en']) {
 const directory=await mkdtemp(join(tmpdir(),'vstudy-home-')); let app,db;
 const home=JSON.parse(await readFile(`src/shared/locales/${language}/home.json`,'utf8'));
 const copy=JSON.parse(await readFile(`src/shared/locales/${language}/onboarding.json`,'utf8'));
 try {
  app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:language,VSTUDY_FAKE_PROVIDER:'1'}});
  const page=await app.firstWindow(),errors=[]; await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'}); page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.onboarding[data-state=open]').waitFor();
  await page.locator('.onboarding').getByRole('combobox').first().click();await page.getByRole('option',{name:language==='en'?'English':language==='ja'?'日本語':'繁體中文',exact:true}).click();
  const audit=async state=>{
   const results=await new AxeBuilder({page}).setLegacyMode(true).analyze();
   const severe=results.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));
   checks.push({language,state,violations:severe}); if(severe.length) { await page.screenshot({path:`${evidence}/failure-${language}-${state}.png`}); console.log(JSON.stringify(results.violations)); } assert.deepEqual(severe,[],state);
  };
  const capture=async state=>{
   for(const width of full?[720,900,1200]:[1200]) {
    await app.evaluate(({BrowserWindow},w)=>BrowserWindow.getAllWindows()[0].setSize(w,900),width);
    for(const theme of full?['light','dark']:['light']) {
     await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
     const path=`${evidence}/${language}-${width}-${theme}-${state}.png`;
     await page.screenshot({path,animations:'disabled'}); if(state.startsWith('onboarding') || state==='home-empty' || state==='home-populated') await audit(`${state}-${width}-${theme}`); screenshots.push({language,width,theme,state,path});
     assert.ok(await page.locator('body').evaluate(e=>e.scrollWidth<=window.innerWidth),state+' overflow');
    }
   }
  };
  for(let step=0;step<4;step++) {
   if(step>0) assert.ok(await page.locator('#onboarding-title').evaluate(e=>e===window.document.activeElement),'step heading receives focus');
   await audit(`onboarding-${step}`); await capture(`onboarding-${step}`);
   if(step===1) { await page.locator('.onboarding input[type=password]').fill('test-local-key'); await page.getByRole('button',{name:copy.save_key,exact:true}).click(); await page.getByRole('status').filter({hasText:copy.key_saved}).waitFor(); }
   if(step===2) { await page.locator('.onboarding').getByRole('button',{name:copy.sample,exact:true}).click(); await page.getByRole('status').filter({hasText:copy.sample_added}).waitFor(); }
   await page.locator('.onboarding footer .primary').click();
  }
  await page.locator('.onboarding').waitFor({state:'detached'});
  assert.equal((await page.evaluate(()=>window.desktop.invoke('settings:get',{}))).onboardingCompleted,true);
  db=new DatabaseSync(join(directory,'vstudy.sqlite')); db.exec('PRAGMA busy_timeout=5000; DELETE FROM activity_events; DELETE FROM activity_days; UPDATE documents SET lastOpenedAt=NULL;');
  const refresh=async()=>{
   const expected=await page.evaluate(async()=>{window.dispatchEvent(new window.Event('activity-updated'));const data=await window.desktop.invoke('dashboard:get',{});return [...data.pinnedFolders.map(f=>f.name),...data.pinnedDocuments.slice(0,5).map(d=>d.document.title)].sort();});
   await page.waitForFunction(expected=>{const actual=[...window.document.querySelectorAll('.home-card .home-row')].map(row=>row.querySelector('strong')?.textContent??row.textContent).sort();return JSON.stringify(actual)===JSON.stringify(expected);},expected);
  };
  await refresh(); await audit('home-empty'); await capture('home-empty');
  // Metadata insert shapes follow the benchmark seeder at a three-document scale.
  const now=new Date().toISOString(),ids=[randomUUID(),randomUUID(),randomUUID()];
  for(let i=0;i<2;i++) db.prepare('INSERT INTO folders(id,name,position,pinned,pinnedAt,createdAt,updatedAt) VALUES(?,?,?,1,?,?,?)').run(randomUUID(),`Topic ${i}`,i,new Date(Date.now()-i*1000).toISOString(),now,now);
  const source=(await page.evaluate(()=>window.desktop.invoke('documents:list',{})))[0];
  for(const [i,id] of ids.entries()) db.prepare("INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,markdownPath,createdAt,position,lastOpenedAt,pinned,pinnedAt) VALUES(?,?,?,?,?,'text/markdown','ready',?,?,?,?,1,?)").run(id,`Study ${i}`,'sample.md',id.replaceAll('-','').padEnd(64,'0'),source.sourcePath,source.markdownPath,now,i,now,new Date(Date.now()-i*1000).toISOString());
  await refresh(); await page.getByRole('button',{name:'Study 0',exact:true}).first().waitFor(); await audit('home-populated'); await capture('home-populated');
  await page.getByRole('button',{name:home.move_up.replace('{{title}}','Study 1'),exact:true}).press('Enter');
  await page.getByRole('region',{name:home.pinned_documents,exact:true}).locator('.home-row').first().filter({hasText:'Study 1'}).waitFor();
  db.prepare('UPDATE documents SET title=? WHERE id=?').run('非常に長い名前・很長的文件名稱・A long research title '.repeat(5),ids[0]);
  await refresh(); await capture('home-long-names');
  db.prepare('UPDATE documents SET title=? WHERE id=?').run('Study 0',ids[0]);
  db.prepare('INSERT INTO usage_daily(date,providerId,modelId,documentId,inputTokens,outputTokens,costUsd,calls) VALUES(?,?,?,?,?,?,?,?)').run(now.slice(0,10),'openai-api','test',ids[0],999999999999,999999999999,9999999,10);
  await refresh(); await capture('home-huge-tokens');
  db.exec('DELETE FROM usage_daily; DELETE FROM activity_days'); await refresh(); await capture('home-zero-streak');
  for(let i=0;i<40;i++) {const d=new Date(); d.setDate(d.getDate()-i); const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);db.prepare('INSERT INTO activity_days VALUES(?,1,0,0)').run(date);}
  await refresh(); await capture('home-streak-40');
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},resolve('e2e/fixtures/reading.md'));
  await page.getByRole('button',{name:home.choose_file,exact:true}).click();
  await page.locator('.home-upload [role=status]').waitFor();
  await page.evaluate(()=>{const input=window.document.createElement('input');input.type='file';input.id='home-drop-file';input.hidden=true;window.document.body.append(input);});
  await page.locator('#home-drop-file').setInputFiles(resolve('e2e/fixtures/reading.md'));
  await page.evaluate(()=>{const input=window.document.querySelector('#home-drop-file');const dataTransfer=new window.DataTransfer();for(const file of input.files)dataTransfer.items.add(file);window.document.querySelector('.home-upload').dispatchEvent(new window.DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));input.remove();});
  await page.locator('.home-upload progress').waitFor({state:'detached'});
  assert.equal(await page.locator('.home-upload [role=alert]').count(),1, 'synthetic drops cannot mint native file capabilities');
  await page.getByRole('button',{name:'Study 0',exact:true}).first().click();
  await page.locator('.blank-chat').waitFor(); await capture('chat-document');
  await page.getByTestId('document-markdown').locator('p').first().evaluate(element=>{const walker=window.document.createTreeWalker(element,window.NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){if(node.textContent.trim().length>3){const range=window.document.createRange();range.setStart(node,0);range.setEnd(node,Math.min(25,node.textContent.length));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);window.document.dispatchEvent(new window.Event('mouseup'));return;}}});
  await page.keyboard.press('Control+Shift+k');
  await page.locator('.aui-composer-input').waitFor();await page.locator('.blank-chat').waitFor();await capture('chat-selection');
  const settings=await page.evaluate(()=>window.desktop.invoke('settings:get',{}));
  await page.evaluate(s=>window.desktop.invoke('settings:set',{...s,replyLanguage:'ja'}),settings);await page.reload();
  await page.locator('.blank-chat').waitFor();await capture('chat-language');
  await page.evaluate(async()=>{const docs=await window.desktop.invoke('documents:list',{});for(const d of docs)await window.desktop.invoke('documents:delete',{documentId:d.id});});await page.reload();
  await page.locator('.blank-chat').waitFor();await capture('chat-empty');
  assert.deepEqual(errors,[]);console.log(`${language}: onboarding, sample, Home states, reorder and axe passed`);
 } finally {db?.close();await app?.close();await rm(directory,{recursive:true,force:true});}
}
const reviewRounds=[]; for(const round of ['round-1','round-2']) { const files=await readdir(`${evidence}/${round}`).catch(()=>[]); for(const file of files.filter(f=>f.endsWith('.png')))reviewRounds.push({round,path:`${evidence}/${round}/${file}`}); }
await mkdir('../../docs/evidence',{recursive:true});await writeFile('../../docs/evidence/home-screenshots.json',JSON.stringify({screenshots,checks,reviewRounds},null,2)+'\n');
console.log(`Evidence: ${evidence}; ${screenshots.length} screenshots`);
