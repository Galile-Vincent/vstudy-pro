/** Runs one real Electron app against one loopback Moodle fixture. The production code has no fixture-mode IPC. */
import { exerciseNativeTabs } from './native-tabs-fixture.mjs';
import { _electron as electron } from 'playwright';
import { build } from 'vite';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { URL, URLSearchParams } from 'node:url';
import { Buffer } from 'node:buffer';

const directory = await mkdtemp(join(tmpdir(),'vstudy-webview-'));
const evidence = resolve('../../docs/evidence/app-tabs-native');
const accountId = '11111111-1111-4111-a111-111111111111';
const courseId = '22222222-2222-4222-a222-222222222222';
const issued = new Map();
const requests = [];
let keys = 0, exchanges = 0, expired = false, app;
const server = createServer(async (req,res) => {
  let body = '';
  for await (const part of req) body += part;
  const url = new URL(req.url,'http://127.0.0.1');
  requests.push({path:url.pathname,query:url.search,cookie:req.headers.cookie ?? '',referrer:req.headers.referer ?? ''});
  if (url.pathname === '/webservice/rest/server.php') {
    const params = new URLSearchParams(body);
    assert.equal(req.method,'POST');assert.equal(params.get('wsfunction'),'tool_mobile_get_autologin_key');
    assert.equal(params.get('privatetoken'),'PRIVATE_CANARY');assert.equal(params.get('wstoken'),'WS_CANARY');
    keys++;const key = 'key_' + keys;issued.set(key,42);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({key}));return;
  }
  if (url.pathname === '/admin/tool/mobile/autologin.php') {
    const params = new URLSearchParams(body);
    assert.equal(req.method,'POST');assert.equal(url.search,'');assert.equal(issued.get(params.get('key')),Number(params.get('userid')));
    issued.delete(params.get('key'));exchanges++;expired=false;
    res.writeHead(303,{'Set-Cookie':'MoodleSession=fixture_student; Path=/; HttpOnly; SameSite=Lax',Location:'/my/'});res.end();return;
  }
  if (url.pathname === '/login/index.php') {res.end('<h1>Login form must not appear in the app</h1>');return;}
  if (!req.headers.cookie?.includes('MoodleSession=fixture_student') || expired) {res.writeHead(302,{Location:'/login/index.php'});res.end();return;}
  if (url.pathname.startsWith('/pluginfile.php/')) {res.setHeader('Content-Type','text/markdown');res.setHeader('Content-Disposition','attachment; filename="notes.md"');res.end('# Course notes\n\nImported through the authenticated reader pipeline.');return;}
  if (url.pathname === '/slow') return;
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<!doctype html><title>Week 4 · Moodle</title><style>body{font:16px system-ui;padding:32px;line-height:1.7;min-height:6000px}a,button{display:block;margin:20px 0}</style><h1>${url.pathname.includes('/mod/') ? 'Teacher content' : 'Weekly materials'}</h1><p>Signed in as Test Student.</p><a id="page" href="/mod/page/view.php?id=2">Teacher’s original page</a><a id="file" href="/pluginfile.php/42/notes.md">Read course notes</a><button id="popup" onclick="window.open('/mod/page/view.php?id=3')">Open activity popup</button><a id="external" href="https://external.example.edu/page?sesskey=CANARY">External reading</a>`);
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const siteUrl = 'http://127.0.0.1:' + server.address().port;
const report = [];
try {
  await mkdir(evidence,{recursive:true});
  const entry = join(directory,'entry.ts');
  await writeFile(entry,`export { MoodleWebviews } from ${JSON.stringify(resolve('src/main/moodle/webview.ts'))}; export { moodleWebviewContract } from ${JSON.stringify(resolve('src/shared/moodle-webview.ts'))}; export { DocumentService } from ${JSON.stringify(resolve('src/main/services/documents.ts'))}; export { openStore } from ${JSON.stringify(resolve('src/main/db/index.ts'))};`);
  await build({configFile:false,logLevel:'error',resolve:{conditions:['node']},build:{outDir:join(directory,'bundle'),lib:{entry,formats:['cjs'],fileName:()=>'webview.cjs'},rollupOptions:{external:['electron',/^node:/]}}});
  app = await electron.launch({args:[resolve('.'),`--user-data-dir=${join(directory,'data')}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  const page = await app.firstWindow();
  const errors = [];page.on('pageerror',error => errors.push(error.message));
  await page.waitForFunction(() => !!window.desktop?.invoke);
  if(await page.getByRole('button',{name:'No thanks',exact:true}).count()) await page.getByRole('button',{name:'No thanks',exact:true}).click();
  await page.evaluate(async () => {const settings = await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...settings,welcomeSeen:true,onboardingCompleted:true,language:'en'});});
  await app.evaluate(({ipcMain,BrowserWindow,app,dialog},input) => {
    const fixture = process.getBuiltinModule('module').createRequire(process.execPath)(input.module);
    const account = {id:input.accountId,siteUrl:input.siteUrl,siteName:'Mock University',remoteUserId:42,displayName:'Test Student',status:'connected',syncedAt:new Date().toISOString()};
    const identity = {title:{zh:null,en:'Electronics laboratory'},teachers:[{zh:null,en:'Professor Chen'}],code:'EE204',term:'1151',classLabel:{zh:null,en:'A'},lifecycle:'current',lifecycleSource:'server',hidden:false,hasProgress:false,format:'weeks',summaryHtml:null};
    const course = {id:input.courseId,accountId:account.id,remoteId:4,fullName:'Electronics laboratory',shortName:'EE204',imageUrl:null,progress:null,startAt:null,endAt:null,favourite:false,identity};
    const overview = {accounts:[{...account,siteUrl:'https://school.example'}],courses:[course],upcoming:[],otherNotifications:[],unreadNotifications:0};
    const module = {id:'66666666-6666-4666-a666-666666666666',cmid:2,kind:'page',modname:'page',name:'Teacher page',descriptionHtml:'<p>Read the teacher instructions.</p><script>throw Error("MUST_NOT_RUN")</script>',url:'https://school.example/course/view.php?id=4',accessible:true,completion:'none',dueAt:null,submitted:null,fileIds:[]};
    const section = {id:'55555555-5555-4555-a555-555555555555',number:4,name:'Week 4',summaryHtml:null,accessible:true,current:true,weekStart:null,modules:[module]};
    const detail = {course,deadlines:[],notifications:[],grades:[],files:[],reminders:[],sections:[section],announcements:[]};
    for (const [channel,value] of [['moodle:overview',overview],['moodle:course',detail]]) {ipcMain.removeHandler(channel);ipcMain.handle(channel,() => value);}
    const userData = app.getPath('userData');
    const store = fixture.openStore(process.getBuiltinModule('path').join(userData,'vstudy.sqlite'));
    globalThis.webviewDocuments = new fixture.DocumentService({store,userData,convert:async () => {throw Error('Markdown must not start a converter');}});
    globalThis.webviewStore = store;
    globalThis.webviewFixtureInputs = {account};
    globalThis.webviewExternal = [];
    globalThis.webviewNet = [];
    app.on('web-contents-created',(_event,contents) => contents.session.webRequest.onErrorOccurred(details => globalThis.webviewNet.push({id:details.webContentsId,url:details.url,error:details.error})));
    dialog.showMessageBox = async (_window,options) => {globalThis.webviewExternal.push(options);return {response:0};};
    globalThis.webviewManager = new fixture.MoodleWebviews({account:id => {if (![account.id,'33333333-3333-4333-a333-333333333333'].includes(id)) throw Error('Missing account');return {...account,id};},credentials:async () => ({token:'WS_CANARY',privateToken:'PRIVATE_CANARY'}),file:() => ({account,url:account.siteUrl + '/pluginfile.php/42/notes.md'}),documents:{importPath:async path => {const document = await globalThis.webviewDocuments.importPath(path);globalThis.webviewImported=document.id;return document;}},request:globalThis.fetch,configuredHosts:{loopback:true}});
    for (const [channel,contract] of Object.entries(fixture.moodleWebviewContract)) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel,(event,raw) => {
        if (event.sender !== BrowserWindow.getAllWindows()[0].webContents || event.senderFrame !== event.sender.mainFrame) throw Error('Untrusted fixture IPC');
        const request = contract.request.parse(raw), manager = globalThis.webviewManager;
        if (channel.endsWith('-open') && request.target.kind === 'page') request.target.url = request.target.url.replace('https://school.example',input.siteUrl);
        const result = channel.endsWith('-sync') ? {ok:true,tabs:manager.sync(event.sender,request.tabIds)} : channel.endsWith('-hide') ? (manager.hide(event.sender,request.tabId,request.generation),{ok:true}) : channel.endsWith('-open') ? manager.open(event.sender,request.accountId,request.target,request.tabId) : channel.endsWith('-state') ? manager.state(event.sender,request.id) : channel.endsWith('-action') ? manager.action(event.sender,request.id,request.action) : (manager.layout(event.sender,request.id,request.bounds,request.theme,request.visible,request.generation),{ok:true});
        return Promise.resolve(result).then(value => contract.response.parse(value));
      });
    }
    BrowserWindow.getAllWindows()[0].setSize(1400,960);
  },{accountId,courseId,siteUrl,module:join(directory,'bundle/webview.cjs')});
  if(process.env.VSTUDY_MEASURE_NATIVE_TABS) {
    await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('moodle:webview-sync');ipcMain.handle('moodle:webview-sync',()=>({ok:true,tabs:[]}));});
    await page.evaluate(({accountId,siteUrl})=>{
      const ids=Array.from({length:5},()=>window.crypto.randomUUID());
      const tabSet={version:1,activeId:ids[4],tabs:ids.map((id,index)=>({id,history:{entries:[{view:'moodle',accountId,target:{kind:'page',url:siteUrl+'/course/view.php?id='+index}}],index:0},title:'Moodle '+index,icon:'GraduationCap',lastActiveAt:0,presentation:{kind:'app',scrollTop:0}}))};
      const set=window.Storage.prototype.setItem;
      set.call(localStorage,'vstudy-tabs-v1',JSON.stringify(tabSet));
      window.Storage.prototype.setItem=function(key,value){if(key!=='vstudy-tabs-v1')set.call(this,key,value);};
    },{accountId,siteUrl});
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('.moodle-webview-header strong')?.textContent==='Week 4 · Moodle');
    assert.equal(await app.evaluate(()=>globalThis.webviewManager.panes.size),1,'restored native tabs load only the active view');
    assert.equal(await page.getByRole('tablist',{name:'Tabs'}).getByRole('tab').count(),5);
    await page.screenshot({path:join(evidence,'native-tabs-restored.png')});
    await page.getByRole('button',{name:'New tab',exact:true}).click();
    await page.getByRole('button',{name:'Home',exact:true}).last().click();
    const results=await exerciseNativeTabs(app,Number(process.env.VSTUDY_MEASURE_NATIVE_TABS));
    results.rendererReloadRestoredTabs=5;results.rendererReloadLiveViews=1;

    console.log(JSON.stringify(results,null,2));
    await writeFile(join(evidence,'native-pool-results.json'),JSON.stringify(results,null,2));
  } else {
  await page.getByRole('button',{name:'Courses',exact:true}).click();
  await page.locator('.course-open').first().click();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:/Teacher page/}).click();
  const detailSheet = page.locator('[data-slot=sheet-content]');
  await detailSheet.getByText('Read the teacher instructions.',{exact:true}).waitFor();
  assert.equal(await detailSheet.locator('script,iframe,img').count(),0);
  await page.screenshot({path:join(evidence,'00-native-module-detail.png')});
  await detailSheet.getByRole('button',{name:'View original page',exact:true}).click();
  const pane = page.getByTestId('moodle-webview');
  await pane.waitFor();
  const native = () => app.evaluate(({BrowserWindow}) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents && v.webContents !== BrowserWindow.getAllWindows()[0].webContents);
    return view?.webContents.id;
  });
  await page.waitForFunction(() => window.document.querySelector('.moodle-webview-header strong')?.textContent === 'Week 4 · Moodle');
  let nativeId = await native();assert.ok(nativeId);
  const remote = await app.evaluate(async ({webContents},id) => {
    const contents = webContents.fromId(id), prefs = contents.getLastWebPreferences();
    return {url:contents.getURL(),prefs:{sandbox:prefs.sandbox,contextIsolation:prefs.contextIsolation,nodeIntegration:prefs.nodeIntegration,preload:prefs.preload},dom:await contents.executeJavaScript('({heading:window.document.querySelector("h1").textContent,node:typeof require,bridge:typeof window.desktop,cookie:document.cookie})')};
  },nativeId);
  assert.equal(remote.dom.heading,'Weekly materials');assert.equal(remote.dom.node,'undefined');assert.equal(remote.dom.bridge,'undefined');assert.equal(remote.dom.cookie,'');
  assert.deepEqual(remote.prefs,{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:undefined});
  assert.equal(keys,1);assert.equal(exchanges,1);assert.equal(new URL(remote.url).searchParams.has('key'),false);
  await page.screenshot({path:join(evidence,'01-authenticated-pane.png')});
  const nativePng = await app.evaluate(async ({webContents},id) => (await webContents.fromId(id).capturePage()).toPNG().toString('base64'),nativeId);
  await writeFile(join(evidence,'01-authenticated-page-content.png'),Buffer.from(nativePng,'base64'));
  report.push('PASS. Real WebContentsView autologin POST established an HttpOnly cookie. Remote content has no Node, preload, or desktop bridge.');
  await app.evaluate(async ({webContents},id) => {await webContents.fromId(id).executeJavaScript('window.document.querySelector("#page").click()',true);},nativeId);
  await page.getByRole('button',{name:'Back',exact:true}).waitFor({state:'visible'});
  await page.waitForFunction(() => !window.document.querySelector('button[aria-label="Back"]').disabled);
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await app.evaluate(async ({webContents},id) => {await webContents.fromId(id).executeJavaScript('window.document.querySelector("#popup").click()',true);},nativeId);
  await page.waitForFunction(() => !window.document.querySelector('button[aria-label="Back"]').disabled);
  assert.equal(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().length),1);
  await app.evaluate(async ({webContents},id) => {await webContents.fromId(id).executeJavaScript('window.document.querySelector("#external").click()',true);},nativeId);
  assert.equal(await app.evaluate(() => globalThis.webviewExternal.length),1);
  assert.equal(await app.evaluate(() => globalThis.webviewExternal[0].detail),'https://external.example.edu/page');
  await pane.getByRole('button',{name:'Copy link',exact:true}).first().click();
  assert.equal((await app.evaluate(({clipboard}) => clipboard.readText())).includes('CANARY'),false);
  report.push('PASS. Back navigation works. Same-school window.open reuses the controlled view without another window.');
  report.push('PASS. An external page prompts for native confirmation with a redacted link. Cancel leaves it inside the current school page. Copied links omit session credentials.');
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await page.getByRole('button',{name:'Reset zoom',exact:true}).filter({hasText:'110%'}).waitFor();
  await page.screenshot({path:join(evidence,'02-full-overlay.png')});
  await pane.getByRole('button',{name:'Close Moodle page',exact:true}).click();
  await pane.waitFor({state:'hidden'});
  report.push('PASS. The module sheet renders sanitized content before View original page. Closing the native tab returns to the course tab.');
  await page.evaluate(async () => {
    const settings = await window.desktop.invoke('settings:get',{});
    await window.desktop.invoke('settings:set',{...settings,themeId:'ocean',colorScheme:'dark'});
  });
  await page.reload();
  await page.getByRole('button',{name:'Open in Moodle',exact:true}).click();
  await page.waitForFunction(() => window.document.querySelector('.moodle-webview-header strong')?.textContent === 'Week 4 · Moodle');
  assert.equal(keys,1);nativeId=await native();
  const actualBackground = await app.evaluate(async ({webContents},id) => webContents.fromId(id).executeJavaScript('getComputedStyle(document.documentElement).getPropertyValue("--vstudy-bg").trim()'),nativeId);
  assert.equal(actualBackground,'','the app injects no theme variables into the school page');
  await page.screenshot({path:join(evidence,'02-ocean-dark-pane.png')});
  const darkPng = await app.evaluate(async ({webContents},id) => (await webContents.fromId(id).capturePage()).toPNG().toString('base64'),nativeId);
  await writeFile(join(evidence,'02-ocean-dark-page-content.png'),Buffer.from(darkPng,'base64'));
  report.push('PASS. The school page keeps its own colors and receives no injected app theme. Native content screenshots are separate from Chromium toolbar screenshots.');
  report.push('PASS. Closing destroys the view. Reopening reuses the account cookie and does not request another autologin key.');
  const isolated = await app.evaluate(async ({session}) => {
    const partitions = ['moodle-content-' + process.getBuiltinModule('crypto').createHash('sha256').update('33333333-3333-4333-a333-333333333333' + '\0' + globalThis.webviewFixtureInputs.account.siteUrl).digest('hex')];
    return (await session.fromPartition(partitions[0]).cookies.get({})).length;
  });
  assert.equal(isolated,0);
  await app.evaluate(({webContents},id) => webContents.fromId(id).emit('did-fail-load',{},-202,'Certificate authority invalid','https://school.example',true),nativeId);
  await pane.getByText('The connection is not secure',{exact:true}).waitFor();
  await page.screenshot({path:join(evidence,'03-certificate-error.png')});
  report.push('PASS. Another account partition has no school cookie. Simulated Chromium certificate failure displays a non-bypassable error.');
  await pane.getByRole('button',{name:'Reload',exact:true}).last().click();
  await page.waitForFunction(() => !window.document.querySelector('button[aria-label="Focus page"]')?.disabled);
  await app.evaluate(async ({webContents},id) => {const contents=webContents.fromId(id);contents.emit('before-mouse-event',{}, {type:'mouseDown'});await contents.executeJavaScript('window.document.querySelector("#file").click()',true);},nativeId);
  await pane.waitFor({state:'hidden'});
  await page.waitForFunction(() => window.document.body.textContent.includes('Imported through the authenticated reader pipeline.'));
  assert.match(await app.evaluate(() => globalThis.webviewImported),/^[0-9a-f-]{36}$/);
  report.push('PASS. pluginfile.md is streamed through the real DocumentService, SQLite, and reader without saving to Downloads.');
  await page.getByRole('button',{name:'Courses',exact:true}).click();
  await page.locator('.course-open').first().click();
  await page.getByRole('button',{name:'Open in Moodle',exact:true}).click();
  await page.waitForFunction(() => window.document.querySelector('.moodle-webview-header strong')?.textContent === 'Week 4 · Moodle');
  expired=true;
  await pane.getByRole('button',{name:'Reload',exact:true}).click();
  await pane.getByText('Your Moodle web session expired',{exact:true}).waitFor();
  assert.equal(keys,1);assert.equal(exchanges,1);
  await page.screenshot({path:join(evidence,'04-session-expired.png')});
  report.push('PASS. Login redirect triggers one session recovery attempt. The six-minute cooldown prevents a second key request and displays Reconnect timing.');
  assert.equal(requests.some(r => /WS_CANARY|PRIVATE_CANARY|key_/.test(r.query + r.referrer)),false);
  assert.deepEqual(errors,[]);
  await app.evaluate(async () => {await globalThis.webviewManager.dispose();});
  await page.keyboard.press('Escape');
  await writeFile(join(evidence,'verification.txt'),report.join('\n') + '\n');
  await rm(join(evidence,'failure.png'),{force:true});
  console.log(report.join('\n'));
  }
} catch (error) {
  console.error({keys,exchanges,requests});
  if (app) console.error(await app.evaluate(() => globalThis.webviewNet));
  if (app) console.error(await app.evaluate(() => [...globalThis.webviewManager.panes.values()].map(p => ({state:globalThis.webviewManager.state(p.owner,p.state.id),entries:p.view.webContents.navigationHistory.getAllEntries()}))));
  if (app) {const page = await app.firstWindow();await page.screenshot({path:join(evidence,'failure.png')});console.error(await page.locator('body').innerText());}
  throw error;
} finally {
  if (app) {await app.evaluate(async () => {await globalThis.webviewManager?.dispose();await globalThis.webviewDocuments?.dispose();globalThis.webviewStore?.close();}).catch(() => {});await app.close();}
  server.closeAllConnections();await new Promise(resolve => server.close(resolve));
  await rm(directory,{recursive:true,force:true});
}
