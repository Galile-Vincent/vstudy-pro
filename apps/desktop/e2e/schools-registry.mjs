import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const directory = await mkdtemp(join(process.env.VSTUDY_SCRATCH ?? '/private/tmp/claude-501/-Users-vincent-vstudy-pro/c4e4dad1-3aa9-4721-a360-58e4c6702853/scratchpad','vstudy-schools-'));
const evidence = resolve('../../docs/evidence/schools/expanded-directory');
let app;
try {
  await mkdir(evidence,{recursive:true});
  app = await electron.launch({args:[resolve('.'),'--force-device-scale-factor=2',`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
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
  const initialViewport=await page.evaluate(() => ({width:innerWidth,height:innerHeight,scale:devicePixelRatio}));
  await open();await dialog.getByRole('option').filter({hasText:'Chung Yuan'}).waitFor();
  const schools=await page.evaluate(() => window.desktop.invoke('moodle:schools',{}));
  const taiwan=schools.filter(school => school.country === 'TW');
  assert(schools.length >= 25);
  assert.equal(await dialog.getByRole('option').count(),schools.length);
  assert.equal(await page.evaluate(() => devicePixelRatio),2);
  const external=[];
  page.on('request',request => {if (/^https?:/.test(request.url())) external.push(request.url());});
  for (const colorScheme of ['dark','light']) {
    await page.evaluate(async colorScheme => {
      const settings=await window.desktop.invoke('settings:get',{});
      await window.desktop.invoke('settings:set',{...settings,colorScheme});
    },colorScheme);
    await page.reload();
    await page.waitForFunction(scheme => document.documentElement.dataset.scheme === scheme,colorScheme);
    await open();
    await dialog.getByRole('option').first().waitFor();
    await input.fill('');
    const scroll=await dialog.locator('.moodle-school-results').evaluate(element => {
      element.scrollTop=element.scrollHeight;
      return {height:element.clientHeight,scrollHeight:element.scrollHeight,scrollTop:element.scrollTop};
    });
    assert(scroll.scrollHeight > scroll.height && scroll.scrollTop > 0);
    await input.press('End');
    await dialog.getByRole('button',{name:'Add by URL',exact:true}).scrollIntoViewIfNeeded();
    assert(await input.isVisible());
    assert(await dialog.getByRole('button',{name:'Add by URL',exact:true}).evaluate(element => {const box=element.getBoundingClientRect();return box.top >= 0 && box.bottom <= innerHeight;}));
    await dialog.locator('.moodle-school-results').evaluate(element => {element.scrollTop=0;});
    await shot(`${colorScheme}-directory-2x.png`);
    await input.fill('中原');assert.equal(await dialog.getByRole('option').count(),1);
    await shot(`${colorScheme}-cycu-2x.png`);
    await input.fill('taiwan');assert.equal(await dialog.getByRole('option').count(),taiwan.length);
    await shot(`${colorScheme}-taiwan-2x.png`);
  }
  assert.deepEqual(external,[]);
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
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const settings=await window.desktop.invoke('settings:get',{});
    await window.desktop.invoke('settings:set',{...settings,language:'zh-Hant'});
  });
  await app.evaluate(() => {globalThis.schoolsEvidence.accounts=[];});
  await page.evaluate(() => localStorage.removeItem('vstudy-moodle-recent-sites'));
  await page.reload();
  await page.getByRole('button',{name:'連結學校',exact:true}).first().click();
  await dialog.getByRole('option').first().waitFor();
  const directoryHosts=await dialog.getByRole('group',{name:'學校目錄',exact:true}).getByRole('option').allTextContents();
  assert(directoryHosts.slice(0,taiwan.length).every(text => text.includes('.edu.tw')));
  await shot('zh-Hant-directory-2x.png');
  await app.evaluate(({BrowserWindow}) => {BrowserWindow.getAllWindows()[0].setContentSize(1100,720);});
  await page.waitForFunction(() => innerHeight === 720);
  await dialog.evaluate(element => {element.scrollTop=0;});
  await shot('zh-Hant-compact-2x.png');
  for (const control of [input,dialog.getByRole('button',{name:'使用網址新增',exact:true})]) {
    assert(await control.evaluate(element => {const box=element.getBoundingClientRect();return box.top >= 0 && box.bottom <= innerHeight;}));
  }
  const viewport=await page.evaluate(() => ({width:innerWidth,height:innerHeight,scale:devicePixelRatio}));
  await writeFile(join(evidence,'viewport.json'),JSON.stringify({initial:initialViewport,compact:viewport},null,2));
  const report='PASS. Built Electron renderer, one instance, a 2x display. Expanded directory, dark and light country and Chinese searches, scroll containment, URL control, and Traditional Chinese Taiwan-first ordering. A 1100x720 content viewport keeps search and URL entry visible together. Real bundled directory. Fixture discovery, sign-in, overview, and keychain preflight avoid live university networks and OS prompts. Verified multilingual and country search without probes, keyboard selection, empty-state URL entry, raster result, provider sign-in without password fields, password sign-in, two connected schools, QR fallback without requests, maintenance guidance, and Escape dismissal. No renderer errors. Axe found no dialog violations. Recent storage excludes passwords and logo bytes. Electron closed in finally.\n';
  await writeFile(join(evidence,'verification.txt'),report);console.log(report);
} catch (error) {
  if (app) {const page=await app.firstWindow();await page.screenshot({path:join(evidence,'failure.png')});console.error(await page.locator('body').innerText());}
  throw error;
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
