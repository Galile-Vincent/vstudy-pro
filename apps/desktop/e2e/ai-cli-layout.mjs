/** Visual-only fixtures inspect layout independently of the real-process acceptance suite. */
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const evidence = resolve(process.env.VSTUDY_AI_CLI_LAYOUT_EVIDENCE ?? '../../docs/evidence/ai-cli/round-1');
await mkdir(evidence, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'vstudy-ai-cli-layout-'));
let app;
const errors = [];
try {
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${profile}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: 'en' } });
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Save and leave', exact: true }).click();
  await app.evaluate(({ ipcMain }) => {
    globalThis.cliVisualTools = ['claude', 'codex', 'agy'].map(provider => ({ provider, status: 'not-installed', consented: true, version: null, path: null, managed: false, latestVersion: null, releaseNotesUrl: null, checkedAt: null, previousVersion: null, appliesToNewChats: false, tested: false, error: null }));
    const handlers = {
      'ai-cli:list': () => globalThis.cliVisualTools,
      'ai-cli:preferences': () => ({ updateChecks: false, autoUpdateWhenIdle: false, advancedShell: false }),
      'ai-cli:preview': (_event, { actionId }) => ({ actionId, token: '11111111-1111-4111-8111-111111111111', command: actionId.startsWith('install') ? 'Download official Claude Code 2.1.318\nVerify publisher signature and SHA-256\nInstall in /private/app data/ai-tools/claude/2.1.318/' : '"/private/app data/ai-tools/claude/2.1.318/claude" auth login', cwd: '/private/app data/ai-tools/workspace', available: true, reason: null, expiresAt: Date.now() + 60000 }),
      'ai-cli:close': () => ({ ok: true }),
    };
    for (const [channel, handler] of Object.entries(handlers)) { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); }
  });
  for (const [language, width, height, theme, scheme, scale] of [
    ['en', 1200, 768, 'paper', 'light', 100],
    ['en', 1440, 900, 'iris', 'dark', 100],
    ['ja', 900, 768, 'contrast', 'light', 125],
    ['zh-Hant', 1200, 768, 'ocean', 'dark', 125],
  ]) {
    const copy = JSON.parse(await readFile(`src/shared/locales/${language}/ai-cli.json`, 'utf8'));
    await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setSize(w, h), [width, height]);
    await page.evaluate(async ({ language, theme, scheme, scale }) => { const settings = await window.desktop.invoke('settings:get', {}); await window.desktop.invoke('settings:set', { ...settings, language, themeId: theme, colorScheme: scheme, uiScale: scale }); }, { language, theme, scheme, scale });
    await page.reload();
    await page.evaluate(() => window.dispatchEvent(new window.CustomEvent('vstudy:ai-cli-setup')));
    await page.getByRole('heading', { name: copy.title, exact: true }).waitFor();
    await page.locator('#ai-cli-preview code').first().waitFor();
    const base = `${language}-${width}-${theme}-${scheme}-${scale}`;
    await page.screenshot({ path: join(evidence, `${base}.png`), animations: 'disabled' });
    await writeFile(join(evidence, `${base}.txt`), await page.locator('body').ariaSnapshot());
    const primary = await page.getByRole('button', { name: copy.run_native, exact: true }).boundingBox();
    const footer = await page.locator('.ai-cli-footer').boundingBox();
    if (width >= 1200 && scale === 100) assert.ok(primary && footer && primary.y + primary.height <= footer.y, 'primary action is visible before scrolling');
    assert.equal(await page.locator('body').evaluate(body => body.scrollWidth > window.innerWidth), false, 'viewport contains the setup sheet');
    await page.getByRole('button', { name: copy.close, exact: true }).click();
  }
  assert.deepEqual(errors, []);
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ kind: 'visual fixtures only, no process acceptance', errors }, null, 2));
} finally { if (app) await app.close(); await rm(profile, { recursive: true, force: true }); }
