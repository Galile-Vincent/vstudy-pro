import { _electron as electron } from 'playwright';
import { build } from 'vite';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

if (process.env.MOODLE_E2E_REAL !== '1') throw new Error('Set MOODLE_E2E_REAL=1 to contact CYCU and Microsoft');
const root = resolve(import.meta.dirname,'..');
const dir = await mkdtemp(join(tmpdir(),'vstudy-real-sso-'));
let app;
try {
  await writeFile(join(dir,'entry.ts'),`export { MoodleSso } from ${JSON.stringify(join(root,'src/main/moodle/sso.ts'))}; export { checkSite } from ${JSON.stringify(join(root,'src/main/moodle/discovery.ts'))};`);
  await build({configFile:false,logLevel:'error',build:{outDir:join(dir,'bundle'),lib:{entry:join(dir,'entry.ts'),formats:['cjs'],fileName:()=>'sso.cjs'},rollupOptions:{external:['electron',/^node:/]}}});
  const source = await readFile(join(root,'src/main/index.ts'),'utf8');
  const lockdown = source.slice(source.indexOf("app.on('web-contents-created'"),source.indexOf('let store:'));
  await writeFile(join(dir,'main.cjs'),`const {app,BrowserWindow}=require('electron'); app.setPath('userData',${JSON.stringify(join(dir,'data'))}); app.enableSandbox(); ${lockdown} app.whenReady().then(()=>{globalThis.fixture=require(${JSON.stringify(join(dir,'bundle/sso.cjs'))});globalThis.main=new BrowserWindow({show:false,webPreferences:{sandbox:true}});void globalThis.main.loadURL('about:blank');});`);
  app = await electron.launch({args:[join(dir,'main.cjs')],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
  app.on('console',message => { if (message.text().startsWith('{"phase":"moodle-sso-')) console.log(message.text()); });
  await app.firstWindow();
  const opened = app.waitForEvent('window');
  await app.evaluate(async () => {
    const site = await globalThis.fixture.checkSite('https://ilearning.cycu.edu.tw');
    console.log(JSON.stringify({phase:'moodle-sso-real-config',host:new URL(site.siteUrl).hostname,kind:site.authPlan.kind,providers:site.authPlan.providers?.length}));
    globalThis.sso = new globalThis.fixture.MoodleSso();
    void globalThis.sso.login(site,undefined,async () => {throw Error('Credentials must not be entered');}).catch(error => console.log(JSON.stringify({phase:'moodle-sso-real-outcome',code:error.code})));
  });
  const page = await opened;
  page.on('framenavigated',frame => { const url = new URL(frame.url() || 'about:blank'); console.log(JSON.stringify({phase:'moodle-sso-real-frame',host:url.hostname,scheme:url.protocol,main:frame === page.mainFrame()})); });
  await page.waitForURL(url => url.protocol === 'data:' || url.pathname.includes('/login/index.php'),{timeout:60000});
  if (page.url().startsWith('data:')) throw Error('Recovery before Moodle login: ' + await page.locator('body').innerText());
  console.log(JSON.stringify({phase:'moodle-sso-real-login',host:new URL(page.url()).hostname,outcome:'rendered'}));
  const oauth = page.locator('a[href*="auth/oauth2/login.php"]').first();
  await oauth.waitFor({timeout:15000});
  await oauth.click();
  await page.waitForURL(url => url.protocol === 'data:' || url.hostname === 'login.microsoftonline.com',{timeout:60000});
  if (page.url().startsWith('data:')) throw Error('Recovery after OAuth: ' + await page.locator('body').innerText());
  await page.locator('input[name="loginfmt"], input[type="email"]').first().waitFor({state:'visible',timeout:60000});
  assert.equal(new URL(page.url()).hostname,'login.microsoftonline.com');
  console.log(JSON.stringify({phase:'moodle-sso-real-result',host:'login.microsoftonline.com',outcome:'sign-in-form-visible',credentialsEntered:false}));
} finally {
  await app?.close();
  await rm(dir,{recursive:true,force:true});
}
