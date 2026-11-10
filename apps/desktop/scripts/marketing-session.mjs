/** Shared Electron launch, seeding, navigation and capture for marketing-shots and ui-shots. Disposable profile, synthetic data, no remote services. */
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { seedMarketing, captureTime } from './marketing-seed.mjs';
import { installMarketingMoodle } from './marketing-webview.mjs';

export { captureTime };
export const viewport = {width:1440,height:900};
export const aliases = {'document-figures':'figures','original-page':'original','capture-to-chat':'capture','usage-settings':'usage','connect-ai':'connect-ai',school:'school','courses-home':'courses','course-page':'course','planner-today':'planner','reader-chat-with-answer':'reader','history-search':'history',library:'library',home:'home','themes-settings':'themes','moodle-webview':'webview','storage-settings':'storage','onboarding-welcome':'onboarding'};

export async function launchMarketing({desktop,directory,scale=2}) {
  const errors = [];
  const app = await electron.launch({args:[desktop,`--user-data-dir=${directory}`,`--force-device-scale-factor=${scale}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',HOME:directory,XDG_CONFIG_HOME:directory,VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  let moodle;
  try {
    const page = await app.firstWindow();
    page.on('pageerror',error=>errors.push(error.message));
    await page.clock.setFixedTime(captureTime);
    await page.emulateMedia({reducedMotion:'reduce'});
    await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height),viewport);
    const {fixture,documents,pdf,call} = await seedMarketing(app,page,directory);
    moodle = await installMarketingMoodle(app,directory,desktop,fixture);
    // The shell flushes its tab set on pagehide and prefers it to the legacy route key, so install the route after that flush.
    await page.addInitScript(()=>{
      const route=window.sessionStorage.getItem('shot-route');
      if(route===null) return;
      window.sessionStorage.removeItem('shot-route');
      window.localStorage.removeItem('vstudy-tabs-v1');
      window.localStorage.setItem('vstudy-route',route);
    });
    const go = async (route,selector) => {
      await page.evaluate(route=>window.sessionStorage.setItem('shot-route',JSON.stringify(route)),route);
      await page.reload();
      await page.locator(selector).first().waitFor();
      await page.evaluate(()=>window.document.fonts.ready);
    };
    const settings = async tab => {
      await go({view:'home'},'.home-page');
      await page.evaluate(tab=>window.dispatchEvent(new window.CustomEvent('vstudy:open-settings',{detail:{tab}})),tab);
      await page.locator('.settings-dialog').waitFor();
      await page.locator('.settings-dialog').getByRole('heading',{name:'Settings',exact:true}).click();
    };
    const views = {
      'document-figures': async()=>{await go({view:'workspace',documentId:pdf.id},'[data-testid=document-markdown] img');await page.locator('.aui-composer-input').waitFor();await page.locator('[data-testid=document-markdown] img').evaluate(el=>el.scrollIntoView({block:'center'}));},
      'original-page': async()=>{await go({view:'workspace',documentId:pdf.id},'[data-testid=document-markdown]');await page.getByRole('button',{name:'Original file',exact:true}).click();await page.locator('.original-page img').waitFor();await page.locator('.aui-composer-input').waitFor();},
      'capture-to-chat': async()=>{await views['original-page']();await page.getByRole('button',{name:'Attach page',exact:true}).click();await page.locator('.document-context-chip').waitFor();await page.locator('.aui-composer-input').fill('Explain how the frontier moves through this graph.');},
      'usage-settings': async()=>{await settings('usage');await page.locator('.subscription-meters[aria-busy=false]').last().waitFor();},
      'connect-ai': async()=>{await go({view:'home'},'.home-page');await page.evaluate(()=>window.dispatchEvent(new window.CustomEvent('vstudy:ai-cli-setup')));await page.locator('.ai-cli-sheet').waitFor();},
      school: async()=>{await go({view:'courses'},'.moodle-course-card');await page.getByRole('button',{name:/^Connect (another )?school$/}).click();await page.getByRole('dialog').getByRole('combobox').waitFor();},
      'courses-home': async()=>{await go({view:'courses'},'.moodle-course-card');await page.evaluate(()=>window.dispatchEvent(new window.Event('vstudy:toggle-sidebar')));await page.getByRole('heading',{name:'Your courses'}).first().evaluate(el=>el.scrollIntoView({block:'start'}));},
      'course-page': async()=>{await go({view:'courses',courseId:fixture.details[0].course.id},'.moodle-module');await page.locator('.moodle-page').evaluate(el=>{el.scrollTop=0;});},
      'planner-today': async()=>{await go({view:'courses'},'.planner-entry');await page.locator('.planner-entry').click();await page.locator('.planner-task-list li').first().waitFor();await page.locator('.planner-forms details[open] summary').click();await page.locator('.planner-view-tabs').evaluate(el=>el.scrollIntoView({block:'start'}));},
      'reader-chat-with-answer': async()=>{await go({view:'workspace',documentId:documents[0].id},'[data-slot=aui_assistant-message-root]');await page.locator('.selection-preview').first().waitFor();await page.locator('.aui-composer-input').waitFor();},
      'history-search': async()=>{await go({view:'history'},'[data-testid=history-result]');await page.keyboard.press('Meta+k');await page.getByRole('dialog').getByRole('searchbox').fill('the');await page.getByRole('dialog').locator('[data-testid=history-result]').first().waitFor();},
      library: async()=>go({view:'library'},'.course-folder'),
      home: async()=>go({view:'home'},'.home-page'),
      'themes-settings': async()=>settings('appearance'),
      'moodle-webview': async()=>{await go({view:'courses',courseId:fixture.details[0].course.id},'.moodle-module');await page.getByRole('button',{name:'Open in Moodle',exact:true}).click();await page.waitForFunction(()=>window.document.querySelector('#moodle-webview-title')?.textContent==='Exploring connections · CS201');await moodle.ready();},
      'storage-settings': async()=>{await settings('storage');await page.locator('[data-testid=storage-settings][aria-busy=false]').waitFor();},
      'onboarding-welcome': async()=>{await call('settings:set',{...await call('settings:get',{}),onboardingCompleted:false});await page.evaluate(()=>window.localStorage.setItem('vstudy-onboarding-v1',JSON.stringify({version:1,step:'welcome',goal:'sample',status:'active',done:[],dismissed:[]})));await go({view:'home'},'.onboarding');},
    };
    const applyAppearance = async (theme,mode) => {
      await call('settings:set',{...await call('settings:get',{}),themeId:theme,colorScheme:mode,onboardingCompleted:true});
      await page.evaluate(()=>window.localStorage.setItem('vstudy-onboarding-v1',JSON.stringify({version:1,step:'start',goal:'documents',status:'completed',done:['setup','document','walkthrough','help'],dismissed:['workspace','courses']})));
    };
    const finishView = async name => {
      if(name==='moodle-webview') await page.getByRole('button',{name:'Close Moodle page',exact:true}).click();
    };
    const close = async () => {
      try {await moodle?.close();} finally {await app.close();}
    };
    return {app,page,errors,fixture,documents,pdf,call,go,settings,views,applyAppearance,finishView,close};
  } catch(error) {
    try {await moodle?.close();} finally {await app.close();}
    throw error;
  }
}

/** Waits for the view to settle, then returns a 1440x900 CSS-pixel PNG of the window plus its child views. */
export async function captureRaw({app,page},name,scale=2) {
  await page.getByText('Loading conversation',{exact:true}).waitFor({state:'hidden'});
  await page.locator('img:visible').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  // Astryx fields keep an empty assertive live region mounted for later validation text; only a populated one is an error.
  assert.equal(await page.getByRole('alert').filter({hasText:/\S/}).count(),0,`${name} has an error alert`);
  await page.addStyleTag({content:'* { scrollbar-width: none !important; caret-color: transparent !important; } ::-webkit-scrollbar { display: none !important; }'});
  await page.mouse.move(viewport.width-2,viewport.height-2);
  await page.evaluate(()=>{if(window.document.activeElement instanceof window.HTMLElement) window.document.activeElement.blur();});
  await page.evaluate(()=>new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve))));
  const layers = await app.evaluate(async ({BrowserWindow})=>{
    const window=BrowserWindow.getAllWindows()[0];
    return {base:(await window.webContents.capturePage()).toPNG().toString('base64'),children:await Promise.all(window.contentView.children.filter(view=>view.webContents&&view.webContents!==window.webContents).map(async view=>({bounds:view.getBounds(),png:(await view.webContents.capturePage()).toPNG().toString('base64')})))};
  });
  let raw=Buffer.from(layers.base,'base64');
  if(layers.children.length) raw=await sharp(raw).composite(layers.children.map(view=>({input:Buffer.from(view.png,'base64'),left:view.bounds.x*scale,top:view.bounds.y*scale}))).png().toBuffer();
  const meta = await sharp(raw).metadata();
  assert.equal(meta.width,viewport.width*scale,`Capture must be ${viewport.width} CSS pixels at ${scale}x`);
  assert.equal(meta.height,viewport.height*scale);
  return raw;
}
