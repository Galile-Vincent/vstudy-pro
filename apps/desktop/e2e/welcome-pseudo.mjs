import { temporaryPath } from '../scripts/platform.mjs';
import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import assert from 'node:assert/strict';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import {tmpdir}from'node:os';import{join,resolve}from'node:path';
const directory=await mkdtemp(join(tmpdir(),'vstudy-welcome-pseudo-'));let app,server;const screenshots=[];
try{
 server=await createServer({configFile:false,root:resolve('src/renderer'),resolve:{alias:{'@':resolve('src/renderer')}},html:{cspNonce:'vstudy-development'},plugins:[react(),tailwind()],server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd()]}}});await server.listen();
 app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',ELECTRON_RENDERER_URL:server.resolvedUrls.local[0],VSTUDY_FAKE_PROVIDER:'1'}});const page=await app.firstWindow();await page.emulateMedia({reducedMotion:'reduce',colorScheme:'light'});await page.locator('.onboarding').waitFor();await page.evaluate(async()=>{const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,language:'en',onboardingCompleted:true});});await page.reload();await page.locator('#welcome-entry').click();await page.locator('.welcome').waitFor();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(900,900));
 await page.evaluate(async path=>{const {i18n}=await import(path);await i18n.changeLanguage('en-XA');window.document.documentElement.lang='en-XA';},'/@fs/'+resolve('src/shared/i18n.ts'));
 for(const section of ['hero','values','demo','who','models','data','start']){await page.locator(`#welcome-${section}`).evaluate(e=>e.scrollIntoView({behavior:'instant',block:'start'}));await page.waitForTimeout(100);const path=temporaryPath(`vstudy-welcome2/en-XA-900-light-${section}.png`);await page.screenshot({path});const overflow=await page.locator('.welcome').evaluate(e=>e.scrollWidth>e.clientWidth);screenshots.push({section,path,overflow});assert.equal(overflow,false);}
 console.log(JSON.stringify(screenshots));
}finally{await writeFile(temporaryPath('vstudy-welcome2/pseudo.json'),JSON.stringify(screenshots,null,2));await app?.close();await server?.close();await rm(directory,{recursive:true,force:true});}
