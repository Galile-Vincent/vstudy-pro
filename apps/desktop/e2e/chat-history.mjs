import { seedRoute } from './helpers/tab-route.mjs';
/** Real Electron coverage for History search, actions, keyboard navigation and message jumps. */
import { waitForDocumentStatus } from './helpers/document-status.mjs';
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const directory=await mkdtemp(join(tmpdir(),'vstudy-history-'));
const evidence=resolve('../../docs/evidence/chat-history');
await mkdir(evidence,{recursive:true});
let app;
try {
  app=await electron.launch({args:[resolve('.'),'--user-data-dir='+directory],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1',VSTUDY_LOCALE:'en'}});
  const page=await app.firstWindow(),errors=[];
 await page.evaluate(()=>window.sessionStorage.setItem('vstudy.memoryConsentPostponed','1'));
  page.on('pageerror',e=>errors.push(e.message));
  await seedRoute(page,{view:'history'});await page.reload();
  await page.getByRole('heading',{name:'History',exact:true}).waitFor();
  await page.getByText('Your conversations will appear here',{exact:true}).waitFor();
  const conversation=await page.evaluate(async()=>{
    const c=await window.desktop.invoke('conversations:create',{scope:'general',providerId:'anthropic-api',modelId:'fake'});
    const requestId=window.crypto.randomUUID();
    await new Promise((resolve,reject)=>{
      const off=window.desktop.onChatEvent(requestId,event=>{if(event.type==='done'){off();resolve();}if(event.type==='error'){off();reject(Error(event.message));}});
      window.desktop.invoke('chat:start',{scope:'general',conversationId:c.id,requestId,providerId:c.providerId,modelId:c.modelId,userMessage:'calculus 資料 学習 😀 <img src=x>'}).catch(reject);
    });
    return c;
  });
  await page.reload();
  const search=page.getByRole('searchbox',{name:'Search chat history'});
  await search.fill('資料');
  await page.locator('[data-testid=history-result] mark').first().waitFor();
  assert.equal(await page.locator('[data-testid=history-result] img').count(),0);
  await page.screenshot({path:join(evidence,'history-search.png'),animations:'disabled'});
  await page.locator('[data-testid=history-result]').getByRole('button',{name:'More options'}).click();
  await page.getByRole('menuitem',{name:'Rename',exact:true}).click();
  await page.getByRole('textbox',{name:'Rename thread'}).fill('Calculus study');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'Calculus study',exact:false}).first().waitFor();
  await page.locator('[data-testid=history-result]').getByRole('button',{name:'More options'}).click();
  await page.getByRole('menuitem',{name:'Pin',exact:true}).click();
  await page.getByLabel('History filters').getByRole('button',{name:'Pinned',exact:true}).click();
  await page.locator('[data-testid=history-result]').waitFor();
  await page.locator('[data-testid=history-result]').getByRole('button',{name:'More options'}).click();
  await page.getByRole('menuitem',{name:'Archive',exact:true}).click();
  await page.getByText('No matching conversations',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.locator('[data-testid=history-result]').waitFor();
  await page.locator('[data-testid=history-result]').getByRole('button',{name:'More options'}).click();
  await page.getByRole('menuitem',{name:'Delete',exact:true}).click();
  await page.getByText('No matching conversations',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.locator('[data-testid=history-result]').waitFor();
  await search.focus();await search.press('ArrowDown');
  assert.equal(await page.locator('[data-history-result]').evaluate(el=>el===window.document.activeElement),true);
  await page.locator('.history-match').first().click();
  await page.locator('.history-jump').waitFor();
  assert.match(await page.locator('.history-jump').innerText(),/資料/);
  await page.screenshot({path:join(evidence,'history-message-jump.png'),animations:'disabled'});
  await page.keyboard.press('Meta+k');
  await page.getByRole('dialog',{name:'History',exact:true}).waitFor();
  await page.getByRole('dialog').getByRole('searchbox').fill('学習');
  await page.getByRole('dialog').locator('[data-testid=history-result]').waitFor();
  await page.screenshot({path:join(evidence,'history-quick-finder.png'),animations:'disabled'});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Back to history',exact:true}).click();
  await search.fill('xqzvbnm9081726354');
  await page.getByText('No matching conversations',{exact:true}).waitFor();
  await page.screenshot({path:join(evidence,'history-no-results.png'),animations:'disabled'});
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},resolve('e2e/fixtures/reading.md'));
  const importedDocument=await page.evaluate(()=>window.desktop.invoke('documents:import',{}));
  assert.ok(importedDocument);
  await waitForDocumentStatus(page, importedDocument.id);
  const documentConversation=await page.evaluate(async document=>{
    const c=await window.desktop.invoke('conversations:create',{documentId:document.id,providerId:'anthropic-api',modelId:'fake'});
    const requestId=window.crypto.randomUUID();
    await new Promise((resolve,reject)=>{
      const off=window.desktop.onChatEvent(requestId,event=>{if(event.type==='done'){off();resolve();}if(event.type==='error'){off();reject(Error(event.message));}});
      window.desktop.invoke('chat:start',{documentId:document.id,conversationId:c.id,requestId,providerId:c.providerId,modelId:c.modelId,userMessage:'scoped history 資料'}).catch(reject);
    });
    return c;
  },importedDocument);
  await seedRoute(page,{view:'workspace',documentId:importedDocument.id});
  await page.reload();await page.getByRole('button',{name:'Conversations',exact:true}).click();
  await page.getByRole('dialog').getByRole('searchbox').fill('scoped history');
  await page.getByRole('dialog').locator('.history-match').first().click();
  await page.locator('.history-jump').waitFor();
  assert.match(await page.locator('.history-jump').innerText(),/scoped history/);
  await page.screenshot({path:join(evidence,'history-scoped-picker.png'),animations:'disabled'});
  const scopedMessages=await page.evaluate(id=>window.desktop.invoke('messages:list',{conversationId:id}),documentConversation.id);
  assert.equal(scopedMessages.length,2);
  await seedRoute(page,{view:'history'});await page.reload();
  for(const language of ['zh-Hant','ja']){
    await page.evaluate(async language=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,language});},language);
    await page.reload();await page.getByRole('searchbox').fill('学習');await page.locator('[data-testid=history-result]').waitFor();
    await page.screenshot({path:join(evidence,'history-'+language+'.png'),animations:'disabled'});
  }
  await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,themeId:'ocean',colorScheme:'dark'});});
  await page.reload();await page.getByRole('searchbox').fill('学習');await page.locator('[data-testid=history-result]').waitFor();
  await page.screenshot({path:join(evidence,'history-ocean-dark.png'),animations:'disabled'});
  const messages=await page.evaluate(id=>window.desktop.invoke('messages:list',{conversationId:id}),conversation.id);
  assert.equal(messages.length,2);
  assert.deepEqual(errors,[]);
  await writeFile(join(evidence,'history-snapshot.txt'),await page.locator('body').ariaSnapshot());
  console.log('PASS History: real general chat, CJK search, safe text, rename, pin, archive/delete undo, keyboard navigation, message jump, Cmd/Ctrl+K, en/zh-Hant/ja');
} catch(error) {if(app){const page=await app.firstWindow();await page.screenshot({path:join(evidence,'failure.png')});console.log(await page.locator('body').innerText());}throw error;}
finally {await app?.close();await rm(directory,{recursive:true,force:true});}
