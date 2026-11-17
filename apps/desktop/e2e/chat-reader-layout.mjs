import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { seedRoute } from './helpers/tab-route.mjs';
import { seedMarketing, captureTime } from '../scripts/marketing-seed.mjs';

const directory = await mkdtemp(join(tmpdir(), 'vstudy-chat-layout-'));
const output = process.env.VSTUDY_CHAT_LAYOUT_OUTPUT ?? join(tmpdir(), 'vstudy-chat-layout');
const results = [], errors = [];
let app;
try {
  await mkdir(join(output, 'raw'), { recursive: true });
  if (process.env.VSTUDY_CONVERTER_VENV) await symlink(resolve(process.env.VSTUDY_CONVERTER_VENV), join(directory, 'converter-venv'));
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${directory}`, '--force-device-scale-factor=2'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', HOME: directory, XDG_CONFIG_HOME: directory, VSTUDY_LOCALE: 'en', VSTUDY_FAKE_PROVIDER: '1' } });
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(captureTime);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
  const { documents, pdf, call } = await seedMarketing(app, page, directory);
  for (const mode of ['light', 'dark']) for (const view of ['reader-chat-with-answer', 'original-page', 'capture-to-chat']) {
    await call('settings:set', { ...await call('settings:get', {}), themeId: 'vstudy', colorScheme: mode });
    await seedRoute(page, { view: 'workspace', documentId: view === 'reader-chat-with-answer' ? documents[0].id : pdf.id });
    await page.reload();
    await page.getByTestId('document-markdown').waitFor();
    await page.locator('.aui-composer-input').waitFor();
    await page.getByText('Loading conversation', { exact: true }).waitFor({ state: 'hidden' });
    if (view !== 'reader-chat-with-answer') {
      await page.getByRole('button', { name: 'Original file', exact: true }).click();
      await page.locator('.original-page img').first().waitFor();
      if (view === 'capture-to-chat') {
        await page.getByRole('button', { name: 'Attach page', exact: true }).click();
        await page.locator('.document-context-chip').waitFor();
        await page.locator('.aui-composer-input').fill('Explain how the frontier moves through this graph.');
      }
    }
    await page.evaluate(() => window.document.fonts.ready);
    const controls = await page.locator('.model-controls:visible').last().evaluate(root => [...root.querySelectorAll('[role=combobox]')].map(el => ({ name: el.getAttribute('aria-label'), height: el.getBoundingClientRect().height, icons: el.querySelectorAll('svg').length })));
    assert.ok(controls.length >= 2);
    assert.ok(controls.every(control => control.height <= 40), `${view} compact composer controls: ${JSON.stringify(controls)}`);
    assert.ok(controls[0].icons >= 2, 'Model picker has its provider icon and dropdown affordance');
    const result = { view, mode, controls };
    if (view === 'reader-chat-with-answer') {
      await page.locator('[data-slot=document-citation]').waitFor();
      result.layout = await page.evaluate(() => {
        const rect = selector => window.document.querySelector(selector).getBoundingClientRect();
        const viewport = rect('[data-slot=aui_thread-viewport]');
        const quote = rect('.aui-user-message-content .selection-preview summary');
        const citation = rect('[data-slot=document-citation]');
        const paragraph = window.document.querySelector('[data-testid=document-markdown] p');
        return { viewportTop: viewport.top, quoteBottom: quote.bottom, citationWidth: citation.width, citationHeight: citation.height, paragraphHeight: paragraph.getBoundingClientRect().height, paragraphLineHeight: Number.parseFloat(window.getComputedStyle(paragraph).lineHeight) };
      });
      const question = await page.getByText('Why does a queue help us find the shortest path?', { exact: true }).boundingBox();
      assert.ok(question.y >= result.layout.viewportTop, 'User question stays in the viewport');
      assert.ok(result.layout.quoteBottom >= result.layout.viewportTop + 24, 'Quoted selection stays visible above the question');
      assert.ok(result.layout.citationHeight <= 28 && result.layout.citationWidth <= 28, 'Citation stays inline-sized');
      assert.ok(result.layout.paragraphHeight <= result.layout.paragraphLineHeight + 1, 'Inline paragraph action does not enlarge a single text line');
    }
    await page.locator('img:visible').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.addStyleTag({ content: '* { scrollbar-width:none !important; caret-color:transparent !important; } ::-webkit-scrollbar { display:none !important; }' });
    await page.mouse.move(1438, 898);
    await page.evaluate(() => { if (window.document.activeElement instanceof window.HTMLElement) window.document.activeElement.blur(); });
    await page.screenshot({ path: join(output, 'raw', `${view}-vstudy-${mode}.png`), animations: 'disabled' });
    results.push(result);
    console.log(`${view} ${mode}: PASS ${JSON.stringify(result)}`);
  }
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'layout.json'), JSON.stringify({ results, errors }, null, 2));
} finally {
  try { await app?.close(); } finally { await rm(directory, { recursive: true, force: true }); }
}
