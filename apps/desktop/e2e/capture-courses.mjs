import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { captureTime, seedCoursesDesign, changeDeadlineOnNextSync } from './fixtures/courses-design.mjs';

const captureEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'ELECTRON_RENDERER_URL'));
const phase=process.env.COURSES_CAPTURE_PHASE ?? 'single-line-final';
const isBefore=phase.startsWith('before');
const narrowOnly=process.env.COURSES_CAPTURE_NARROW_ONLY==='1';
const evidence=resolve('../../docs/evidence/courses/design-pass');
const scratchPath=process.env.COURSES_CAPTURE_SCRATCH ?? tmpdir();
await mkdir(scratchPath,{recursive:true});
const scratch=await realpath(scratchPath);
await mkdir(evidence,{recursive:true});
const profile=await mkdtemp(join(scratch,'courses-profile-'));
const artifact=await mkdtemp(join(scratch,'courses-artifact-'));
const artifactApp=join(artifact,'desktop');
const results={phase,errors:[],audits:[],screens:[]};
let app;
try {
  await mkdir(artifactApp,{recursive:true});
  await cp(resolve('../mcp/dist'),join(artifact,'mcp/dist'),{recursive:true});
  await cp(resolve('build'),join(artifactApp,'build'),{recursive:true});
  await cp(resolve('out'),join(artifactApp,'out'),{recursive:true});
  await cp(resolve('resources'),join(artifactApp,'resources'),{recursive:true});
  await cp(resolve('package.json'),join(artifactApp,'package.json'));
  await symlink(resolve('node_modules'),join(artifactApp,'node_modules'),'dir');
  results.artifact={entrySha256:createHash('sha256').update(await readFile(join(artifactApp,'out/main/index.js'))).digest('hex'),rendererSha256:createHash('sha256').update(await readFile(join(artifactApp,'out/renderer/index.html'))).digest('hex')};
  app=await electron.launch({args:[artifactApp,`--user-data-dir=${profile}`,'--force-device-scale-factor=2'],env:{...captureEnv,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  app.process().stdout.on('data',chunk=>process.stdout.write(chunk));
  app.process().stderr.on('data',chunk=>process.stderr.write(chunk));
  const page=await app.firstWindow();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setMinimumSize(320,320));
  assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile,'Isolated profile is active');
  const cdp=await page.context().newCDPSession(page);
  await page.evaluate(()=>window.desktop.invoke('analytics:setConsent',{enabled:false}));
  page.on('pageerror',error=>results.errors.push(error.message));
  const fixture=await seedCoursesDesign(app,profile);
  await page.clock.setFixedTime(captureTime);
  await page.emulateMedia({reducedMotion:'reduce'});
  const route=async(scheme,language='en')=>{
    await page.evaluate(async({scheme,language})=>{
      const settings=await window.desktop.invoke('settings:get',{});
      await window.desktop.invoke('settings:set',{...settings,themeId:'vstudy',colorScheme:scheme,material:'solid',language,uiScale:100,onboardingCompleted:true,welcomeSeen:true});
      localStorage.setItem('vstudy-route',JSON.stringify({view:'courses'}));
      localStorage.setItem('vstudy-onboarding-v1',JSON.stringify({version:1,step:'start',goal:'school',status:'completed',done:['setup'],dismissed:['courses']}));
    },{scheme,language});
    await page.reload(); await page.locator('.moodle-course-card').first().waitFor();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,right:document.querySelector('.moodle-page').getBoundingClientRect().right,documentWidth:document.documentElement.scrollWidth}));
    assert.ok(viewport.right<=viewport.width && viewport.documentWidth<=viewport.width,'The layout fits inside the real capture viewport');
  };
  const shot=async name=>{const file=`${phase}-${name}.png`;await page.screenshot({path:join(evidence,file),animations:'disabled'});results.screens.push(file);};
  const audit=async name=>{
    const report=await new AxeBuilder({page}).setLegacyMode(true).include('.moodle-page, .updates-inbox').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    const violations=report.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
    results.audits.push({name,violations}); assert.deepEqual(violations,[],name);
  };
  for(const [width,height] of (narrowOnly?[]:[[1280,800],[1100,720]])) {
    await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:false});
    for(const scheme of ['dark','light']) {
      await route(scheme); await shot(`${scheme}-${width}`);
      assert.equal(await page.evaluate(()=>devicePixelRatio),2);
      assert.equal(await page.locator('.moodle-page').evaluate(el=>el.scrollWidth>el.clientWidth),false);
      if(!isBefore) {
        await audit(`${scheme}-${width}-courses`);
        const catalog=await page.locator('.courses-catalog').boundingBox(), due=await page.locator('.moodle-due-section').boundingBox();
        if(width>=1200) {assert.ok(due.x>catalog.x+catalog.width,'Due soon remains to the right');assert.ok(Math.abs(due.y-catalog.y)<4,'Both columns start together');}
        else assert.ok(due.y>=catalog.y+catalog.height,'Due soon stacks below a readable single-line catalog');
        const overview=await page.evaluate(()=>window.desktop.invoke('moodle:overview',{}));
        const counts=await page.locator('.course-unread-count').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.count)));
        assert.equal(counts.reduce((total,count)=>total+count,0),overview.unreadNotifications,'Row unread counts agree with the header and inbox');
        assert.equal(Number(await page.locator('.updates-count').textContent()),overview.unreadNotifications);
        assert.deepEqual((await page.locator('.course-overdue[data-count]:not([data-count="0"])').allTextContents()).sort(),['1','1','2']);
        assert.equal(await page.locator('.course-row-code, .moodle-course-card .moodle-unread').count(),0);
        const alignment=await page.locator('.moodle-due-link').evaluateAll(nodes=>nodes.map(node=>({align:getComputedStyle(node).textAlign,clamp:getComputedStyle(node).webkitLineClamp})));
        assert.ok(alignment.every(item=>item.align==='start' && item.clamp==='2'));
        const firstButton=page.locator('.moodle-course-card h3 button').first();
        results.accessibleRow=await firstButton.ariaSnapshot();
        const descriptionId=await firstButton.getAttribute('aria-describedby');
        assert.equal(await page.locator(`[id="${descriptionId}"]`).textContent(),overview.courses[0].fullName);
      }
    }
  }
  for(const [width,height] of (narrowOnly?[[552,800]]:[[1280,800],[1100,720],[640,800],[552,800]])) {
    await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:false});
    for(const language of ['zh-Hant','en','ja']) for(const scheme of ['dark','light']) {
      await route(scheme,language); await page.mouse.move(0,0);
      const prefix=`rows-${language}-${scheme}-${width}`;
      await shot(`${prefix}-rest`);
      const geometry=await page.locator('.moodle-course-card').evaluateAll(nodes=>nodes.map(node=>{
        const row=node.getBoundingClientRect(), main=node.querySelector('.moodle-card-body'), slots=node.querySelector('.course-counts');
        return {height:row.height,x:row.x,y:row.y,padding:getComputedStyle(node).padding,radius:getComputedStyle(node).borderRadius,titleWidth:node.querySelector('h3 button').getBoundingClientRect().width,headingWidth:node.querySelector('h3').getBoundingClientRect().width,mainWidth:main.getBoundingClientRect().width,aboveFold:row.top>=0 && row.bottom<=innerHeight,slots:slots ? Array.from(slots.children,slot=>({right:slot.getBoundingClientRect().right,width:slot.getBoundingClientRect().width,text:slot.textContent})) : []};
      }));
      results.rowGeometry ??=[]; results.rowGeometry.push({language,scheme,width,viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight})),rows:geometry});
      assert.deepEqual(results.rowGeometry.at(-1).viewport,{width,height},'The renderer has the requested viewport');
      if(!isBefore) {
        const catalogWidth=await page.locator('.courses-catalog').evaluate(node=>node.getBoundingClientRect().width);
        const rowHeight=catalogWidth>=600?40:52;
        results.rowGeometry.at(-1).catalogWidth=catalogWidth;
        results.rowGeometry.at(-1).aboveFold=geometry.filter(row=>row.aboveFold).length;
        assert.ok(geometry.every(row=>row.height===rowHeight && row.padding===(rowHeight===40?'10px 12px':'8px 12px') && row.radius==='8px'),'Rows follow the 40px / 52px container density');
        assert.ok(geometry.every(row=>row.slots.every((slot,index)=>slot.width===56 && slot.right===geometry[0].slots[index].right)),'Two fixed slots align across all rows');
        assert.ok(geometry.every(row=>Math.abs(row.titleWidth-row.headingWidth)<.5),'Course-open fills its heading for ellipsis');
        const headings=await page.locator('.course-column-headings[data-repeat=false] > span').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,right:node.getBoundingClientRect().right,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,fontSize:getComputedStyle(node).fontSize,align:getComputedStyle(node).textAlign})));
        assert.deepEqual(headings.map(heading=>heading.text),{en:['Overdue','Unread'],'zh-Hant':['逾期','未讀'],ja:['期限切れ','未読']}[language]);
        assert.ok(headings.every((heading,index)=>heading.right===geometry[0].slots[index].right && heading.width===56 && heading.height===20 && heading.fontSize==='12px' && heading.align==='end'),'One-line headers align exactly above fixed number slots');
        results.columnHeadings ??=[]; results.columnHeadings.push({language,scheme,width,headings});
        const dividers=await page.evaluate(()=>{
          const sample=document.createElement('span');sample.style.color='var(--hairline)';document.body.append(sample);const hairline=getComputedStyle(sample).color;sample.remove();
          return {hairline,course:getComputedStyle(document.querySelectorAll('.moodle-course-card')[1],'::before').backgroundColor,account:getComputedStyle(document.querySelector('.moodle-account')).borderBottomColor,due:getComputedStyle(document.querySelector('.moodle-due-row')).borderBottomColor,tab:getComputedStyle(document.querySelector('.moodle-term-tabs [data-state=active]')).boxShadow,background:getComputedStyle(document.querySelector('.moodle-page')).backgroundColor,theme:document.documentElement.dataset.theme};
        });
        assert.equal(dividers.course,dividers.hairline);assert.equal(dividers.account,dividers.hairline);assert.equal(dividers.due,dividers.hairline);assert.ok(dividers.tab.includes(dividers.hairline));
        assert.equal(dividers.theme,'vstudy');assert.equal(dividers.background,scheme==='dark'?'rgb(0, 0, 0)':'rgb(255, 255, 255)');
        results.dividers ??=[];results.dividers.push({language,scheme,width,...dividers});
      }
      const row=page.locator('.moodle-course-card').nth(1);
      const first=await page.locator('.moodle-course-card').first().boundingBox();
      const third=await page.locator('.moodle-course-card').nth(2).boundingBox();
      const catalog=await page.locator('.courses-catalog').boundingBox();
      const headingBox=await page.locator('.course-column-headings[data-repeat=false]').boundingBox();
      const clipY=Math.max(0,(headingBox?.y ?? first.y)-4);
      const clip={x:Math.max(0,catalog.x-14),y:clipY,width:Math.min(width-catalog.x+14,catalog.width+28),height:third.y+third.height-clipY+4};
      await row.hover();
      if(!isBefore) {
        const state=await row.evaluate(node=>({height:node.getBoundingClientRect().height,background:getComputedStyle(node).backgroundColor,before:getComputedStyle(node,'::before').opacity,next:getComputedStyle(node.nextElementSibling,'::before').opacity}));
        assert.equal(state.height,geometry[1].height);assert.equal(state.before,'0');assert.equal(state.next,'0');
        assert.equal(state.background,scheme==='dark'?'rgb(36, 36, 36)':'rgb(236, 236, 236)');
      }
      const hoverFile=`${phase}-${prefix}-hover.png`;await page.screenshot({path:join(evidence,hoverFile),clip,animations:'disabled'});results.screens.push(hoverFile);
      if(!isBefore) {
        await page.mouse.down();
        const pressed=await row.evaluate(node=>({height:node.getBoundingClientRect().height,x:node.getBoundingClientRect().x,y:node.getBoundingClientRect().y,background:getComputedStyle(node).backgroundColor}));
        assert.equal(pressed.height,geometry[1].height);assert.equal(pressed.x,geometry[1].x);assert.equal(pressed.y,geometry[1].y);
        assert.notEqual(pressed.background,scheme==='dark'?'rgb(36, 36, 36)':'rgb(236, 236, 236)');
        await page.mouse.move(0,0);await page.mouse.up();
      }
      await page.mouse.move(0,0);await page.keyboard.press('Tab');await row.locator('h3 button').focus();
      assert.equal(await row.locator('h3 button').evaluate(node=>node.matches(':focus-visible')),true);
      if(!isBefore) {
        const outline=await row.evaluate(node=>({width:getComputedStyle(node).outlineWidth,offset:getComputedStyle(node).outlineOffset,height:node.getBoundingClientRect().height}));
        assert.deepEqual(outline,{width:'2px',offset:'-2px',height:geometry[1].height});
        assert.equal(await page.locator('.moodle-page').evaluate(node=>node.scrollWidth>node.clientWidth),false);
        await audit(`${prefix}-focus`);
      }
      const focusFile=`${phase}-${prefix}-focus.png`;await page.screenshot({path:join(evidence,focusFile),clip,animations:'disabled'});results.screens.push(focusFile);
    }
  }
  if(!isBefore && !narrowOnly) {
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1280,800));
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:2,mobile:false});
    for(const language of ['en','zh-Hant','ja']) for(const scheme of ['dark','light']) {
      await route(scheme,language);
      const group=page.locator('.course-view-switch');
      assert.equal(await group.getAttribute('role'),'group');
      assert.equal(await page.locator('.moodle-grid').getAttribute('data-view'),'list','List is the default view');
      const listHeight=await page.locator('.moodle-course-card').first().evaluate(node=>node.getBoundingClientRect().height);
      assert.equal(listHeight,40);
      await group.locator('button').nth(1).focus();await page.keyboard.press('Enter');
      assert.equal(await page.locator('.moodle-grid').getAttribute('data-view'),'cards');
      assert.equal(await group.locator('button').nth(1).getAttribute('aria-pressed'),'true');
      const cards=await page.locator('.moodle-course-card').evaluateAll(nodes=>nodes.slice(0,2).map(node=>node.getBoundingClientRect()));
      assert.ok(cards[1].x>cards[0].x+cards[0].width-1,'Cards sit in two columns');
      assert.equal(await page.locator('.course-heading-row .course-column-headings:visible').count(),2,'Column labels repeat over each card column');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await audit(`cards-${language}-${scheme}`);
      await page.mouse.move(0,0);await shot(`view-cards-${language}-${scheme}`);
      await page.reload();await page.locator('.moodle-course-card').first().waitFor();
      assert.equal(await page.locator('.moodle-grid').getAttribute('data-view'),'cards','The choice survives a reload');
      await page.evaluate(()=>localStorage.setItem('vstudy.courses.view','list'));
      await page.reload();await page.locator('.moodle-course-card').first().waitFor();
      await shot(`view-list-${language}-${scheme}`);
    }
    await route('dark');
    await page.evaluate(()=>localStorage.setItem('vstudy.courses.view','cards'));
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(520,800));
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:520,height:800,deviceScaleFactor:2,mobile:false});
    await page.reload();await page.locator('.moodle-course-card').first().waitFor();
    assert.equal(await page.locator('.course-view-switch').isVisible(),false,'The switch hides below 560px');
    assert.equal(await page.locator('.moodle-grid').evaluate(node=>getComputedStyle(node).display),'flex','Stored cards render as the list when narrow');
    await shot('view-cards-narrow');
    await page.evaluate(()=>localStorage.removeItem('vstudy.courses.view'));
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1280,800));
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:2,mobile:false});
    for(const scheme of ['dark','light']) {
      await route(scheme);
      await page.evaluate(()=>localStorage.setItem('vstudy-onboarding-v1',JSON.stringify({version:1,step:'start',goal:'school',status:'completed',done:['setup'],dismissed:[]})));
      await page.reload();await page.locator('.context-coach').waitFor();
      const hint=await page.locator('.context-coach').boundingBox();
      assert.ok(hint.height<=48,`The first-run hint is a compact strip (${hint.height}px)`);
      await shot(`hint-${scheme}`);
      await page.getByRole('button',{name:'Dismiss this tip permanently'}).click();
      assert.equal(await page.locator('.context-coach').count(),0,'Dismissing removes the hint');
    }
    const firstPinId=fixture.details[5].course.id, secondPinId=fixture.details[7].course.id;
    const rowFor=id=>page.locator(`[data-course-id="${id}"]`);
    for(const language of ['zh-Hant','en']) for(const scheme of ['dark','light']) {
      await route(scheme,language);
      for(const id of [firstPinId,secondPinId]) {
        const pin=rowFor(id).locator('.course-pin');await pin.focus();
        assert.equal(await pin.evaluate(node=>getComputedStyle(node).opacity),'1');
        await page.keyboard.press('Space');
        await page.waitForFunction(id=>document.querySelector(`[data-course-id="${id}"] .course-pin`)?.getAttribute('aria-pressed')==='true',id);
        assert.equal(await pin.evaluate(node=>node===document.activeElement),true,'Keyboard focus stays on the pin after its row moves');
      }
      await page.evaluate(()=>document.activeElement?.blur());await page.mouse.move(0,0);
      await shot(`pinned-${language}-${scheme}`);await audit(`pinned-${language}-${scheme}`);
      assert.deepEqual((await page.locator('.moodle-course-card').evaluateAll(nodes=>nodes.slice(0,2).map(node=>node.dataset.courseId))),[firstPinId,secondPinId]);
      await rowFor(secondPinId).hover();await shot(`pin-hover-${language}-${scheme}`);
      await page.mouse.move(0,0);await page.keyboard.press('Tab');await rowFor(firstPinId).locator('.course-pin').focus();await shot(`pin-focus-${language}-${scheme}`);
      await page.reload();await rowFor(firstPinId).waitFor();
      assert.equal(await rowFor(firstPinId).locator('.course-pin').getAttribute('aria-pressed'),'true');
      for(const id of [firstPinId,secondPinId]) {await rowFor(id).locator('.course-pin').focus();await page.keyboard.press('Space');await page.waitForFunction(id=>document.querySelector(`[data-course-id="${id}"] .course-pin`)?.getAttribute('aria-pressed')==='false',id);}
    }
    await route('dark');
    const beforeOrder=await page.locator('.moodle-course-card').evaluateAll(nodes=>nodes.map(node=>node.dataset.courseId));
    const syncId=fixture.details[6].course.id;
    await changeDeadlineOnNextSync(app,profile,syncId,new Date(captureTime+3600000).toISOString());
    await rowFor(syncId).locator('.course-open').focus();
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>{
      window.__courseMoveFrames=[];
      const sample=()=>{
        const rows=[...document.querySelectorAll('[data-course-id]')];
        const moves=rows.flatMap(row=>row.getAnimations().filter(animation=>animation.effect?.getKeyframes().some(frame=>frame.transform)).map(animation=>({id:row.dataset.courseId,duration:animation.effect.getTiming().duration,easing:animation.effect.getTiming().easing,transform:getComputedStyle(row).transform})));
        if(moves.length)window.__courseMoveFrames.push(moves);
        if(window.__courseMoveFrames.length<12)window.__courseMoveRaf=requestAnimationFrame(sample);
      };window.__courseMoveRaf=requestAnimationFrame(sample);
      document.querySelector('.moodle-account button').click();
    });
    await page.waitForFunction(id=>document.querySelector('[data-course-id]')?.getAttribute('data-course-id')===id,syncId);
    assert.equal(await rowFor(syncId).locator('.course-open').evaluate(node=>node===document.activeElement),true);
    await page.waitForFunction(()=>!document.querySelector('.moodle-account button').disabled);
    assert.equal(await page.locator('.moodle-banner[role=alert]').count(),0,'Simulated sync completes without an error banner');
    await page.waitForFunction(()=>window.__courseMoveFrames.length>0);
    results.smartSyncFrames=[];
    const syncBox=await page.locator('.courses-catalog').boundingBox();
    for(let frame=0;frame<8;frame++) {
      const file=`${phase}-smart-sync-frame-${frame}.png`;
      await page.screenshot({path:join(evidence,file),clip:{x:syncBox.x-12,y:syncBox.y,width:syncBox.width+24,height:Math.min(syncBox.height,800-syncBox.y)}});
      results.smartSyncFrames.push(file);
    }
    await shot('smart-after-sync');
    results.smartSync={before:beforeOrder,after:await page.locator('.moodle-course-card').evaluateAll(nodes=>nodes.map(node=>node.dataset.courseId)),moves:await page.evaluate(()=>{cancelAnimationFrame(window.__courseMoveRaf);return window.__courseMoveFrames;})};
    assert.ok(results.smartSync.moves.length>0,'FLIP transforms were sampled during the real sync reorder');
    assert.ok(results.smartSync.moves.flat().every(move=>move.duration===180 && move.easing==='ease-out'));
    await page.emulateMedia({reducedMotion:'reduce'});
    await rowFor(firstPinId).locator('.course-pin').focus();await page.keyboard.press('Space');
    await page.waitForFunction(id=>document.querySelector('[data-course-id]')?.getAttribute('data-course-id')===id,firstPinId);
    assert.equal(await page.locator('.moodle-course-card').evaluateAll(nodes=>nodes.flatMap(node=>node.getAnimations()).filter(animation=>animation.effect?.getKeyframes().some(frame=>frame.transform)).length),0);
    await rowFor(firstPinId).locator('.course-pin').focus();await page.keyboard.press('Space');
    await page.waitForFunction(id=>document.querySelector('[data-course-id]')?.getAttribute('data-course-id')===id,syncId);
    await page.locator('.course-sort').click();await page.getByRole('option',{name:'Name',exact:true}).click();
    await shot('sort-name');await page.reload();await page.locator('.course-sort').waitFor();assert.equal(await page.locator('.course-sort').textContent(),'Name');
    await page.locator('.course-sort').click();await page.getByRole('option',{name:'Smart',exact:true}).click();
    await route('light');
    await page.emulateMedia({contrast:'more'});
    const strongDivider=await page.locator('.moodle-course-card').nth(1).evaluate(node=>getComputedStyle(node,'::before').backgroundColor);
    assert.equal(strongDivider,await page.locator('.course-title').first().evaluate(node=>getComputedStyle(node).color));
    await shot('contrast-more-courses');
    await page.emulateMedia({contrast:'no-preference',forcedColors:'active'});
    assert.equal(await page.locator('.moodle-course-card').nth(1).evaluate(node=>getComputedStyle(node,'::before').backgroundColor),await page.locator('.course-title').first().evaluate(node=>getComputedStyle(node).color));
    await shot('forced-colors-courses');
    await page.emulateMedia({forcedColors:'none'});
    for(const scheme of ['light','dark']) {
      await route(scheme);
      await page.locator('.updates-entry').click(); await page.locator('.updates-inbox').waitFor();
      const borders=await page.locator('.updates-group li').first().evaluate(node=>({row:getComputedStyle(node).borderBottomColor,toolbar:getComputedStyle(document.querySelector('.updates-toolbar')).borderBottomColor}));
      assert.equal(borders.row,borders.toolbar);
      results.inboxDividers ??=[];results.inboxDividers.push({scheme,...borders});
      await shot(scheme==='dark'?'updates':'updates-light'); await audit(`updates-${scheme}`);
    }
    for(const group of ['yesterday','earlier']) {
      await page.locator(`#updates-${group}`).evaluate(node=>{const list=node.closest('.updates-list');list.scrollTop=node.offsetTop-list.offsetTop;});
      await shot(`updates-${group}`);
    }
    await page.locator('.updates-list').evaluate(node=>{node.scrollTop=0;});
    await page.locator('.moodle-page').evaluate(node=>{node.scrollTop=0;});
    assert.equal(await page.locator('.update-open').count(),fixture.details.flatMap(detail=>detail.notifications).length);
    const firstUnread=page.locator('.updates-list [data-unread=true] .update-open').first();
    const openedId=await firstUnread.locator('..').getAttribute('data-update-id');
    await firstUnread.focus(); await page.keyboard.press('Enter');
    await page.locator('.updates-inbox[aria-busy=false]').waitFor();
    assert.equal((await page.evaluate(()=>window.desktop.invoke('moodle:overview',{}))).summaries.flatMap(d=>d.notifications).find(n=>n.id===openedId).read,true);
    await shot('item-open'); await audit('item-open');
    await page.locator('.updates-toolbar').getByRole('button',{name:/^Unread/}).click();
    assert.equal(await page.locator('.updates-list [data-unread=false]').count(),0);
    await shot('unread');
    const first=page.locator('.update-open').first();await first.focus();await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('.update-open').nth(1).evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('m'); await page.locator('.updates-inbox[aria-busy=false]').waitFor();
    await page.getByRole('button',{name:'Mark all as read',exact:true}).click();
    await page.locator('.updates-empty').waitFor(); await shot('empty'); await audit('empty');
    await page.locator('.updates-inbox').getByRole('button',{name:'Courses',exact:true}).click();
    assert.deepEqual(await page.locator('.moodle-course-card').evaluateAll(nodes=>nodes.map(node=>node.dataset.courseId)),results.smartSync.after,'Read-state changes do not reorder courses under the pointer');
    await page.reload(); await page.locator('.updates-entry').waitFor();
    assert.equal((await page.evaluate(()=>window.desktop.invoke('moodle:overview',{}))).unreadNotifications,0);
    await page.locator('.updates-entry').click(); await page.locator('.update-toggle').first().click();
    await page.locator('.updates-inbox[aria-busy=false]').waitFor();
    assert.equal((await page.evaluate(()=>window.desktop.invoke('moodle:overview',{}))).unreadNotifications,1);
    await page.reload(); await page.locator('.updates-entry').waitFor();
    assert.equal((await page.evaluate(()=>window.desktop.invoke('moodle:overview',{}))).unreadNotifications,1);
    for(const language of ['zh-Hant','ja']) {
      await route('light',language); await shot(`${language}-courses`); await audit(`${language}-courses`);
      await page.locator('.updates-entry').click(); await shot(`${language}-updates`); await audit(`${language}-updates`);
    }
    await route('dark');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(720,720));
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:720,height:720,deviceScaleFactor:2,mobile:false});
    await page.locator('.moodle-course-card h3 button').first().click(); await page.locator('.moodle-tabs [role=tablist]').waitFor();
    const scroller=page.locator('.moodle-tabs [role=tablist]');
    await scroller.evaluate(node=>node.scrollIntoView({block:'center'}));
    assert.ok(await scroller.evaluate(node=>node.scrollWidth>node.clientWidth),'Course tabs have real horizontal overflow at 720px');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await scroller.evaluate(node=>{node.scrollLeft=0;});
    await page.waitForTimeout(220);
    await shot('scroll-start');
    const box=await scroller.boundingBox();
    const clip={x:box.x,y:box.y-4,width:box.width,height:box.height+8};
    results.scrollFrames=[];
    const began=performance.now();
    for(let frame=0;frame<8;frame++) {
      if(frame===1) await scroller.evaluate(node=>{node.scrollLeft=(node.scrollWidth-node.clientWidth)*.5;});
      const state=await scroller.evaluate(node=>({left:node.scrollLeft,range:node.scrollWidth-node.clientWidth,maskPosition:getComputedStyle(node).maskPosition,scrollbar:getComputedStyle(node).scrollbarWidth,webkitScrollbar:getComputedStyle(node,'::-webkit-scrollbar').display}));
      const file=`${phase}-scroll-frame-${frame}.png`;
      await page.screenshot({path:join(evidence,file),clip});
      results.scrollFrames.push({file,elapsedMs:Math.round(performance.now()-began),...state});
    }
    await shot('scroll-middle');
    const middle=await scroller.evaluate(node=>({start:node.style.getPropertyValue('--mask-start'),end:node.style.getPropertyValue('--mask-end')}));
    assert.equal(middle.start,'0px'); assert.equal(middle.end,'-40px');
    assert.ok(results.scrollFrames.every(frame=>frame.scrollbar==='none' && frame.webkitScrollbar==='none'));
    await scroller.evaluate(node=>{node.scrollLeft=node.scrollWidth;}); await page.waitForTimeout(220);await shot('scroll-end');
    assert.equal(await scroller.evaluate(node=>node.style.getPropertyValue('--mask-end')),'0px');
    await scroller.focus(); assert.equal(await scroller.evaluate(node=>node===document.activeElement || node.contains(document.activeElement)),true);
    await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});
    assert.equal(await scroller.evaluate(node=>getComputedStyle(node).maskImage),'none');
    await shot('high-contrast-tabs');
    await page.emulateMedia({forcedColors:'none',reducedMotion:'reduce'});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1280,800));
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:2,mobile:false});
    await route('dark');
    await page.evaluate(async()=>{const overview=await window.desktop.invoke('moodle:overview',{});for(const item of overview.summaries.flatMap(summary=>summary.notifications).filter(item=>!item.read)) await window.desktop.invoke('moodle:mark-read',{notificationId:item.id});});
    await app.evaluate((_electron,{profile,template})=>{
      const {DatabaseSync}=process.getBuiltinModule('node:sqlite'), db=new DatabaseSync(profile+'/vstudy.sqlite');
      for(let index=0;index<120;index++) {
        const item={...template,id:`dd000000-0000-4000-a000-${String(index).padStart(12,'0')}`,read:false,subject:`Fictional discussion reply ${index+1}`};
        db.prepare('INSERT INTO moodle_notifications(id,remoteId,accountId,data) VALUES (?,?,?,?)').run(item.id,9000+index,item.accountId,JSON.stringify(item));
      }
      db.close();
    },{profile,template:fixture.details[0].notifications[0]});
    await page.reload();await page.locator(`[data-course-id="${fixture.details[0].course.id}"] .course-unread-count`).waitFor();
    assert.equal(await page.locator(`[data-course-id="${fixture.details[0].course.id}"] .course-unread-count`).textContent(),'99+');
    assert.equal(await page.locator(`[data-course-id="${fixture.details[0].course.id}"] .course-unread-count`).getAttribute('title'),'120 unread updates');
    assert.equal(await page.locator('.updates-count').textContent(),'120');
    results.cappedRow=await page.locator(`[data-course-id="${fixture.details[0].course.id}"] .course-open`).ariaSnapshot();
    assert.ok(results.cappedRow.includes('120 unread') && !results.cappedRow.includes('99+'));
    await shot('count-cap');await audit('count-cap');
    results.persistence='Read, mark all, local unread, and reload use the real main IPC and SQLite';
  }
  assert.deepEqual(results.errors,[]);
  results.result='PASS';
  console.log(JSON.stringify(results,null,2));
} catch(error) {
  results.result='FAIL';results.failure=String(error);throw error;
} finally {
  results.reviewPanels=[];
  for(const {language,scheme,width} of results.rowGeometry ?? []) {
    const prefix=`${phase}-rows-${language}-${scheme}-${width}`;
    if(!['rest','hover','focus'].every(state=>results.screens.includes(`${prefix}-${state}.png`))) continue;
    const buffers=await Promise.all(['rest','hover','focus'].map(state=>sharp(join(evidence,`${prefix}-${state}.png`)).resize({width:720}).png().toBuffer()));
    const sizes=await Promise.all(buffers.map(buffer=>sharp(buffer).metadata()));
    const file=`${prefix}-review.png`;
    await sharp({create:{width:1440,height:Math.max(sizes[0].height,sizes[1].height+sizes[2].height),channels:3,background:scheme==='dark'?'#000':'#fff'}}).composite([{input:buffers[0],left:0,top:0},{input:buffers[1],left:720,top:0},{input:buffers[2],left:720,top:sizes[1].height}]).png().toFile(join(evidence,file));
    results.reviewPanels.push(file);
  }
  results.stateReviews=[];
  const states=results.screens.filter(file=>!file.includes('-rows-'));
  for(let start=0;start<states.length;start+=4) {
    const tiles=await Promise.all(states.slice(start,start+4).map(file=>sharp(join(evidence,file)).resize({width:720}).png().toBuffer()));
    const sizes=await Promise.all(tiles.map(tile=>sharp(tile).metadata())),height=Math.max(...sizes.map(size=>size.height));
    const file=`${phase}-state-review-${start/4}.png`;
    await sharp({create:{width:1440,height:height*2,channels:3,background:'#777'}}).composite(tiles.map((input,index)=>({input,left:index%2*720,top:Math.floor(index/2)*height}))).png().toFile(join(evidence,file));
    results.stateReviews.push(file);
  }
  if(results.smartSyncFrames?.length) {
    const tiles=await Promise.all(results.smartSyncFrames.map(file=>sharp(join(evidence,file)).resize({width:720}).png().toBuffer()));
    const sizes=await Promise.all(tiles.map(tile=>sharp(tile).metadata())),height=Math.max(...sizes.map(size=>size.height));
    results.smartSyncReview=`${phase}-smart-sync-review.png`;
    await sharp({create:{width:1440,height:height*4,channels:3,background:'#111'}}).composite(tiles.map((input,index)=>({input,left:index%2*720,top:Math.floor(index/2)*height}))).png().toFile(join(evidence,results.smartSyncReview));
  }
  if(results.scrollFrames?.length) {
    const lines=['# Scroll fade frames','','Measured. The course tabs move from the start to the middle. Both scrollbar styles remain hidden.',''];
    for(const [index,frame] of results.scrollFrames.entries()) lines.push(`Measured. Frame ${index} at ${frame.elapsedMs} ms. Mask position ${frame.maskPosition}.`,'',`![Scroll frame ${index}](${frame.file})`,'');
    lines.push(`Measured. The settled middle is [scroll-middle](${phase}-scroll-middle.png). The endpoint is [scroll-end](${phase}-scroll-end.png).`,'');
    await writeFile(join(evidence,'scroll-fade-frames.md'),lines.join('\n'));
    const frames=await Promise.all(results.scrollFrames.map(frame=>sharp(join(evidence,frame.file)).resize({width:960}).png().toBuffer()));
    const frameSizes=await Promise.all(frames.map(frame=>sharp(frame).metadata()));
    let top=0;const composite=frames.map((input,index)=>{const item={input,left:0,top};top+=frameSizes[index].height+8;return item;});
    results.scrollFrameReview=`${phase}-scroll-frames-review.png`;
    await sharp({create:{width:960,height:top,channels:3,background:'#111'}}).composite(composite).png().toFile(join(evidence,results.scrollFrameReview));
  }
  await writeFile(join(evidence,`${phase}-verification.json`),JSON.stringify(results,null,2)+'\n');
  await app?.close(); await rm(profile,{recursive:true,force:true}); await rm(artifact,{recursive:true,force:true});
}
