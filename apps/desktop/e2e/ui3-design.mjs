import { Buffer } from 'node:buffer';
import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
const out=process.env.UI3_EVIDENCE??'/tmp/vstudy-ui3/after/review-final';await mkdir(out,{recursive:true});
const dir=await mkdtemp(join(tmpdir(),'ui3-e2e-'));let app;const checks=[];
try {
 app=await electron.launch({args:[process.env.UI3_BUILD??resolve('.'),`--user-data-dir=${dir}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_FAKE_PROVIDER:'1',VSTUDY_LOCALE:'en'}});
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 const call=(channel,request)=>page.evaluate(({channel,request})=>window.desktop.invoke(channel,request),{channel,request});
 const initial=await call('settings:get',{});await call('settings:set',{...initial,onboardingCompleted:true,displayName:'Vincent'});await page.reload();
  const study = await call('library:folders:create', { name: 'Graduate Seminar — Computational Linguistics', parentId: null });
  const sub = await call('library:folders:create', { name: '語言學 讀書會', parentId: study.id });
  const work = await call('library:folders:create', { name: 'Work', parentId: null });
  await call('library:folders:update', { folderId: study.id, pinned: true });
  const tagA = await call('library:tags:save', { name: 'exam', color: null });
  const tagB = await call('library:tags:save', { name: 'to-review', color: null });
  const docs = [
    ['Attention Is All You Need — Annotated Reading Notes with Full Derivations of Multi-Head Self-Attention and Positional Encoding', study.id, true, [tagA, tagB]],
    ['深度學習在自然語言處理中的應用：從詞向量到大型語言模型的完整綜述與實作筆記', sub.id, true, [tagA]],
    ['機械学習のための線形代数入門 — 固有値分解と特異値分解の直感的理解', sub.id, false, []],
    ['Quarterly report', work.id, false, [tagB]],
    ['A', null, false, []],
    ['The Structure of Scientific Revolutions (50th Anniversary Edition) chapter summaries', null, false, [tagA, tagB]],
    ['會議紀錄 2026-10-28', work.id, false, []],
    ['Lecture 07 — Bayesian inference, conjugate priors, MCMC', study.id, false, []],
    ['Reading list', null, false, []],
    ['한국어 문법 정리: 조사와 어미의 쓰임', null, false, []],
    ['Thesis draft v12 FINAL (really final) — supervisor comments merged', study.id, true, [tagB]],
    ['Onboarding handbook', work.id, false, []],
  ];
  for (const [i, [title, folderId, pinned, tags]] of docs.entries()) {
    const p = join(dir, `doc-${i}.md`);
    await writeFile(p, `# ${title}\n\n${'Body text for the window.document. 本文。'.repeat(40 + i * 30)}`);
    await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, p);
    const d = await call('documents:import', { folderId });
    await page.waitForFunction(async id => (await window.desktop.invoke('documents:list', {})).find(x => x.id === id)?.status === 'ready', d.id, { timeout: 30000 });
    if (d.title !== title) await call('library:documents:rename', { documentId: d.id, title });
    if (pinned) await call('library:documents:pin', { documentId: d.id, pinned: true });
    for (const t of tags) await call('library:documents:tag', { documentId: d.id, tagId: t.id, assigned: true });
  }

 const quick=process.env.UI3_QUICK==='1';
 for(const language of quick?['en']:['en','zh-Hant','ja']) for(const theme of ['light','dark']) for(const width of quick?[960]:[960,1280,1600]) for(const scale of [1,2]) {
  const context={language,theme,width,scale};
  await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setContentSize(width,width===960?640:800),width);
  await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  const settings=await call('settings:get',{});await call('settings:set',{...settings,language,uiScale:scale*100});
  await page.evaluate(()=>window.localStorage.setItem('vstudy-route',JSON.stringify({view:'library'})));await page.reload();await page.locator('.library-document').first().waitFor();
  if(width===960&&scale===2) {
   await page.waitForFunction(()=>window.document.querySelector('.app-shell').dataset.sidebarOverlay==='true'&&window.document.querySelector('.shell-sidebar').hidden);
   const toolbar=await page.locator('.library-toolbar').evaluate(e=>{const controls=[...e.querySelectorAll('button,input')].filter(c=>c.getClientRects().length);return controls.map(c=>parseFloat(window.getComputedStyle(c).fontSize));});
   assert.ok(Math.min(...toolbar)>=Math.max(...toolbar)*.75,JSON.stringify({context,toolbar}));
   const toolbarRows=await page.locator('.library-toolbar button').evaluateAll(buttons=>buttons.filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().top));assert.ok(Math.max(...toolbarRows)-Math.min(...toolbarRows)<=1,JSON.stringify({context,toolbarRows}));

  }
  const geometry=await page.evaluate(()=>{
   const errors=[];let rows=0;
   for(const row of window.document.querySelectorAll('.library-document')) {
    rows++;const r=row.getBoundingClientRect();const cells=[...row.children].filter(e=>window.getComputedStyle(e).display!=='none');
    if(row.scrollHeight>row.clientHeight+1)errors.push('row scrollHeight');
    for(const cell of cells) {const c=cell.getBoundingClientRect();if(c.bottom>r.bottom+1||c.top<r.top-1||c.left<r.left-1||c.right>r.right+1)errors.push('clipped '+cell.className);if(!/title|tags|folder/.test(cell.className)&&cell.scrollWidth>cell.clientWidth+1)errors.push('overflow '+cell.className);}
    for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){const a=cells[i].getBoundingClientRect(),b=cells[j].getBoundingClientRect();if(Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top))errors.push('overlap');}
    if(Math.abs(r.height-2.75*parseFloat(window.getComputedStyle(window.document.documentElement).fontSize))>1)errors.push('height');
    const container=window.document.querySelector('.library-results').clientWidth,rem=parseFloat(window.getComputedStyle(window.document.documentElement).fontSize);
    for(const [name,limit]of [['tags',68],['folder',52],['size',44],['added',36],['type',28]])if((window.getComputedStyle(row.querySelector('.document-'+name)).display==='none')!==(container<limit*rem))errors.push('collapse '+name);
    if(row.querySelector('.document-title-cell').getBoundingClientRect().width<12*rem-1)errors.push('title minimum');
    const button=row.querySelector('.document-title'),style=window.getComputedStyle(button);if(style.borderTopWidth!=='0px'||style.backgroundColor!=='rgba(0, 0, 0, 0)')errors.push('title chrome');
   }return{rows,errors};
  });assert.deepEqual(geometry.errors,[],JSON.stringify(context));
  await page.locator('.library-document').first().hover();await page.waitForFunction(()=>window.getComputedStyle(window.document.querySelector('.document-actions')).opacity==='1');assert.equal(await page.locator('.document-actions').first().evaluate(e=>window.getComputedStyle(e).opacity),'1');
  await page.locator('.library-document').first().focus();await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>{const row=window.document.querySelector('.library-document[data-index="1"]');return row===window.document.activeElement&&window.getComputedStyle(row.querySelector('.document-actions')).opacity==='1';});assert.equal(await page.locator('.library-document:focus .document-actions').evaluate(e=>window.getComputedStyle(e).opacity),'1');
  const folderWidth=await page.locator('.document-folder').first().evaluate(e=>({visible:window.getComputedStyle(e).display!=='none',width:e.getBoundingClientRect().width,tags:window.getComputedStyle(e.previousElementSibling).display,rem:parseFloat(window.getComputedStyle(window.document.documentElement).fontSize)}));
  if(folderWidth.visible&&folderWidth.tags==='none')assert.ok(folderWidth.width>10*folderWidth.rem,JSON.stringify({context,folderWidth}));
  await page.locator('.library-document').first().click({position:{x:4,y:10}});
  const audit=async(state)=>{const result=await new AxeBuilder({page}).setLegacyMode(true).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice']).analyze();checks.push({...context,state,rows:geometry.rows,violations:result.violations});assert.deepEqual(result.violations,[],JSON.stringify({...context,state}));};
  const selectedStyle=await page.locator('.library-document').first().evaluate(e=>{const s=window.getComputedStyle(e);return [s.boxShadow,s.borderLeftWidth,s.outlineStyle];});assert.deepEqual(selectedStyle,['none','0px','none']);
  const bulkType=await page.locator('.bulk-bar').evaluate(e=>[...e.querySelectorAll('button,span[role=status]')].map(c=>parseFloat(window.getComputedStyle(c).fontSize)));
  assert.ok(Math.min(...bulkType)>=Math.max(...bulkType)*.75,JSON.stringify({context,bulkType}));
  const bulkClipping=await page.locator('.bulk-bar').evaluate(bar=>{const bounds=bar.getBoundingClientRect();return [...bar.children].some(e=>{const r=e.getBoundingClientRect();return r.left<bounds.left-1||r.right>bounds.right+1||r.top<bounds.top-1||r.bottom>bounds.bottom+1||e.scrollWidth>e.clientWidth+1;});});assert.equal(bulkClipping,false,JSON.stringify(context));

  await page.waitForFunction(()=>parseFloat(window.getComputedStyle(window.document.querySelector('.library-results')).paddingBottom)+1>=window.document.querySelector('.bulk-bar').getBoundingClientRect().height+24);
  await page.locator('.library-results').evaluate(async e=>{await new Promise(resolve=>window.requestAnimationFrame(resolve));e.scrollTop=e.scrollHeight;await new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve)));});
  const bulkGeometry=await page.evaluate(()=>{const bar=window.document.querySelector('.bulk-bar').getBoundingClientRect(),viewport=window.document.querySelector('.library-results'),rows=[...viewport.querySelectorAll('.library-document')];return {scrollTop:viewport.scrollTop,scrollHeight:viewport.scrollHeight,clientHeight:viewport.clientHeight,bar:bar.toJSON(),lastRect:rows.at(-1)?.getBoundingClientRect().toJSON(),last:rows.at(-1)?.getAttribute('aria-posinset'),intersections:rows.filter(row=>{const r=row.getBoundingClientRect();return Math.min(r.right,bar.right)>Math.max(r.left,bar.left)&&Math.min(r.bottom,bar.bottom)>Math.max(r.top,bar.top);}).length,padding:parseFloat(window.getComputedStyle(viewport).paddingBottom),height:bar.height};});
  assert.equal(bulkGeometry.last,'12',JSON.stringify({context,bulkGeometry}));assert.equal(bulkGeometry.intersections,0,JSON.stringify({context,bulkGeometry}));assert.ok(bulkGeometry.padding+1>=bulkGeometry.height+24);
  await page.locator('.library-results').evaluate(e=>{e.scrollTop=0;});
  await audit('library-selected');await page.locator('.library-document').first().click({button:'right'});await page.getByRole('menu').waitFor();await audit('library-menu');await page.getByTestId('document-details').click();await page.locator('.document-details').waitFor();await audit('library-details');await page.keyboard.press('Escape');
  const shot=async(state)=>{const data=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(`${out}/${language}-${theme}-${width}-${scale}-${state}.png`,Buffer.from(data,'base64'));};
  await page.locator('.library-title h1').hover();await shot('library');
  await page.evaluate(()=>window.dispatchEvent(new window.Event('vstudy:open-settings')));await page.locator('.settings-dialog').waitFor();let dialogSize;
  for(const section of ['general','appearance','providers','usage','privacy']) {
   await page.locator('.settings-tabs [role=tab]').nth(['general','appearance','providers','usage','privacy'].indexOf(section)).click();
   const layout=await page.evaluate(()=>{const d=window.document.querySelector('.settings-dialog'),p=window.document.querySelector('.settings-pane:not([hidden])'),r=d.getBoundingClientRect();return {w:r.width,h:r.height,overflow:d.scrollWidth>d.clientWidth+1||p.scrollWidth>p.clientWidth+1,viewport:r.left>=0&&r.top>=0&&r.right<=window.innerWidth+1&&r.bottom<=window.innerHeight+1,nested:d.querySelectorAll('.settings-card .settings-card').length,rowsOverlap:[...p.querySelectorAll('.settings-row')].some(row=>{const label=row.querySelector('.settings-label'),control=row.querySelector('.settings-control');if(!label||!control)return false;const a=label.getBoundingClientRect(),b=control.getBoundingClientRect();return Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);})};});
   assert.equal(layout.overflow,false,JSON.stringify({...context,section,layout}));assert.equal(layout.viewport,true);assert.equal(layout.nested,0);assert.equal(layout.rowsOverlap,false);if(dialogSize)assert.deepEqual([layout.w,layout.h],dialogSize);else dialogSize=[layout.w,layout.h];
   if(section==='usage') {
    await page.locator('.usage-settings input').first().waitFor();
    assert.equal(await page.locator('.usage-dashboard').evaluate(e=>!!e.closest('.settings-card')),true);
    const usageSpacing=await page.locator('.settings-pane:not([hidden])').evaluate(p=>({heading:parseFloat(window.getComputedStyle(p.querySelector('.settings-section-header')).marginBottom),gap:parseFloat(window.getComputedStyle(p.querySelector('.usage-settings')).rowGap),groupMargins:[...p.querySelectorAll('.usage-settings > .settings-group')].map(e=>parseFloat(window.getComputedStyle(e).marginTop))}));
    assert.equal(usageSpacing.heading,usageSpacing.gap);assert.deepEqual(usageSpacing.groupMargins,[0,0,0]);
   }
   if(section==='privacy')assert.equal(await page.locator('[data-testid=privacy-settings] .settings-group').first().evaluate(e=>e.querySelector('h3').textContent===e.querySelector('.settings-label > div').textContent),false);

   if(section==='general') {
    const reply=await page.getByTestId('replyLanguage').evaluate(e=>{const text=e.querySelector('[data-slot=select-value]');return {width:e.getBoundingClientRect().width,font:parseFloat(window.getComputedStyle(window.document.documentElement).fontSize),clipped:!!text&&text.scrollWidth>text.clientWidth+1};});
    assert.ok(reply.width>=16*reply.font-1,JSON.stringify({context,reply}));assert.equal(reply.clipped,false);
   }
   if(section==='appearance') {
    const appearance=await page.evaluate(()=>{const pane=window.document.querySelector('.settings-pane:not([hidden])'),control=pane.querySelector('.settings-control'),preview=pane.querySelector('.appearance-preview'),items=[...pane.querySelectorAll('[data-slot=toggle-group-item]')];return {firstControl:control.getBoundingClientRect().bottom<=pane.getBoundingClientRect().bottom,previewAfter:preview.getBoundingClientRect().top>control.getBoundingClientRect().top,wrapped:items.some(e=>e.scrollHeight>e.clientHeight+1)};});
    if(scale===1)assert.equal(await page.locator('.appearance-layout .settings-row').evaluateAll(rows=>rows.every(row=>{const a=row.querySelector('.settings-label').getBoundingClientRect(),b=row.querySelector('.settings-control').getBoundingClientRect();return Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2)<=1;})),true,JSON.stringify(context));
    assert.equal(appearance.firstControl,true,JSON.stringify({context,appearance}));assert.equal(appearance.previewAfter,true);assert.equal(appearance.wrapped,false);
   }
   const repeated=await page.locator('.settings-pane:not([hidden])').evaluate(p=>[...p.querySelectorAll('.settings-row')].some(row=>{const label=row.querySelector('.settings-label > div')?.textContent?.trim();return label&&[...row.querySelectorAll('button')].some(button=>button.textContent?.trim()===label); }));
   if(section==='general')assert.equal(repeated,false,JSON.stringify({context,section}));
   const textSizes=await page.locator('.settings-pane:not([hidden])').evaluate(p=>[...p.querySelectorAll('button,input,textarea')].filter(e=>e.getClientRects().length&&(e.textContent?.trim()||e instanceof window.HTMLInputElement||e instanceof window.HTMLTextAreaElement)&&!e.querySelector('svg')&&e.getAttribute('role')!=='radio').map(e=>({text:e.textContent?.slice(0,24),size:parseFloat(window.getComputedStyle(e).fontSize),base:parseFloat(window.getComputedStyle(p.querySelector('.settings-label')??p).fontSize)})));
   assert.deepEqual(textSizes.filter(s=>s.size<s.base*.75),[],JSON.stringify({context,section,textSizes}));
   await audit(section);await shot(section);
   await page.locator('.settings-pane:not([hidden])').evaluate(e=>{e.scrollTop=e.scrollHeight;});
   const bottom=await page.locator('.settings-pane:not([hidden])').evaluate(e=>{const content=e.querySelector('.settings-pane-inner'),last=content.lastElementChild;return {bottom:last.getBoundingClientRect().bottom,viewport:e.getBoundingClientRect().bottom,padding:parseFloat(window.getComputedStyle(e).paddingBottom)};});
   assert.ok(bottom.bottom<=bottom.viewport-bottom.padding+1,JSON.stringify({context,section,bottom}));
   const lastRow=page.locator('.settings-pane:not([hidden]) .settings-row:visible').last();
   await lastRow.evaluate(e=>e.scrollIntoView({block:'end'}));
   const lastRowBounds=await lastRow.evaluate(e=>{const r=e.getBoundingClientRect(),p=e.closest('.settings-pane').getBoundingClientRect(),card=e.closest('.settings-card').getBoundingClientRect();return {top:r.top,bottom:r.bottom,paneTop:p.top,paneBottom:p.bottom,cardBottom:card.bottom};});
   assert.ok((lastRowBounds.bottom-lastRowBounds.top>lastRowBounds.paneBottom-lastRowBounds.paneTop||lastRowBounds.top>=lastRowBounds.paneTop-1)&&lastRowBounds.bottom<=lastRowBounds.paneBottom+1&&lastRowBounds.bottom<=lastRowBounds.cardBottom+1,JSON.stringify({context,section,lastRowBounds}));
   await shot(section+'-bottom');

  }
  await page.keyboard.press('Escape');
  await page.locator('.library-search input').fill('Body');await page.locator('.search-snippet').first().waitFor();
  const search=await page.locator('.library-document').first().evaluate(e=>({height:e.getBoundingClientRect().height,root:parseFloat(window.getComputedStyle(window.document.documentElement).fontSize),clipped:e.scrollHeight>e.clientHeight}));assert.equal(search.height,search.root*4);assert.equal(search.clipped,false);
 }
 // Exercise the real Appearance controls and verify persistence, rather than only setting tokens in the test.
 await page.evaluate(()=>window.dispatchEvent(new window.Event('vstudy:open-settings')));await page.locator('.settings-tabs [role=tab]').nth(1).click();
 for(const [value,token,expected]of [['125%','--ui-scale','1.25'],['Compact','--density','.875'],['Solid',null,null]]) {
  // Use an English catalog for stable control names across the locale matrix.
  const current=await call('settings:get',{});if(current.language!=='en'){await call('settings:set',{...current,language:'en'});await page.reload();await page.evaluate(()=>window.dispatchEvent(new window.Event('vstudy:open-settings')));await page.locator('.settings-tabs [role=tab]').nth(1).click();}
  await page.getByLabel(value,{exact:true}).click();
  if(token)await page.waitForFunction(({token,expected})=>window.document.documentElement.style.getPropertyValue(token)===expected,{token,expected});
 }
 await page.getByLabel('Large',{exact:true}).click();await page.waitForFunction(()=>window.document.documentElement.style.getPropertyValue('--reader-size')==='1rem');
 await page.getByRole('radio',{name:'Blue',exact:true}).click();await page.waitForFunction(()=>window.document.documentElement.style.getPropertyValue('--accent-h')==='250');
 await page.getByRole('combobox',{name:'Reader font',exact:true}).click();await page.getByRole('option',{name:'Serif',exact:true}).click();await page.waitForFunction(()=>window.document.documentElement.style.getPropertyValue('--font-reader').includes('Georgia'));
 await page.reload();const persisted=await call('settings:get',{});assert.equal(persisted.uiScale,125);assert.equal(persisted.density,'compact');assert.equal(persisted.accent,'blue');assert.equal(persisted.readerFont,'serif');assert.equal(persisted.material,'solid');assert.equal(persisted.readerSize,'l');
 checks.push({state:'appearance-live-persistence',violations:[]});

} finally {await writeFile(`${out}/report.json`,JSON.stringify(checks,null,2));await app?.close();await rm(dir,{recursive:true,force:true});}
console.log(`${checks.length} UI3 geometry/accessibility checks passed; 0 skipped`);
