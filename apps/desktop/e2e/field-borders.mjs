import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'vstudy-fields-'));
const output = '/tmp/vstudy-ui2/field-borders';
await mkdir(output, { recursive: true });
const checks = [], errors = [];
let app;
try {
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_FAKE_PROVIDER: '1', VSTUDY_LOCALE: 'en' } });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('.onboarding').waitFor();
  await page.evaluate(async () => { const settings = await window.desktop.invoke('settings:get', {}); await window.desktop.invoke('settings:set', { ...settings, language: 'en', onboardingCompleted: true }); });
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, resolve('e2e/fixtures/reading.md'));
  const document = await page.evaluate(() => window.desktop.invoke('documents:import', {}));
  await page.waitForFunction(async id => (await window.desktop.invoke('documents:list', {})).some(document => document.id === id && document.status === 'ready'), document.id);
  const route = async view => {
    await page.evaluate(({ view, id }) => window.localStorage.setItem('vstudy-route', JSON.stringify({ view, documentId: id })), { view, id: document.id });
    await page.reload();
  };
  const capture = async (name, owner) => {
    const encoded = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
    await writeFile(`${output}/${name}.png`, Buffer.from(encoded, 'base64'));
    const bounds = await owner.boundingBox();
    const rectangle = { x: Math.max(0, Math.floor(bounds.x) - 6), y: Math.max(0, Math.floor(bounds.y) - 6), width: Math.ceil(bounds.width) + 12, height: Math.ceil(bounds.height) + 12 };
    const field = await app.evaluate(async ({ BrowserWindow }, rectangle) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(rectangle)).toPNG().toString('base64'), rectangle);
    await writeFile(`${output}/${name}-field.png`, Buffer.from(field, 'base64'));
  };
  const inspect = async (name, owner, input, theme, composite = true, underline = false) => {
    const styles = async () => ({
      owner: await owner.evaluate(element => { const style = window.getComputedStyle(element); return { border: style.borderBottomWidth, color: style.borderBottomColor, outline: style.outlineWidth, outlineStyle: style.outlineStyle, shadow: style.boxShadow }; }),
      input: await input.evaluate(element => { const style = window.getComputedStyle(element); return { border: style.borderTopWidth, outlineStyle: style.outlineStyle, shadow: style.boxShadow }; }),
    });
    const floating = name === 'composer' || name === 'edit-composer';
    await input.click();
    const pointer = await styles();
    assert.equal(pointer.owner.border, floating ? '0px' : '1px', `${name} uses its intended field boundary`);
    assert.notEqual(pointer.owner.color, 'rgba(0, 0, 0, 0)');
    if (floating) assert.notEqual(pointer.owner.shadow, 'none');
    else assert.equal(pointer.owner.shadow, 'none');
    assert.equal(pointer.owner.outlineStyle, 'none', `${name} pointer focus adds no outline`);
    assert.equal(pointer.input.shadow, 'none');
    if (composite) { assert.equal(pointer.input.border, '0px'); assert.equal(pointer.input.outlineStyle, 'none'); }
    await capture(`${theme}-${name}-pointer`, owner);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await input.evaluate(element => element === window.document.activeElement), true, `${name} keyboard returns to the input`);
    const keyboard = await styles();
    assert.equal(keyboard.owner.border, floating ? '0px' : '1px');
    assert.equal(keyboard.owner.outline, '2px', `${name} keyboard focus belongs to the field boundary`);
    if (floating) assert.notEqual(keyboard.owner.shadow, 'none');
    else assert.equal(keyboard.owner.shadow, 'none');
    if (composite) assert.equal(keyboard.input.outlineStyle, 'none');
    if (underline) assert.equal(await owner.evaluate(element => window.getComputedStyle(element).borderTopWidth), '0px');
    await capture(`${theme}-${name}-keyboard`, owner);
    const audit = await new AxeBuilder({ page }).setLegacyMode(true).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    assert.deepEqual(audit.violations, [], `${name}: axe`);
    checks.push({ name, theme, pointer, keyboard, violations: audit.violations });
  };
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await route('workspace');
    await page.getByTestId('document-markdown').waitFor();
    const start = page.locator('.chat-start button.primary');
    if (await start.count()) await start.click();
    const composer = page.locator('.aui-composer-input');
    await inspect('composer', page.locator('[data-slot=aui_composer-shell]'), composer, theme);
    assert.equal(await page.locator('.aui-composer-root').evaluate(element => window.getComputedStyle(element).borderTopWidth), '0px');
    await page.locator('[data-slot=model-selector-trigger]').click();
    const search = page.locator('[data-slot=model-selector-search]');
    await inspect('model-search', search.locator('..'), search, theme, true, true);
    await search.fill('Fake');
    await page.locator('[data-slot=model-selector-item]').filter({ hasText: 'Fake (test only)' }).first().click();
    await composer.fill('Check the field boundary');
    await composer.press('Enter');
    await page.locator('.aui-composer-cancel').waitFor({ state: 'hidden' });
    await page.locator('.aui-user-message-content').first().hover();
    await page.locator('.aui-user-action-edit').first().click();
    await inspect('edit-composer', page.locator('.aui-edit-composer-root'), page.locator('.aui-edit-composer-input'), theme);
    await page.getByRole('button', { name: 'Cancel edit', exact: true }).click();
    await route('library');
    await page.locator('.library-document').first().waitFor();
    await inspect('library-search', page.locator('.library-search'), page.locator('.library-search input'), theme);
    await page.evaluate(() => window.dispatchEvent(new window.Event('vstudy:open-settings')));
    const settings = page.locator('.settings-dialog');
    await settings.locator('[role=tab][aria-controls$="-providers"]').click();
    const key = settings.locator('input[type=password]').first();
    await inspect('settings-input', key, key, theme, false);
    await settings.locator('[role=tab][aria-controls$="-usage"]').click();
    const prices = settings.getByRole('textbox', { name: 'Price overrides', exact: true });
    await inspect('settings-textarea', prices, prices, theme, false);
  }
  assert.deepEqual(errors, []);
  console.log(`${checks.length} field boundary checks passed in light/dark; screenshots: ${output}`);
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2) + '\n');
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
