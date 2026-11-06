/**
 * Exercise the packaged main process with isolated smoke-test data.
 * Owned by main.
 * Main owns privileged resources; shutdown must settle work before releasing those resources.
 * @packageDocumentation
 */
import { app, BrowserWindow, dialog } from 'electron';
import { runSetupPackagedSmoke } from './providers/setup-packaged-smoke';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
/** Run opt-in packaged-artifact assertions against an isolated application data directory. */
export async function runPackagedSmoke(window: BrowserWindow, root: string) {
  try {
    await window.webContents.executeJavaScript(`new Promise(resolve => { const check=()=>window.desktop ? resolve(true) : setTimeout(check,20);check(); })`);
    if (process.env.VSTUDY_CLI_PTY_SMOKE === '1') { await runSetupPackagedSmoke(window, root); app.quit(); return; }
    const invoke = (channel: string, request: unknown) => window.webContents.executeJavaScript(`window.desktop.invoke(${JSON.stringify(channel)},${JSON.stringify(request)})`);
    if (process.env.VSTUDY_KEYCHAIN_PROBE === '1') {
      while (!window.isVisible()) await new Promise(resolve => setTimeout(resolve,10));
      await writeFile(join(root,'keychain-visible.json'), JSON.stringify({at:Date.now(),visible:true}));
      await new Promise(resolve => setTimeout(resolve,2000));
      await writeFile(join(root,'keychain-save-start.json'), JSON.stringify({at:Date.now()}));
      try {
        await invoke('secrets:set',{providerId:'openai-api',key:'synthetic-packaged-keychain-probe'});
        await invoke('secrets:delete',{providerId:'openai-api'});
        await writeFile(join(root,'keychain-save-result.json'),JSON.stringify({at:Date.now(),saved:true}));
      } catch (error) {
        await writeFile(join(root,'keychain-save-result.json'),JSON.stringify({at:Date.now(),saved:false,error:String(error)}));
      }
    }
    const imported = [];
    for (const extension of ['md','docx']) {
      dialog.showOpenDialog = async () => ({canceled:false,filePaths:[join(root,'fixtures','sample.'+extension)]});
      const document = await invoke('documents:import',{});
      for (let i=0;i<600;i++) {
        const current=await invoke('documents:get',{documentId:document.id});
        if (current.status==='failed') throw new Error(current.error);
        if (current.status==='ready') break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      const text = await invoke('documents:read',{documentId:document.id});
      if (!text.includes('VStudy fixture')) throw new Error('Missing converted text: '+extension);
      imported.push(document.id);
    }
    const conversation=await invoke('conversations:create',{documentId:imported[0],providerId:'anthropic-api',modelId:'fake'});
    await invoke('chat:start',{requestId:crypto.randomUUID(),conversationId:conversation.id,documentId:imported[0],providerId:'anthropic-api',modelId:'fake',userMessage:'test enriched'});
    let completed=false;
    for(let i=0;i<200;i++) {
      const messages=await invoke('messages:list',{conversationId:conversation.id});
      if(messages.some((m:{role:string;parts:{text:string}[]})=>m.role==='assistant'&&m.parts.some(p=>p.text.includes('A grounded document summary.')))){completed=true;break;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!completed) throw new Error('Chat did not persist');
    const source=await readFile(join(root,'fixtures','sample.md'),'utf8');
    if(!source.includes('VStudy fixture'))throw new Error('Invalid fixture');
    await writeFile(join(root,'smoke-result.json'),JSON.stringify({ok:true,windowVisible:window.isVisible(),imports:imported.length,chatPersisted:true,userData:app.getPath('userData')}));
  } catch(error) { await writeFile(join(root,'smoke-result.json'),JSON.stringify({ok:false,error:String(error)})); }
  app.quit();
}
