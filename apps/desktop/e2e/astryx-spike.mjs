import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const desktop = resolve(import.meta.dirname, '..');
const evidence = resolve(process.env.ASTRYX_EVIDENCE_DIR ?? join(tmpdir(), 'vstudy-astryx-spike'));
const profile = await mkdtemp(join(tmpdir(), 'vstudy-astryx-'));
const errors = [];
const results = [];
let app;
try {
  await mkdir(evidence, { recursive: true });
  app = await electron.launch({ args: [desktop, `--user-data-dir=${profile}`], env: {
    ...process.env, ELECTRON_RUN_AS_NODE: '', HOME: profile, XDG_CONFIG_HOME: profile,
    VSTUDY_LOCALE: 'en', VSTUDY_FAKE_PROVIDER: '1',
  } });
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/Content Security Policy|Refused to/.test(message.text())) errors.push(message.text()); });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 1100));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { window.location.hash = '#/design'; });
  const response = await page.reload();
  const csp = (await response.allHeaders())['content-security-policy'];
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /connect-src 'none'/);
  const gallery = page.getByRole('region', { name: 'Astryx components', exact: true });
  await gallery.waitFor();
  await page.getByLabel('Astryx course name', { exact: true }).fill('Memory and learning');
  await page.getByRole('switch', { name: 'Astryx study reminders', exact: true }).click();
  assert.equal(await page.getByRole('switch', { name: 'Astryx study reminders', exact: true }).isChecked(), false);
  assert.equal(await page.getByLabel('Astryx course name', { exact: true }).inputValue(), 'Memory and learning');
  await page.getByRole('radio', { name: 'This week', exact: true }).click();
  assert.equal(await page.getByRole('radio', { name: 'This week', exact: true }).getAttribute('aria-checked'), 'true');
  await gallery.getByRole('button', { name: 'Planner', exact: true }).click();
  await gallery.getByRole('button', { name: 'Astryx actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Review notes', exact: true }).click();
  assert.match(await gallery.locator('output').innerText(), /Review notes selected · planner · week/);
  await gallery.getByRole('button', { name: 'Astryx tooltip', exact: true }).hover();
  await page.getByRole('tooltip').waitFor();
  await page.mouse.move(1400, 1000);
  await page.getByRole('tooltip').waitFor({ state: 'hidden' });
  for (const mode of ['light', 'dark']) {
    await page.getByLabel('Scheme', { exact: true }).selectOption(mode);
    for (const theme of ['vstudy', 'ocean', 'grove', 'ember', 'iris', 'rose', 'slate', 'paper', 'contrast']) {
      await page.getByLabel('Theme pack', { exact: true }).selectOption(theme);
      await page.waitForFunction(({ theme, mode }) => {
        const root = window.document.documentElement;
        return root.dataset.theme === theme && root.dataset.scheme === mode &&
          window.getComputedStyle(window.document.querySelector('#root > [data-astryx-theme]')).colorScheme === mode;
      }, { theme, mode });
      const tokens = await page.evaluate(() => {
        const root = window.getComputedStyle(window.document.documentElement);
        const provider = window.getComputedStyle(window.document.querySelector('#root > [data-astryx-theme]'));
        return { ink: root.getPropertyValue('--ink').trim(), astryxInk: provider.getPropertyValue('--color-text-primary').trim(), accent: root.getPropertyValue('--accent-color').trim(), astryxAccent: provider.getPropertyValue('--color-accent').trim() };
      });
      assert.equal(tokens.ink, tokens.astryxInk);
      assert.equal(tokens.accent, tokens.astryxAccent);
      results.push({ theme, mode, ...tokens });
    }
    await page.getByLabel('Theme pack', { exact: true }).selectOption('vstudy');
    await gallery.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(evidence, `${mode}.png`) });
    const trigger = gallery.getByRole('button', { name: 'Astryx dialog', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Study session', exact: true });
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /Memory and learning/);
    await page.screenshot({ path: join(evidence, `${mode}-dialog.png`) });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate(element => element === window.document.activeElement), true);
  }
  assert.deepEqual(errors, []);
  await writeFile(join(evidence, 'runtime.json'), JSON.stringify({ url: page.url(), csp, results, errors, interactions: 'TextInput, Switch, SegmentedControl, SideNav, DropdownMenu, Tooltip, Dialog Escape and focus return passed' }, null, 2));
  console.log(`PASS: eight Astryx components, 18 theme/mode mappings, no page/CSP errors. Evidence ${evidence}`);
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
