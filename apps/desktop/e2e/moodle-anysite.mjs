import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const directory = await mkdtemp(join(tmpdir(),'vstudy-anysite-'));
const evidence = resolve('../../docs/screenshots/moodle-anysite');
let app;
try {
  await mkdir(evidence,{recursive:true});
  app = await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  const page = await app.firstWindow(), errors = [];
  page.on('pageerror',error => errors.push(error.message));
  await page.waitForFunction(() => !!window.desktop?.invoke);
  await page.evaluate(async () => {
    const settings = await window.desktop.invoke('settings:get',{});
    await window.desktop.invoke('settings:set',{...settings,welcomeSeen:true,onboardingCompleted:true,language:'en'});
  });
  await app.evaluate(({ipcMain,BrowserWindow}) => {
    const state = {accounts:[],connections:[]}; globalThis.moodleAnySiteEvidence = state;
    for (const channel of ['moodle:check-site','moodle:connect','moodle:overview']) ipcMain.removeHandler(channel);
    ipcMain.handle('moodle:check-site',(_event,{url}) => {
      const siteUrl = (url.startsWith('https://') ? url : `https://${url}`).replace(/\/$/,'');
      const authPlan = url.includes('maintenance') ? {kind:'unavailable',reason:'maintenance'} : url.includes('password') ? {kind:'password'} : {kind:'browser',providers:[{name:'Campus ID',iconurl:'',url:`${siteUrl}/auth/oauth2/login.php?id=3`}]};
      return {siteUrl,siteName:url.includes('password') ? 'Example College' : 'Example University',authPlan};
    });
    ipcMain.handle('moodle:connect',(_event,input) => {
      state.connections.push(input);
      const account = {id:input.username ? '22222222-2222-4222-a222-222222222222' : '11111111-1111-4111-a111-111111111111',siteUrl:input.siteUrl,siteName:input.username ? 'Example College' : 'Example University',remoteUserId:42,displayName:'Test Student',status:'connected',syncedAt:new Date().toISOString()};
      state.accounts.push(account); return account;
    });
    ipcMain.handle('moodle:overview',() => ({accounts:state.accounts,courses:[],upcoming:[],otherNotifications:[],unreadNotifications:0}));
    BrowserWindow.getAllWindows()[0].setSize(1280,960);
  });
  await page.evaluate(() => window.localStorage.setItem('vstudy-route',JSON.stringify({view:'courses'})));
  await page.reload(); await page.emulateMedia({reducedMotion:'reduce'});
  const open = () => page.getByRole('button',{name:'Connect school',exact:true}).first().click();
  const dialog = page.getByRole('dialog');
  const find = async url => {await dialog.getByLabel('School Moodle URL or domain').fill(url);await dialog.getByRole('button',{name:'Find my school',exact:true}).click();};
  const shot = name => page.screenshot({path:join(evidence,name)});
  await open(); await dialog.getByLabel('School Moodle URL or domain').fill('moodle.example.edu/campus');
  await shot('01-find-school.png');
  await dialog.getByLabel('School Moodle URL or domain').press('Enter');
  await dialog.getByText('Example University',{exact:true}).waitFor();
  assert.equal(await dialog.locator('input[type=password]').count(),0); await shot('02-site-result.png');
  await dialog.getByRole('button',{name:'Continue to sign in',exact:true}).click();
  await dialog.getByRole('button',{name:'Continue with Campus ID',exact:true}).waitFor();
  assert.equal(await dialog.locator('input[type=password]').count(),0); await shot('03-browser-sign-in.png');
  await dialog.getByRole('button',{name:'Continue with Campus ID',exact:true}).click(); await dialog.waitFor({state:'hidden'});
  assert.equal(await page.locator('.moodle-account').count(),1);
  await open();await find('password.example.edu/moodle');
  await dialog.getByRole('button',{name:'Continue to sign in',exact:true}).click();
  await dialog.getByLabel('Username',{exact:true}).fill('student');await dialog.getByLabel('Password',{exact:true}).fill('fixture-password');
  await shot('04-password-sign-in.png'); await dialog.getByRole('button',{name:'Sign in',exact:true}).click(); await dialog.waitFor({state:'hidden'});
  assert.equal(await page.locator('.moodle-account').count(),2);
  assert.deepEqual(await app.evaluate(() => globalThis.moodleAnySiteEvidence.connections),[{siteUrl:'https://moodle.example.edu/campus',provider:0},{siteUrl:'https://password.example.edu/moodle',username:'student',password:'fixture-password'}]);
  assert.equal(await page.evaluate(() => window.localStorage.getItem('vstudy-moodle-recent-sites').includes('fixture-password')),false);
  await open();await find('maintenance.example.edu');await dialog.getByText('Your school’s Moodle is under maintenance.',{exact:true}).waitFor();await shot('05-maintenance.png');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.deepEqual(errors,[]); assert.match(page.url(),/\/out\/renderer\/index\.html$/);
  const report = 'PASS. Real Electron with production build from out/renderer/index.html, 1280x960. Fixture main-process IPC for Moodle discovery and sign-in, no live school network. Verified URL entry, result card, provider SSO button without password inputs, password form, two accounts from different schools, maintenance guidance, Escape dismissal, and no renderer exceptions. Password absent from recent-site storage.\n';
  await writeFile(join(evidence,'verification.txt'),report);console.log(report);
} catch (error) {
  if (app) {const page = await app.firstWindow();console.log(await page.locator('body').innerText());await page.screenshot({path:join(evidence,'failure.png')});}
  throw error;
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
