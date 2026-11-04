import { _electron as electron } from 'playwright';
import { build } from 'vite';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

if (process.env.VSTUDY_SSO_HARNESS !== '1') throw new Error('Set VSTUDY_SSO_HARNESS=1 to run isolated TLS fixtures');
const root = resolve(import.meta.dirname,'..');
const dir = await mkdtemp(join(tmpdir(),'vstudy-sso-'));
const baseline = process.argv.includes('--baseline');
let app;
const servers = [];
try {
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-subj','/CN=127.0.0.1','-days','1'],{stdio:'ignore'});
  const tls = {key:await readFile(join(dir,'key.pem')),cert:await readFile(join(dir,'cert.pem'))};
  const listen = async handler => {
    const server = createServer(tls,handler); servers.push(server);
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    return `https://127.0.0.1:${server.address().port}`;
  };
  const idp = await listen((req,res) => {res.writeHead(302,{location:req.url.slice('/hop?to='.length)});res.end();});
  const school = await listen((req,res) => {
    const url = new URL(req.url,'https://fixture');
    if (url.pathname.includes('service-nologin')) {res.setHeader('Content-Type','application/json');res.end(JSON.stringify([{error:false,data:{wwwroot:school,typeoflogin:2}}]));return;}
    const mode = url.pathname.split('/')[1];
    const signature = createHash('md5').update(school + url.searchParams.get('passport')).digest('hex');
    const callback = 'vstudymoodle://token=' + Buffer.from(`${mode === 'invalid' ? '0'.repeat(32) : signature}:::fixture-token`).toString('base64');
    if (mode === 'retry') {res.destroy();return;}
    if (mode === 'link') {res.end(`<a href="${callback}">Open app</a>`);return;}
    if (mode === 'wait') {res.end('Waiting for sign-in');return;}
    res.writeHead(302,{location:mode === 'direct' || mode === 'invalid' ? callback : `${idp}/hop?to=${callback}`});res.end();
  });
  await writeFile(join(dir,'entry.ts'),`export { MoodleSso } from ${JSON.stringify(join(root,'src/main/moodle/sso.ts'))}; export { checkSite } from ${JSON.stringify(join(root,'src/main/moodle/discovery.ts'))};`);
  await build({configFile:false,logLevel:'error',plugins:[{name:'isolated-test-network',enforce:'pre',transform(code,id) {
    if (id.endsWith('/moodle/site-url.ts')) return code.replace('const url = new URL(input);',`const url = new URL(input); if (process.env.VSTUDY_SSO_HARNESS === '1' && url.protocol === 'https:' && url.hostname === '127.0.0.1' && !url.username && !url.password) return url;`).replace("host = host.replace(/^\\[|\\]$/g,'');",`if (process.env.VSTUDY_SSO_HARNESS === '1' && host === '127.0.0.1') return [{address:host,family:4}]; host = host.replace(/^\\[|\\]$/g,'');`);
    if (id.endsWith('/moodle/login-proxy.ts')) return code.replace('port:443','port:Number(target.port) || 443');
    if (id.endsWith('/moodle/sso.ts')) return code.replace('10 * 60_000','process.env.VSTUDY_SSO_TIMEOUT === "1" ? 150 : 5000');
  }}],build:{outDir:join(dir,'bundle'),lib:{entry:join(dir,'entry.ts'),formats:['cjs'],fileName:() => 'sso.cjs'},rollupOptions:{external:['electron',/^node:/]}}});
  const source = await readFile(join(root,'src/main/index.ts'),'utf8');
  const globalPolicy = source.slice(source.indexOf("app.on('web-contents-created'"),source.indexOf('let store:'));
  await writeFile(join(dir,'main.cjs'),`global.require=require; const {app,BrowserWindow}=require('electron'); if(app.isPackaged || process.env.VSTUDY_SSO_HARNESS !== '1') throw Error('Harness only'); app.setPath('userData',${JSON.stringify(join(dir,'data'))}); ${globalPolicy} app.on('certificate-error',(event,contents,url,error,certificate,callback)=>{if(new URL(url).hostname==='127.0.0.1'){event.preventDefault();callback(true);}else callback(false);}); app.whenReady().then(()=>{global.fixture=require(${JSON.stringify(join(dir,'bundle/sso.cjs'))}); global.main=new BrowserWindow({show:false,webPreferences:{sandbox:true}}); void global.main.loadURL('about:blank');});`);
  app = await electron.launch({args:[join(dir,'main.cjs')],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
  app.process().on('exit',(code,signal) => console.log(JSON.stringify({phase:'process-exit',code,signal})));
  app.process().stderr.on('data',chunk => { const text=String(chunk); if (/Error|ERR_|Unhandled/.test(text)) console.log(text.replace(/vstudymoodle:\/\/\S+/g,'[callback]').replace(/\?[^\s'"]*/g,'?[redacted]')); });
  await app.firstWindow();
  const run = async mode => {
    const result = await app.evaluate(async ({BrowserWindow}, {school,mode}) => {
      const https = global.require('node:https');
      const request = async url => new Promise((resolve,reject) => https.get(url,{rejectUnauthorized:false},res => {let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve(new Response(body)));}).on('error',reject));
      const site = await global.fixture.checkSite(school,request);
      site.config.launchurl = `${school}/${mode}/launch.php`;
      const trace=[];
      const onCreated = (_event,contents) => {
        for(const name of ['will-navigate','will-redirect','did-fail-load','did-finish-load','destroyed']) contents.on(name,(_event,...args)=> trace.push({event:name,code:name==='did-fail-load'?args[0]:undefined,host:args.filter(x=>typeof x==='string'&&x.startsWith('https:')).map(x=>new URL(x).host)[0]}));
      };
      const {app}=global.require('electron');app.on('web-contents-created',onCreated);
      const sso=new global.fixture.MoodleSso();
      const pending=sso.login(site,undefined,async tokens=>tokens.token==='fixture-token'?'connected':'wrong-token').then(value=>({value}),error=>({error:error.code || error.message}));
      if(mode==='link') {
        const timer=setInterval(()=>{const window=BrowserWindow.getAllWindows().find(w=>w!==global.main);if(window && window.webContents.getURL().includes('/link/')) {clearInterval(timer);void window.webContents.executeJavaScript('document.querySelector("a")?.click()').catch(()=>{});}},30);
        void pending.finally(()=>clearInterval(timer));
      }
      if(mode==='wait') setTimeout(()=>BrowserWindow.getAllWindows().find(w=>w!==global.main)?.close(),200);
      const result=await pending; sso.dispose();app.removeListener('web-contents-created',onCreated);
      return {...result,trace,mainSurvived:!global.main.isDestroyed()};
    },{school,mode});
    console.log(JSON.stringify({mode,...result}));
    assert.equal(result.mainSurvived,true);
    if(!baseline) assert.equal(result.value,mode==='wait'?undefined:'connected');
    return result;
  };
  for(const mode of ['redirect','direct','link','wait']) await run(mode);
} finally {
  await app?.close();
  for(const server of servers) {server.closeAllConnections();server.close();}
  await rm(dir,{recursive:true,force:true});
}
