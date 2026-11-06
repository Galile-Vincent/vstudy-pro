/** Recheck novice recovery in real Electron. This is source-informed regression coverage, not a naive user study. */
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const evidence = resolve('../../docs/evidence/novice');
await mkdir(evidence, { recursive: true });
const results = [];
for (const [persona, language] of [['p1', 'zh-Hant'], ['p2', 'en'], ['p3', 'en']]) {
  const profile = await mkdtemp(join(tmpdir(), `vstudy-novice-recheck-${persona}-`));
  const catalog = async namespace => JSON.parse(await readFile(`src/shared/locales/${language}/${namespace}.json`, 'utf8'));
  const common = await catalog('common'), home = await catalog('home'), copy = await catalog('novice'), history = await catalog('history');
  const onboarding = { ...await catalog('onboarding'), ...JSON.parse(await readFile(`src/renderer/onboarding/locales/${language}.json`, 'utf8')) };
  const settings = await catalog('settings');
  const result = { persona, language, freshProfile: true, tasks: {}, rendererErrors: [], ai: 'No saved key and no enabled CLI. Answer phase uses the explicit local fake adapter.' };
  let app, page;
  const capture = async name => {
    const base = `${persona}-recheck-${name}`;
    await page.screenshot({ path: join(evidence, `${base}.png`), animations: 'disabled' });
    await writeFile(join(evidence, `${base}.txt`), await page.locator('body').ariaSnapshot());
    return `${base}.png`;
  };
  const task = async (name, run) => {
    const start = Date.now();
    await run();
    result.tasks[name] = { seconds: (Date.now() - start) / 1000, screenshot: await capture(name) };
  };
  const launch = async fake => {
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: language };
    if (fake) env.VSTUDY_FAKE_PROVIDER = '1'; else delete env.VSTUDY_FAKE_PROVIDER;
    app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${profile}`], env });
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => result.rendererErrors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const leave = page.getByRole('button', { name: onboarding.later, exact: true });
    if (!fake) await leave.waitFor();
    if (await leave.isVisible()) await leave.click();
  };
  try {
    if (process.env.VSTUDY_CONVERTER_VENV) await cp(process.env.VSTUDY_CONVERTER_VENV, join(profile, 'converter-venv'), { recursive: true });
    await launch(false);
    await task('reading-without-ai', async () => {
      await page.getByRole('button', { name: onboarding.sample, exact: true }).click();
      await page.getByRole('button', { name: home.open_imported.replace('{{title}}', common.sample_title), exact: true }).click();
      await page.getByTestId('document-markdown').waitFor();
      await page.getByRole('complementary', { name: copy.ai_off, exact: true }).waitFor();
      assert.equal(await page.getByRole('textbox', { name: common.ask_about_your_document, exact: true }).isDisabled(), true);
      assert.equal(await page.locator('.document-conversion-hint').count(), 0, 'native text has no alarming conversion warning');
      assert.ok((await page.locator('.pane-toolbar').innerText()).includes(copy.ready_to_read));
    });
    await task('no-key-fallback', async () => {
      await page.getByRole('button', { name: copy.connect_ai, exact: true }).first().click();
      await page.locator('.settings-pane:not([hidden]) summary', { hasText: copy.setup_title }).click();
      await page.getByRole('heading', { name: copy.no_account, exact: true }).waitFor();
      await page.getByRole('heading', { name: copy.no_account, exact: true }).scrollIntoViewIfNeeded();
      assert.equal(await page.locator('.ai-setup-guide blockquote').innerText(), copy.school_request);
      assert.equal(await page.locator('.settings-pane:not([hidden]) details').last().getAttribute('open'), null, 'technical tools start collapsed');
      assert.equal(await page.getByRole('switch', { name: /CLI/ }).count(), 0, 'no CLI controls exposed by default');
    });
    await task('return-to-reading', async () => {
      await page.getByRole('button', { name: copy.continue_reading, exact: true }).click();
      await page.getByTestId('document-markdown').waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0);
    });
    if (process.env.VSTUDY_CONVERTER_VENV) await task('pdf-selection', async () => {
      await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, resolve('test-fixtures/converter/sample.pdf'));
      await page.getByRole('button', { name: common.import_document, exact: true }).click();
      const reader = page.getByTestId('document-markdown');
      await reader.filter({ hasText: 'VStudy' }).waitFor({ timeout: 60000 });
      await reader.focus();
      for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowRight');
      await page.keyboard.press('Meta+Shift+k');
      await page.locator('.selection-chip').waitFor();
      await page.getByRole('complementary', { name: copy.ai_off, exact: true }).waitFor();
    });
    else result.tasks['pdf-selection'] = { status: 'SKIP', reason: 'Set VSTUDY_CONVERTER_VENV to an installed locked environment.' };
    await app.close(); app = undefined;
    await launch(true);
    await task('fixture-answer', async () => {
      if (process.env.VSTUDY_CONVERTER_VENV) await page.locator('.pane-toolbar').getByText('sample.pdf', { exact: true }).waitFor();
      const reader = page.getByTestId('document-markdown');
      await reader.waitFor();
      await reader.focus();
      for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowRight');
      await page.keyboard.press('Meta+Shift+k');
      await page.locator('.selection-chip').waitFor();
      const input = page.locator('.aui-composer-input');
      await input.waitFor();
      await input.fill('Explain retrieval practice for my revision.');
      await input.press('Enter');
      await page.locator('[data-role=assistant]').filter({ hasText: 'bold' }).waitFor();
      await page.waitForFunction(() => !window.document.querySelector('.aui-composer-cancel'));
      if (process.env.VSTUDY_CONVERTER_VENV) assert.ok((await page.locator('[data-role=user]').innerText()).includes('VStudy'), 'selected PDF text reaches the saved question after restart');
    });
    await task('find-old-conversation', async () => {
      await page.getByRole('button', { name: history.title, exact: true }).click();
      await page.getByRole('searchbox', { name: history.search, exact: true }).fill('retrieval practice');
      const match = page.getByTestId('history-result').first();
      await match.waitFor();
      await match.locator('.history-result-title').click();
      await page.locator('[data-role=user]').filter({ hasText: 'Explain retrieval practice' }).waitFor();
    });
    await task('understand-ai-usage', async () => {
      await page.getByRole('button', { name: common.settings, exact: true }).click();
      await page.getByRole('tab', { name: settings.usage, exact: true }).click();
      await page.getByText(copy.usage_help, { exact: true }).waitFor();
    });
    await page.getByRole('button', { name: common.close_settings, exact: true }).click();
    await task('theme-and-language', async () => {
      await page.getByRole('button', { name: common.settings, exact: true }).click();
      await page.getByRole('tab', { name: settings.appearance, exact: true }).click();
      const themes = await catalog('themes');
      await page.getByRole('button', { name: themes.name_ocean, exact: true }).click();
      await page.getByRole('button', { name: themes.dark, exact: true }).click();
      await page.waitForFunction(() => window.document.documentElement.dataset.theme === 'ocean' && window.document.documentElement.dataset.scheme === 'dark');
      await page.getByRole('tab', { name: settings.general, exact: true }).click();
      await page.getByRole('combobox', { name: common.language, exact: true }).click();
      await page.getByRole('option', { name: language === 'en' ? '繁體中文' : 'English', exact: true }).click();
      await page.waitForFunction(lang => window.document.documentElement.lang === lang, language === 'en' ? 'zh-Hant' : 'en');
    });
    assert.deepEqual(result.rendererErrors, []);
    console.log(`PASS ${persona}/${language}: reading, no-key fallback, ${process.env.VSTUDY_CONVERTER_VENV ? 'PDF selection' : 'PDF skipped'}, fixture answer, history, theme, language`);
    results.push(result);
  } catch (error) {
    if (page) await capture('failure').catch(() => {});
    throw error;
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
    await writeFile(join(evidence, 'recheck-results.json'), JSON.stringify(results, null, 2) + '\n');
  }
}
