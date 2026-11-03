import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'vstudy-final-qa-'));
let app;
try {
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${root}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1'}});
 const page=await app.firstWindow();
 await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,onboardingCompleted:true,language:'en'});});
 await page.reload();
 for (const route of [{view:'home'},{view:'library'},{view:'workspace'}]) {
  await page.evaluate(route=>window.localStorage.setItem('vstudy-route',JSON.stringify(route)),route);await page.reload();
  await page.getByRole('button',{name:'Settings',exact:true}).first().click();
  await page.getByRole('dialog',{name:'Settings',exact:true}).waitFor();
  await page.getByRole('button',{name:'Close settings',exact:true}).click();
  if(route.view==='library') {
   await page.getByRole('textbox',{name:'Search your documents',exact:true}).fill('信');
   await page.getByRole('status').filter({hasText:'Refine your query: use at least two distinct characters.'}).waitFor();
   assert.equal(await page.getByRole('heading',{name:"Couldn't load your library",exact:true}).count(),0);
  }
 }
 const menu=await app.evaluate(({Menu,BrowserWindow})=>{
  const item=Menu.getApplicationMenu().items[0].submenu.items.find(i=>i.accelerator==='CommandOrControl+,');
  BrowserWindow.getAllWindows()[0].focus();item.click();return {label:item.label,accelerator:item.accelerator};
 });
 assert.deepEqual(menu,{label:'Open settings…',accelerator:'CommandOrControl+,'});
 await page.getByRole('dialog',{name:'Settings',exact:true}).waitFor();
 await page.getByRole('button',{name:'Close settings',exact:true}).click();
 const files=[join(root,'one.md'),join(root,'two.md')];await writeFile(files[0],'# First\n\nFirst document.');await writeFile(files[1],'# Second\n\nSecond document.');
 await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async options=>{if(JSON.stringify(options.properties)!==JSON.stringify(['openFile','multiSelections']))throw new Error('Missing multiSelections');return {canceled:false,filePaths:files};};},files);
 await page.evaluate(()=>window.desktop.invoke('documents:import',{}));
 const docs=await page.evaluate(()=>window.desktop.invoke('documents:list',{}));
 assert.deepEqual(docs.map(d=>d.title).sort(),['one','two']);
 const sample=await page.evaluate(()=>window.desktop.invoke('documents:importSample',{language:'en'}));
 assert.equal(sample.title,'Reading sample');
 const empty=join(root,'empty.md');await writeFile(empty,'');
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},empty);
 assert.match(await page.evaluate(async()=>{try {await window.desktop.invoke('documents:import',{});}catch(e){return e.message;}}),/VSTUDY_STATUS:\{"code":"errors.empty_file","params":\{\}\}/);
 console.log('PASS global Settings, native menu, multi-file import, sample title, empty-file rejection');
} finally {await app?.close();await rm(root,{recursive:true,force:true});}
