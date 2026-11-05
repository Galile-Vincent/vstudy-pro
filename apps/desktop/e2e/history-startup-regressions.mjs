/** Real Electron regression checks for History filtering and interrupted initial navigation. */
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const evidence = resolve('../../docs/evidence/review-fixes-2');
await mkdir(evidence, { recursive: true });
const failures = [];
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_FAKE_PROVIDER: '1', VSTUDY_LOCALE: 'en' };
async function isolated(check) {
  const directory = await mkdtemp(join(tmpdir(), 'vstudy-review-fixes-2-'));
  let app;
  try {
    app = await electron.launch({ args: [resolve('.'), '--user-data-dir=' + directory], env });
    await check(app, directory);
  } finally {
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
try {
  await isolated(async app => {
    const page = await app.firstWindow(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => !!window.desktop);
    await page.evaluate(async () => {
      const settings = await window.desktop.invoke('settings:get', {});
      await window.desktop.invoke('settings:set', { ...settings, onboardingCompleted: true });
      for (const title of ['Algebra study', 'Biology study', ...Array.from({ length: 32 }, (_, index) => `Study topic ${index}`)]) {
        const c = await window.desktop.invoke('conversations:create', { scope: 'general', providerId: 'anthropic-api', modelId: 'fake' });
        await window.desktop.invoke('chats:update', { conversationId: c.id, patch: { title } });
      }
      window.localStorage.setItem('vstudy-route', JSON.stringify({ view: 'history' }));
    });
    await page.reload();
    await page.locator('[data-history-result]').nth(1).waitFor();
    const search = page.getByRole('searchbox', { name: 'Search chat history' });
    await search.fill('Biology');
    await page.waitForFunction(() => window.document.querySelectorAll('[data-history-result]').length === 1 || !window.document.querySelector('.history-page'));
    assert.deepEqual(errors, []);
    await page.getByRole('button', { name: /Biology study/ }).waitFor();
    assert.equal(await page.locator('[data-history-result]').count(), 1);
    await page.screenshot({ path: join(evidence, 'history-filter.png') });
    await search.fill('nothing matches');
    await page.getByText('No matching conversations', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-history-result]').count(), 0);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(evidence, 'history-empty.png') });
    await search.fill('');
    await page.locator('[data-history-result]').nth(29).waitFor();
    await page.keyboard.press('Meta+k');
    const dialog = page.getByRole('dialog', { name: 'History', exact: true });
    await dialog.locator('[data-history-result]').nth(29).waitFor();
    const row = await dialog.locator('[data-history-result]').first().elementHandle();
    const list = dialog.locator('.history-results');
    await row.focus();
    const scroll = await list.evaluate(el => { el.scrollTop = 100; return el.scrollTop; });
    assert.ok(scroll > 0, 'The finder must have a real scroll offset.');
    await dialog.getByRole('button', { name: 'Load more', exact: true }).evaluate(button => button.click());
    await page.waitForFunction(() => window.document.querySelectorAll('[role=dialog] [data-history-result]').length === 34);
    assert.equal(await row.evaluate(el => el === window.document.activeElement), true);
    assert.equal(await list.evaluate(el => el.scrollTop), scroll);
    assert.equal(await list.locator('[role=status]').innerText(), '');
    await page.evaluate(() => window.dispatchEvent(new window.Event('vstudy:history-changed')));
    await list.locator(':scope[aria-busy=true]').waitFor();
    await list.locator(':scope[aria-busy=false]').waitFor();
    assert.equal(await row.evaluate(el => el === window.document.activeElement), true);
    assert.equal(await list.evaluate(el => el.scrollTop), scroll);
    assert.equal(await list.locator('[role=status]').innerText(), '');
    await page.screenshot({ path: join(evidence, 'history-pagination.png') });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await page.evaluate(() => {
      window.historyDateFormatter = window.Intl.DateTimeFormat;
      window.Intl.DateTimeFormat = function (...args) {
        if (args[1]?.month === 'short' && args[1]?.day === 'numeric') throw new Error('Injected History render failure');
        return new window.historyDateFormatter(...args);
      };
      window.dispatchEvent(new window.Event('vstudy:history-changed'));
    });
    await page.getByRole('alert').getByText('This view could not be displayed. Try again to reopen it.').waitFor();
    await page.screenshot({ path: join(evidence, 'history-recovery.png') });
    await page.evaluate(() => { window.Intl.DateTimeFormat = window.historyDateFormatter; delete window.historyDateFormatter; });
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.locator('[data-history-result]').first().waitFor();
    assert.deepEqual(errors, []);
    await writeFile(join(evidence, 'history-snapshot.txt'), await page.locator('body').ariaSnapshot());
    console.log('PASS Electron History filtering, empty results, pagination focus/scroll, silent refresh and render-failure retry.');
  });
} catch (error) { failures.push('History: ' + error.message); console.error(failures.at(-1)); }

let requests = 0;
const server = createServer(() => { requests++; });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const previousUrl = env.ELECTRON_RENDERER_URL;
env.ELECTRON_RENDERER_URL = `http://127.0.0.1:${server.address().port}`;
try {
  await isolated(async (app, directory) => {
    const windowDeadline = Date.now() + 5000;
    while (!await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) {
      assert.ok(Date.now() < windowDeadline, 'Startup must create its initial window.');
      await delay(20);
    }
    await writeFile(join(directory, 'restore-startup.json'), 'startup confirmation witness');
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) throw new Error('Initial window missing');
      window.webContents.reload();
    });
    const deadline = Date.now() + 5000;
    while (requests < 2 && Date.now() < deadline) await delay(20);
    assert.ok(requests >= 2, 'Reload must start a replacement navigation.');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await delay(250);
    const state = await app.evaluate(({ app, BrowserWindow }) => ({ activateHandlers: app.listenerCount('activate'), windows: BrowserWindow.getAllWindows().length }));
    assert.equal(state.windows, 0);
    assert.ok(state.activateHandlers > 0, 'Startup must register the activate handler after the initial window closes.');
    await assert.rejects(access(join(directory, 'restore-startup.json')), { code: 'ENOENT' });
    await app.evaluate(({ app }) => app.emit('activate'));
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    await writeFile(join(evidence, 'startup-state.json'), JSON.stringify({ requests, ...state, restoredWindow: true, restoreConfirmed: true }, null, 2));
    console.log('PASS Electron initial reload and close settles startup, confirms restore and reopens on activate.');
  });
} catch (error) { failures.push('Startup: ' + error.message); console.error(failures.at(-1)); }
finally {
  env.ELECTRON_RENDERER_URL = previousUrl;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
assert.deepEqual(failures, []);
