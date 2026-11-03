import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const directory=await mkdtemp(join(tmpdir(),'vstudy-composer-qa-'));
const evidence='/tmp/vstudy-composer-redesign'; await mkdir(evidence,{recursive:true});
let app; const shots=[];
try {
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1'}});
 const page=await app.firstWindow();
 await page.evaluate(()=>window.localStorage.setItem('vstudy-route',JSON.stringify({view:'workspace'}))); await page.reload();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByText('Workspace connected',{exact:true}).waitFor();
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},resolve('e2e/fixtures/reading.md'));
 await page.getByTestId('import-document').click();await page.getByTestId('document-markdown').waitFor();
 await page.getByRole('button',{name:'Start a conversation',exact:true}).click();
 const model=page.getByRole('combobox',{name:'Model',exact:true}); const search=page.getByRole('combobox',{name:'Search models'});
 const close=async()=>{await page.keyboard.press('Escape');await page.locator('[data-slot=model-selector-content]').waitFor({state:'hidden'});};
 const shot=async(name)=>{const path=`${evidence}/${name}.png`;await page.waitForTimeout(200);await page.screenshot({path,animations:'disabled'});shots.push(path);};
 const choose=async(query,name)=>{await model.click();await search.fill(query);await page.locator('[data-slot=model-selector-list]').getByRole('option').filter({hasText:name}).first().click();await model.filter({hasText:name}).waitFor();};
 for(const [width,height] of [[1200,800],[900,700],[720,480]]) for(const color of ['light','dark']) {
  await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:color});const prefix=`${width}-${height}-${color}`;
  if(!(await model.innerText()).includes('Fake')) await choose('Fake','Fake (test only)');
  await page.getByRole('button',{name:'Conversation usage'}).filter({hasText:'tokens'}).waitFor();
  await shot(`${prefix}-idle`);
  assert.equal(await page.locator('.aui-composer-cancel').count(),0);
  await model.click();await search.fill('Fake');await shot(`${prefix}-search`);await close();
  await choose('gpt-6.1-sol','GPT-6.1-Sol');await model.click();await search.fill('Sol');
  await page.getByRole('switch',{name:'Fast mode (priority tier)'}).click();
  await shot(`${prefix}-effort-fast`);
  const popover=await page.locator('[data-slot=model-selector-content]').boundingBox();const pane=await page.locator('.chat-pane').boundingBox();
  if(height>520){assert.ok(popover.x>=pane.x-1 && popover.x+popover.width<=pane.x+pane.width+1,'picker stays in chat pane');assert.ok(popover.y>=pane.y && popover.y+popover.height<=height,'picker avoids the pane header and window edges');}else{assert.ok(popover.x>=0 && popover.x+popover.width<=width && popover.y>=0 && popover.y+popover.height<=height,'short windows use an in-window sheet');}await close();
  await page.locator('.model-trigger-name').evaluate(el=>{el.firstChild.nodeValue='A very long model display name for typography and truncation verification';});await shot(`${prefix}-long-name`);
  await choose('Fake','Fake (test only)');
  const input=page.locator('.aui-composer-input');await input.fill('Explain this document ' + 'with more context '.repeat(300));await input.press('Enter');await page.getByRole('button',{name:'Stop generating',exact:true}).waitFor();await shot(`${prefix}-streaming`);assert.equal(await page.locator('.aui-composer-cancel').count(),1,'streaming capture includes Stop');
  await page.locator('.aui-composer-cancel').waitFor({state:'hidden'});
 }
 await page.setViewportSize({width:900,height:700});
 for(const [query,label] of [['opus','claude'],['gpt','codex'],['gemini','agy']]) {await model.click();await search.fill(query);await shot(`900-700-dark-catalog-${label}`);await close();}
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',screenshots:shots},null,2));
} catch(error) {if(app){const page=await app.firstWindow();console.log(await page.locator('body').innerText());await page.screenshot({path:`${evidence}/qa-failure.png`});}throw error;} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
