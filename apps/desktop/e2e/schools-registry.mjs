import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const directory = await mkdtemp(join(tmpdir(),'vstudy-schools-'));
const evidence = resolve('../../docs/evidence/schools');
let app;
try {
  await mkdir(evidence,{recursive:true});
  app = await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  const page = await app.firstWindow(), errors=[];
  page.on('pageerror',error => errors.push(error.message));
  await page.waitForFunction(() => !!window.desktop?.invoke);
  await page.evaluate(async () => {
    const settings=await window.desktop.invoke('settings:get',{});
    await window.desktop.invoke('settings:set',{...settings,welcomeSeen:true,onboardingCompleted:true,language:'en'});
    window.localStorage.setItem('vstudy-route',JSON.stringify({view:'courses'}));
  });
  await app.evaluate(({ipcMain,BrowserWindow}) => {
    const state={checks:[],connections:[],accounts:[]};globalThis.schoolsEvidence=state;
    for (const channel of ['moodle:check-site','moodle:connect','moodle:overview','moodle:preflight']) ipcMain.removeHandler(channel);
    ipcMain.handle('moodle:preflight',() => ({ready:true}));
    ipcMain.handle('moodle:check-site',(_event,{url}) => {
      state.checks.push(url);
      const siteUrl=(url.startsWith('https://') ? url : `https://${url}`).replace(/\/$/,'');
      const password=url.includes('password'),maintenance=url.includes('maintenance');
      return {siteUrl,siteName:password ? 'Fixture College' : 'Fixture University',authPlan:maintenance ? {kind:'unavailable',reason:'maintenance'} : password ? {kind:'password'} : {kind:'browser',providers:[{name:'Campus ID',iconurl:'',url:`${siteUrl}/auth/oauth2/login.php?id=3`}]},registration:'disabled',qrLogin:true,iconUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN/0AAAAASUVORK5CYII='};
    });
    ipcMain.handle('moodle:connect',(_event,input) => {
      state.connections.push(input);
      const account={id:input.username ? '22222222-2222-4222-a222-222222222222' : '11111111-1111-4111-a111-111111111111',siteUrl:input.siteUrl,siteName:input.username ? 'Fixture College' : 'Fixture University',remoteUserId:42,displayName:'Test Student',status:'connected',syncedAt:new Date().toISOString()};
      state.accounts.push(account);return account;
    });
    ipcMain.handle('moodle:overview',() => ({accounts:state.accounts,courses:[],upcoming:[],otherNotifications:[],unreadNotifications:0}));
    BrowserWindow.getAllWindows()[0].setSize(1280,960);
  });
  await page.reload();await page.emulateMedia({reducedMotion:'reduce'});
  const open=() => page.getByRole('button',{name:'Connect school',exact:true}).first().click();
  const dialog=page.getByRole('dialog'),input=dialog.getByRole('combobox');
  const shot=name => page.screenshot({path:join(evidence,name)});
  await open();await dialog.getByRole('option').filter({hasText:'Chung Yuan'}).waitFor();
  assert.equal(await dialog.getByRole('option').count(),4);
  await shot('01-directory.png');
  await input.fill('中原');assert.equal(await dialog.getByRole('option').count(),1);
  await input.fill('Taiwan');assert.equal(await dialog.getByRole('option').count(),1);
  assert.deepEqual(await app.evaluate(() => globalThis.schoolsEvidence.checks),[]);
  await input.press('ArrowDown');assert.equal(await input.getAttribute('aria-activedescendant'),'moodle-school-0');
  await writeFile(join(evidence,'keyboard-search.yaml'),await dialog.ariaSnapshot());
  const accessibility=await new AxeBuilder({page}).setLegacyMode().include('[role="dialog"]').analyze();
  assert.deepEqual(accessibility.violations,[]);
  await shot('02-country-search.png');await input.press('Enter');
  await dialog.getByText('Fixture University',{exact:true}).waitFor();
  assert.equal(await dialog.locator('input[type=password]').count(),0);
  await shot('03-checked-school.png');
  await dialog.getByRole('button',{name:'Continue to sign in',exact:true}).click();
  await dialog.getByRole('button',{name:'Continue with Campus ID',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await open();await dialog.getByRole('group',{name:'Connected schools'}).waitFor();
  await input.fill('No Such Academy');await dialog.getByText('No matching schools',{exact:false}).waitFor();await shot('04-add-url.png');
  await dialog.getByRole('button',{name:'Add by URL',exact:true}).click();await input.fill('password.example.edu/moodle');await input.press('Enter');
  await dialog.getByRole('button',{name:'Continue to sign in',exact:true}).click();
  await dialog.getByLabel('Username',{exact:true}).fill('fixture-student');await dialog.getByLabel('Password',{exact:true}).fill('fixture-password');await shot('05-password.png');
  await dialog.getByRole('button',{name:'Sign in',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(await page.locator('.moodle-account').count(),2);
  await open();assert.equal(await dialog.getByRole('group',{name:'Connected schools'}).getByRole('option').count(),2);await shot('06-multiple-schools.png');
  await input.fill('moodlemobile://token=QR-CANARY');await dialog.getByRole('alert').filter({hasText:'QR sign-in is not available'}).waitFor();
  assert.equal((await app.evaluate(() => globalThis.schoolsEvidence.checks)).length,2);
  await input.fill('maintenance.example.edu');await input.press('Enter');await dialog.getByRole('alert').filter({hasText:'under maintenance'}).waitFor();await shot('07-maintenance.png');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(() => window.localStorage.getItem('vstudy-moodle-recent-sites').includes('fixture-password')),false);
  assert.equal(await page.evaluate(() => window.localStorage.getItem('vstudy-moodle-recent-sites').includes('base64')),false);
  assert.deepEqual(errors,[]);
  const report='PASS. Built Electron renderer, one instance, 1280x960. Real bundled directory. Fixture discovery, sign-in, overview, and keychain preflight avoid live university networks and OS prompts. Verified multilingual and country search without probes, keyboard selection, empty-state URL entry, raster result, provider sign-in without password fields, password sign-in, two connected schools, QR fallback without requests, maintenance guidance, and Escape dismissal. No renderer errors. Axe found no dialog violations. Recent storage excludes passwords and logo bytes. Electron closed in finally.\n';
  await writeFile(join(evidence,'verification.txt'),report);console.log(report);
} catch (error) {
  if (app) {const page=await app.firstWindow();await page.screenshot({path:join(evidence,'failure.png')});console.error(await page.locator('body').innerText());}
  throw error;
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
