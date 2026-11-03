/* global document, performance, MutationObserver, setTimeout */
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { resolve, join } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '../..');
const directory = process.env.PROFILE_DATA ?? '/tmp/vstudy-speed-data';
await writeFile(join(directory, 'converter-venv/.requirements-sha256'), createHash('sha256').update(await readFile(join(import.meta.dirname, 'requirements.txt'))).digest('hex'));
const app = await electron.launch({ args: [root, `--user-data-dir=${directory}`], env: {...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_FAKE_PROVIDER: '1', VSTUDY_CONVERSION_PROFILE: '1'} });
app.process().stdout.on('data', chunk => process.stdout.write(chunk));
try {
 const page = await app.firstWindow();
 await page.getByRole('heading', {name: 'VStudy Pro'}).waitFor();
 if (process.env.PROFILE_WARM === "1") await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1000)));
 const results = [];
 for (const source of process.argv.slice(2)) {
  await app.evaluate(({dialog}, path) => {dialog.showOpenDialog = async () => ({canceled:false,filePaths:[path]});}, resolve(source));
  await page.evaluate(() => {window.profileObserver?.disconnect(); window.profileUnsubscribe?.(); const previous=document.querySelector('[data-testid="document-markdown"]'); window.profileStart=performance.now(); window.profileEvents=[]; window.profilePageCounts=[]; window.profileFirst=null; window.profileUnsubscribe=window.desktop.onDocumentProgress(e => window.profileEvents.push({ms:performance.now()-window.profileStart,...e})); const obs = new MutationObserver(() => {const bar=document.querySelector('progress[aria-label="Conversion progress"]'); if(bar && !window.profilePageCounts.includes(bar.value)) window.profilePageCounts.push(bar.value); const node=document.querySelector('[data-testid="document-markdown"]'); if(node !== previous && node?.textContent && window.profileFirst===null) window.profileFirst=performance.now()-window.profileStart;}); window.profileObserver=obs; obs.observe(document.body,{childList:true,subtree:true,attributes:true});});
  await page.getByRole('button', {name:'＋ Import document',exact:true}).click();
  await page.evaluate(async name => { const start=performance.now(); while (performance.now()-start<660000) { if ((await window.desktop.invoke('documents:list',{})).some(d => d.sourceName===name && d.status==='ready')) return; await new Promise(r => setTimeout(r,20)); } throw new Error('Import timed out'); }, source.split('/').at(-1));
  const ready = await page.evaluate(() => performance.now()-window.profileStart);
  await page.waitForFunction(() => window.profileFirst !== null, {timeout:30000});
  const result = await page.evaluate(() => ({firstVisibleMs:window.profileFirst, progress:window.profileEvents, visiblePageCounts:window.profilePageCounts}));
  if (process.env.PROFILE_ASSERT_PROGRESS === '1' && source.endsWith('.pdf')) {
    const pages = result.progress.filter(e => /^Converting page /.test(e.message));
    const total = Number(pages[0]?.message.match(/\/(\d+)/)?.[1]);
    assert.equal(pages.length, total);
    assert.ok(result.visiblePageCounts.length >= 2, 'determinate page counts must reach the DOM before completion');
    pages.forEach((event, i) => assert.ok(event.message.startsWith(`Converting page ${i+1}/${total}`)));
    const done = result.progress.find(e => e.message === 'Conversion complete');
    assert.ok(result.firstVisibleMs < done.ms, 'reader must appear before finalization');
    assert.ok(pages.at(-1).ms < done.ms, 'page counts precede completion');
  }
  results.push({source, readyMs:ready, ...result});
 }
 console.log(JSON.stringify(results,null,2));
} finally {await app.close();}
