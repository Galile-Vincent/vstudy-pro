/** Real Electron consent and Privacy settings smoke. No live analytics/newsletter sends. */
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const evidence = resolve('node_modules/.cache/analytics-ui');
await mkdir(evidence, {recursive:true});
const results=[];
for (const language of ['en','zh-Hant','ja']) for (const colorScheme of ['light','dark']) {
  const directory=await mkdtemp(join(evidence,'profile-'));let app;
  try {
    app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_ANALYTICS_ENABLE:'',VSTUDY_NEWSLETTER_URL:'',VSTUDY_LOCALE:language,VSTUDY_FAKE_PROVIDER:'1'}});
    const page=await app.firstWindow();const errors=[],consoleMessages=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(['error','warning'].includes(message.type()))consoleMessages.push(message.text());});
    await page.locator('.onboarding[data-state=open]').waitFor();
    await page.evaluate(async ({language,colorScheme})=>{const settings=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...settings,language,colorScheme});},{language,colorScheme});
    await page.reload();await page.emulateMedia({reducedMotion:'reduce'});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1200,900));
    const copy=JSON.parse(await readFile(`src/shared/locales/${language}/analytics.json`,'utf8'));
    const onboarding=JSON.parse(await readFile(`src/shared/locales/${language}/onboarding.json`,'utf8'));
    assert.equal((await page.evaluate(()=>window.desktop.invoke('analytics:getState',{}))).enabled,false);
    for(let i=0;i<3;i++) await page.getByRole('button',{name:onboarding.next,exact:true}).click();
    await page.getByRole('radio',{name:copy.source_github,exact:true}).check();
    assert.equal(await page.locator('input[type=email]').count(),0);
    assert.equal(await page.locator('.analytics-sources input').count(),10);
    await page.screenshot({path:join(evidence,`${language}-${colorScheme}-acquisition.png`)});
    await page.getByRole('button',{name:onboarding.next,exact:true}).click();
    await page.getByRole('button',{name:copy.decline,exact:true}).waitFor();
    await page.screenshot({path:join(evidence,`${language}-${colorScheme}-consent.png`)});
    await page.getByRole('button',{name:copy.decline,exact:true}).click();
    await page.getByRole('button',{name:onboarding.later,exact:true}).click();
    await page.locator('.onboarding').waitFor({state:'detached'});
    const state=await page.evaluate(()=>window.desktop.invoke('analytics:getState',{}));
    assert.equal(state.enabled,false);assert.equal(state.onboarding_completed,true);assert.equal(state.acquisition_source,'github');
    await page.evaluate(()=>window.dispatchEvent(new window.CustomEvent('vstudy:open-settings',{detail:{tab:'privacy'}})));
    const privacy=page.getByTestId('privacy-settings');await privacy.waitFor();
    await privacy.locator('details summary').click();
    const toggle=privacy.getByRole('switch',{name:copy.enabled,exact:true});
    assert.equal(await toggle.getAttribute('aria-checked'),'false');
    await toggle.click();await page.waitForFunction(()=>window.document.querySelector('[data-testid=privacy-settings] [role=switch]')?.getAttribute('aria-checked')==='true');
    await toggle.click();await page.waitForFunction(()=>window.document.querySelector('[data-testid=privacy-settings] [role=switch]')?.getAttribute('aria-checked')==='false');
    await page.screenshot({path:join(evidence,`${language}-${colorScheme}-privacy.png`)});
    await privacy.getByRole('button',{name:copy.delete,exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:join(evidence,`${language}-${colorScheme}-privacy-id.png`)});
    await privacy.getByRole('button',{name:copy.delete,exact:true}).click();
    await privacy.getByRole('button',{name:copy.instructions,exact:true}).click();
    await privacy.locator('blockquote').waitFor();
    await privacy.locator('blockquote').scrollIntoViewIfNeeded();
    await page.screenshot({path:join(evidence,`${language}-${colorScheme}-deletion.png`)});
    assert.equal((await page.evaluate(()=>window.desktop.invoke('analytics:getState',{}))).deletion_pending,true);
    assert.equal(errors.length,0,JSON.stringify(errors));
    results.push({language,colorScheme,pass:true,url:page.url(),title:await page.title(),errors,consoleMessages});
  } finally {if(app)await app.close();await rm(directory,{recursive:true,force:true});}
}
// Simulate an upgrade: existing study profile with no analytics decision.
{
 const directory=await mkdtemp(join(evidence,'upgrade-'));let app;
 try {
  app=await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_ANALYTICS_ENABLE:'',VSTUDY_NEWSLETTER_URL:'https://example.org/subscribe'}});
  const page=await app.firstWindow();await page.locator('.onboarding').waitFor();
  // Configured newsletter: no request is made during this validation.
  for(let i=0;i<3;i++)await page.locator('.onboarding footer .primary').click();
  const email=page.locator('input[type=email]');await email.waitFor();
  const checkbox=page.locator('.analytics-check input');
  assert.equal(await checkbox.isChecked(),false);assert.equal(await checkbox.isDisabled(),true);
  await email.fill('invalid');assert.equal(await checkbox.isDisabled(),true);
  await email.fill('student@example.org');assert.equal(await checkbox.isEnabled(),true);assert.equal(await checkbox.isChecked(),false);
  await page.screenshot({path:join(evidence,'newsletter-configured.png')});
  await page.evaluate(async()=>{const settings=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...settings,onboardingCompleted:true,language:'en'});});
  await page.reload();await page.locator('.analytics-banner').waitFor();
  assert.equal((await page.evaluate(()=>window.desktop.invoke('analytics:getState',{}))).enabled,false);
  await page.screenshot({path:join(evidence,'existing-user-prompt.png')});
  await page.locator('.analytics-banner').getByRole('button',{name:'No thanks',exact:true}).click();
  await page.locator('.analytics-banner').waitFor({state:'detached'});await page.reload();
  await page.locator('.app-shell').waitFor();assert.equal(await page.locator('.analytics-banner').count(),0);
  results.push({upgradePromptOnce:true,configuredNewsletterUnchecked:true});
 } finally {if(app)await app.close();await rm(directory,{recursive:true,force:true});}
}
await writeFile(join(evidence,'results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({evidence,results},null,2));
