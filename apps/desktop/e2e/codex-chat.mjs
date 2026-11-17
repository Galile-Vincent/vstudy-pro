import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { temporaryPath } from '../scripts/platform.mjs';
if (process.platform !== 'darwin') {
 console.log('SKIP: Codex CLI requires the macOS isolated transport.');
} else if (process.env.VSTUDY_CODEX_LIVE !== '1') {
 console.log('SKIP: set VSTUDY_CODEX_LIVE=1 with authenticated Codex 0.166.0');
} else {
 const directory = await mkdtemp(join(tmpdir(), 'vstudy-real-codex-')); let app;
 try {
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_FAKE_PROVIDER: '', VSTUDY_LOCALE: 'en' } });
  const page = await app.firstWindow(); page.setDefaultTimeout(120_000);
  await page.locator('.onboarding').waitFor();
  await page.evaluate(async () => { const settings = await window.desktop.invoke('settings:get', {}); await window.desktop.invoke('settings:set', { ...settings, onboardingCompleted: true, language: 'en' }); window.localStorage.setItem('vstudy-route', JSON.stringify({ view: 'workspace' })); });
  await page.reload(); await page.getByTestId('bridge-status').waitFor({ state: 'attached' });
  await app.evaluate(({dialog},path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, resolve('e2e/fixtures/reading.md'));
  await page.getByTestId('import-document').click(); await page.getByTestId('document-markdown').waitFor();
  await page.evaluate(()=>window.desktop.invoke('providers:configure',{kind:'cli',id:'codex-cli',enabled:true}));
  let codex;
  const deadline=Date.now()+120_000;
  do {
    codex=await page.evaluate(async()=> (await window.desktop.invoke('providers:list',{})).find(p=>p.config.id==='codex-cli'));
    if(codex?.availability.available && codex.models.length) break;
    if(codex && !codex.availability.available && /could not verify/.test(codex.availability.reason)) break;
    await page.waitForTimeout(1000);
  } while(Date.now()<deadline);
  assert.ok(codex?.availability.available,JSON.stringify(codex?.availability));
  assert.ok(codex.models.length,'enabled Codex exposes its discovered catalog');
  const target=codex.models.find(m=>m.id==='gpt-6.1-sol') ?? codex.models[0];
  await page.getByRole('combobox', { name: 'Model', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search models' }).fill(target.name);
  await page.locator('[data-slot=model-selector-list]').getByRole('option').filter({ hasText: target.name }).first().click();
  await page.locator('.aui-composer-input').waitFor();
  const input = page.locator('.aui-composer-input'); await input.fill('Reply with exactly: Codex chat is working.'); await input.press('Enter');
  await page.locator('[data-role=assistant]').filter({ hasText: 'Codex chat is working.' }).waitFor();
  await page.waitForFunction(() => !window.document.querySelector('.aui-composer-cancel'));
  const result = await page.evaluate(async () => { const documents = await window.desktop.invoke('documents:list', {}); const conversations = await window.desktop.invoke('conversations:list', {documentId: documents[0].id}); const conversation = conversations.find(c => c.providerId === 'codex-cli'); return { conversation, messages: conversation ? await window.desktop.invoke('messages:list', { conversationId: conversation.id }) : [] }; });
  assert.equal(result.conversation?.providerId, 'codex-cli'); assert.ok(result.messages.some(m => m.role === 'assistant' && m.parts.some(p => p.usage?.inputTokens > 0))); 
  await page.screenshot({ path: temporaryPath('vstudy-codex-chat.png'), animations: 'disabled' });
  await input.fill('Write a detailed ten thousand word guide to linear algebra.'); await input.press('Enter');
  const stop = page.getByRole('button', { name: 'Stop generating', exact: true }); await stop.waitFor(); await page.waitForTimeout(1000); await stop.click(); await stop.waitFor({state:'hidden'});
  console.log('PASS: Stop cancels the real provider; real Codex UI chat, conversation persisted; screenshot', temporaryPath('vstudy-codex-chat.png'));
 } catch (error) { if (app) { const page = await app.firstWindow(); await page.screenshot({ path: temporaryPath('vstudy-codex-chat-failure.png') }); console.log(await page.locator('body').innerText()); } throw error; }
 finally { await app?.close(); await rm(directory, { recursive: true, force: true }); }
}
