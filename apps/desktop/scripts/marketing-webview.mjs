/** Serve a synthetic teacher page through the real session-isolated Moodle WebContentsView. Loopback is fixture-only. */
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { setTimeout } from 'node:timers/promises';

const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Exploring connections · CS201</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f7f8fa;color:#253348;font:15px/1.7 -apple-system,BlinkMacSystemFont,sans-serif}nav{padding:18px 7%;background:var(--vstudy-bg,#fff);border-bottom:1px solid #e6eaf0;display:flex;justify-content:space-between;font-size:13px}nav b{color:#325ba0}main{max-width:950px;margin:32px auto;padding:0 32px}.crumb{color:color-mix(in srgb,var(--vstudy-fg,#253348) 75%,var(--vstudy-bg,#fff));font-size:12px;letter-spacing:.04em}.hero{margin-top:20px;padding:35px 40px;background:linear-gradient(120deg,#173856,#245b68);border-radius:18px;color:#fff;position:relative;overflow:hidden}.hero:after{content:'';position:absolute;width:330px;height:330px;border:1px solid #ffffff30;border-radius:50%;right:-70px;top:-160px;box-shadow:0 0 0 32px #ffffff08,0 0 0 64px #ffffff08}.hero small{color:#c7e0eb;text-transform:uppercase;letter-spacing:.12em}h1{font-size:32px;line-height:1.2;letter-spacing:-.03em;margin:12px 0}.hero p{color:#dfedf2;margin:0;max-width:500px}.grid{display:grid;grid-template-columns:1fr 240px;gap:24px;margin-top:26px}article,aside{background:var(--vstudy-bg,#fff);border:1px solid #e5eaf0;border-radius:16px;padding:26px}h2{font-size:20px;margin:0 0 12px;letter-spacing:-.02em}h3{font-size:14px;margin:0 0 12px}.note{padding:16px 18px;border-left:3px solid #77a6a6;background:color-mix(in srgb,var(--vstudy-fg,#253348) 5%,var(--vstudy-bg,#f2f7f6));border-radius:0 8px 8px 0;margin:22px 0}.activity{padding:13px 0;border-top:1px solid #edf0f3;display:flex;gap:14px;align-items:center}.icon{width:34px;height:34px;border-radius:10px;background:#edf4f9;color:#35608a;text-align:center;line-height:34px}small,.muted{color:color-mix(in srgb,var(--vstudy-fg,#253348) 75%,var(--vstudy-bg,#fff));font-size:12px}.pill{display:inline-block;background:#edf5f1;color:#35735a;padding:3px 10px;border-radius:20px;font-size:11px}aside p{font-size:13px}ol{padding-left:18px}a{color:#305f96;text-decoration:none}
</style><nav><b>CYCU · iLearning</b><span>My courses &nbsp; / &nbsp; CS201 &nbsp; · &nbsp; Alex Chen</span></nav><main><p class="crumb">ALGORITHMS &amp; DATA STRUCTURES / WEEK 8</p><header class="hero"><small>Learn · Explore · Connect</small><h1>Exploring connections</h1><p>From a simple graph to the shortest path. This week, we turn the ideas into something you can trace by hand.</p></header><div class="grid"><article><h2>A note before our next class</h2><p>Start with curiosity. Bring one graph from everyday life and a question about how its connections work.</p><div class="note">Read the worked examples, then try tracing the frontier yourself. We will compare our approaches together on Monday.</div><h3>Your week at a glance</h3><div class="activity"><span class="icon">01</span><div>Lecture notes &amp; worked examples<br><small>Reading · 12 minutes</small></div></div><div class="activity"><span class="icon">02</span><div>Graph traversal problem set<br><small>Practice · Due Friday, 18:00</small></div></div><div class="activity"><span class="icon">03</span><div>Questions for our next discussion<br><small>Forum · Share one observation</small></div></div></article><aside><span class="pill">Week 8 · In progress</span><h3 style="margin-top:20px">What you will take away</h3><ol><li>Trace BFS and DFS.</li><li>Explain the frontier.</li><li>Find a shortest path.</li></ol><hr style="border:0;border-top:1px solid #edf0f3;margin:24px 0"><h3>Dr. Mei-Ling Lin</h3><p>Office hours<br>Thursday · 14:00–16:00<br>Engineering 402</p><p class="muted">Bring your notebook and your questions.</p></aside></div></main></html>`;

export async function installMarketingMoodle(app,directory,desktop,fixture) {
  const server = createServer(async(req,res)=>{
    for await(const chunk of req) { void chunk; }
    if(req.url.startsWith('/webservice/')) {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({key:'marketing-demo'}));return;}
    if(req.url.startsWith('/admin/tool/mobile/')) {res.writeHead(303,{'Set-Cookie':'MoodleSession=demo; Path=/; HttpOnly; SameSite=Lax',Location:'/course/view.php?id=1'});res.end();return;}
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
  try {
  const siteUrl=`http://127.0.0.1:${server.address().port}`;
  const entry=join(directory,'webview-entry.ts');
  await writeFile(entry,`export { MoodleWebviews } from ${JSON.stringify(resolve(desktop,'src/main/moodle/webview.ts'))}; export { moodleWebviewContract } from ${JSON.stringify(resolve(desktop,'src/shared/moodle-webview.ts'))};`);
  await build({configFile:false,logLevel:'error',resolve:{conditions:['node']},build:{outDir:join(directory,'bundle'),lib:{entry,formats:['cjs'],fileName:()=>'webview.cjs'},rollupOptions:{external:['electron',/^node:/]}}});
  await app.evaluate(({ipcMain,BrowserWindow},{module,account,siteUrl})=>{
    const {MoodleWebviews,moodleWebviewContract}=process.getBuiltinModule('module').createRequire(process.execPath)(module);
    const manager=new MoodleWebviews({account:()=>({...account,siteUrl}),credentials:async()=>({token:'demo',privateToken:'demo'}),file:()=>{throw Error('No download in marketing fixture');},documents:{importPath:async()=>{throw Error('No download in marketing fixture');}},request:globalThis.fetch,configuredHosts:{loopback:true}});
    globalThis.marketingMoodle=manager;
    for(const [channel,contract] of Object.entries(moodleWebviewContract)) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel,(event,raw)=>{
        if(event.sender!==BrowserWindow.getAllWindows()[0].webContents||event.senderFrame!==event.sender.mainFrame) throw Error('Untrusted fixture IPC');
        const request=contract.request.parse(raw);
        if(channel.endsWith('-open')&&request.target.kind==='page') request.target.url=request.target.url.replace(account.siteUrl,siteUrl);
        const result=channel.endsWith('-open')?manager.open(event.sender,request.accountId,request.target):channel.endsWith('-state')?manager.state(event.sender,request.id):channel.endsWith('-action')?manager.action(event.sender,request.id,request.action):(manager.layout(event.sender,request.id,request.bounds,request.theme,request.visible),{ok:true});
        return Promise.resolve(result).then(value=>contract.response.parse(value));
      });
    }
  },{module:join(directory,'bundle/webview.cjs'),account:fixture.account,siteUrl});
  return {
    ready:async()=>{
      for(let attempt=0;attempt<100;attempt++) {
        const ready=await app.evaluate(()=>[...globalThis.marketingMoodle.panes.values()].every(pane=>pane.state.status==='ready'));
        if(ready) return app.evaluate(async()=>{for(const pane of globalThis.marketingMoodle.panes.values()) await pane.view.webContents.executeJavaScript('document.fonts.ready');});
        await setTimeout(50);
      }
      throw new Error('Moodle demo did not finish loading');
    },
    close:async()=>{await app.evaluate(async()=>globalThis.marketingMoodle.dispose());server.closeAllConnections();await new Promise(resolve=>server.close(resolve));},
  };
  } catch(error) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));throw error;}
}
