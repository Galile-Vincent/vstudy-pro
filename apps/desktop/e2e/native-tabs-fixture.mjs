import assert from 'node:assert/strict';
export async function exerciseNativeTabs(app,count=5) {
  return app.evaluate(async ({BrowserWindow,app},count)=>{
    const manager=globalThis.webviewManager,owner=BrowserWindow.getAllWindows()[0].webContents;
    const account=globalThis.webviewFixtureInputs.account;
    manager.sync(owner,[]);
    const wait=async predicate=>{const deadline=Date.now()+15000;while(!predicate()){if(Date.now()>deadline) throw Error('Native fixture timed out');await new Promise(resolve=>setTimeout(resolve,25));}};
    const live=()=>[...manager.panes.values()];
    const tabs=[];
    const samples=[];
    for(let index=0;index<count;index++) {
      const tabId=process.getBuiltinModule('crypto').randomUUID();tabs.push(tabId);
      const state=manager.open(owner,account.id,{kind:'page',url:account.siteUrl+'/course/view.php?id='+index},tabId);
      await wait(()=>manager.state(owner,state.id).status==='ready');
      samples.push({opened:index+1,liveViews:live().length,processes:app.getAppMetrics().map(metric=>({pid:metric.pid,type:metric.type,workingSetKiB:metric.memory.workingSetSize}))});
      if(live().length>4) throw Error('Native view cap exceeded');
    }
    const discarded=manager.checkpoints.has(`${owner.id}:${tabs[0]}`);
    const restored=manager.open(owner,account.id,{kind:'page',url:account.siteUrl+'/course/view.php?id=0'},tabs[0]);
    await wait(()=>manager.state(owner,restored.id).status==='ready');
    if(!manager.state(owner,restored.id).url.endsWith('id=0')) throw Error('URL checkpoint lost');
    const pane=live().find(pane=>pane.tabId===tabs[0]);
    manager.layout(owner,restored.id,{x:0,y:180,width:800,height:600},{dark:false,background:'#ffffff',foreground:'#000000',accent:'#0000ff'},true,restored.generation);
    await pane.view.webContents.executeJavaScript('document.body.style.minHeight="6000px";window.scrollTo(0,800)');
    manager.state(owner,restored.id);
    await wait(()=>pane.scroll===800);
    manager.hide(owner,tabs[0],restored.generation);
    const before=pane.view.webContents.id;
    const same=manager.open(owner,account.id,{kind:'page',url:account.siteUrl+'/course/view.php?id=0'},tabs[0]);
    if(same.id!==restored.id || pane.view.webContents.id!==before) throw Error('Ensure replaced a live view');
    const scroll=await pane.view.webContents.executeJavaScript('window.scrollY');
    if(scroll!==800) throw Error('Tab switch lost scroll');
    pane.view.webContents.emit('render-process-gone',{}, {reason:'crashed'});
    const reactivated=manager.open(owner,account.id,{kind:'page',url:account.siteUrl+'/course/view.php?id=0'},tabs[0]);
    await wait(()=>manager.state(owner,reactivated.id).status==='ready');
    const replacement=live().find(pane=>pane.tabId===tabs[0]);
    const discardedScroll=await replacement.view.webContents.executeJavaScript('window.scrollY');
    if(discardedScroll!==800) throw Error('Discard lost the scroll checkpoint');
    let release;
    const gate=new Promise(resolve=>{release=resolve;});
    const original=manager.dependencies.documents.importPath;
    manager.dependencies.documents.importPath=async(...args)=>{await gate;return original(...args);};
    const importTab=process.getBuiltinModule('crypto').randomUUID();
    const importing=manager.open(owner,account.id,{kind:'file',fileId:process.getBuiltinModule('crypto').randomUUID()},importTab);
    await wait(()=>live().some(pane=>pane.tabId===importTab && pane.importing));
    for(let index=0;index<3;index++) {
      const next=manager.open(owner,account.id,{kind:'page',url:account.siteUrl+'/course/view.php?id=100'+index},process.getBuiltinModule('crypto').randomUUID());
      await wait(()=>manager.state(owner,next.id).status==='ready');
    }
    if(!live().some(pane=>pane.state.id===importing.id)) throw Error('Import was evicted');
    release();manager.dependencies.documents.importPath=original;
    await wait(()=>!live().find(pane=>pane.tabId===importTab)?.importing);
    await manager.disconnect(account.id);
    if(live().length!==0) throw Error('Disconnect retained native views');
    return {count,discarded,scroll,discardedScroll,samples,importProtected:true,disconnected:true};
  },count).then(result=>{if(count>4) assert.equal(result.discarded,true);return result;});
}
