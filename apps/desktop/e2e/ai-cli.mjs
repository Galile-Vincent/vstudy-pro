/** Real Electron setup acceptance with signed fake CLIs and a live old-version chat during update. */
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { setTimeout } from 'node:timers';
import { createCliFixtures } from './fixtures/ai-cli.mjs';

const evidence = resolve(process.env.VSTUDY_AI_CLI_EVIDENCE ?? '../../docs/evidence/ai-cli/acceptance');
await mkdir(evidence, { recursive: true });
for (const name of ['failure.png', 'failure.txt', 'failure-state.json']) await rm(join(evidence, name), { force: true });
const root = await mkdtemp(join(tmpdir(), "vstudy-ai-cli 'fixture-"));
const fixtures = await createCliFixtures(join(root, 'vendor files'));
const full = process.env.VSTUDY_AI_CLI_MATRIX !== '0';
const opposite = process.env.VSTUDY_AI_CLI_OPPOSITE_SCHEMES === '1';
const variants = full ? ['en', 'zh-Hant', 'ja'].flatMap(language => ['paper', 'iris', 'contrast'].map(theme => ({ language, theme }))) : [{ language: 'en', theme: 'paper' }];
const results = [], snapshots = [];
let app, page;
const invoke = (channel, request = {}) => page.evaluate(({ channel, request }) => window.desktop.invoke(channel, request), { channel, request });
const until = async (check, message) => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(message);
};
const waitTool = async (provider, expected) => {
  const state = await until(async () => {
    const state = (await invoke('ai-cli:list')).find(tool => tool.provider === provider);
    if (state?.status === 'error' && expected.status !== 'error') throw new Error(`${provider}: ${state.error.code}`);
    return state && Object.entries(expected).every(([key, value]) => state[key] === value) ? state : null;
  }, `${provider} did not reach ${JSON.stringify(expected)}`);
  for (const [key, value] of Object.entries(expected)) assert.equal(state[key], value, `${provider} ${key}`);
  return state;
};
const capture = async (name, base) => {
  const path = join(evidence, `${base}-${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await writeFile(path.replace(/\.png$/, '.txt'), await page.locator('body').ariaSnapshot());
  snapshots.push(relative(resolve('../..'), path));
};
try {
  for (const [index, { language, theme }] of variants.entries()) {
    const colorScheme = (theme === 'iris') !== opposite ? 'dark' : 'light';
    const profile = join(root, `profile ${index}`), home = join(root, `home ${index}`);
    await mkdir(join(home, '.codex'), { recursive: true, mode: 0o700 });
    await writeFile(join(home, '.codex', 'auth.json'), '{}', { mode: 0o600 });
    for (const name of ['claude-signed-in', 'codex-signed-in', 'agy-signed-in', 'held.json', 'heartbeat', 'release-held', 'launches.jsonl']) await rm(join(fixtures.root, name), { force: true });
    await writeFile(join(fixtures.root, 'claude-latest'), '1.0.0');
    const copy = JSON.parse(await readFile(`src/shared/locales/${language}/ai-cli.json`, 'utf8'));
    const errors = [];
    app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${profile}`], env: { ...process.env, HOME: home, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: language, VSTUDY_AI_CLI_TEST: '1', VSTUDY_AI_CLI_FIXTURE_FILE: fixtures.fixtureFile } });
    page = await app.firstWindow(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => { errors.push(error.message); console.log('Renderer error: ' + error.message); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 900));
    await invoke('settings:set', { ...await invoke('settings:get'), onboardingCompleted: true, welcomeSeen: true, language, themeId: theme, colorScheme });
    await page.reload();
    const initial = await invoke('ai-cli:list');
    assert.ok(initial.every(tool => !tool.consented), 'providers start disabled');
    assert.equal(initial.find(tool => tool.provider === 'claude').status, 'not-installed');
    await assert.rejects(stat(join(fixtures.root, 'launches.jsonl')), 'file-only discovery launches nothing');
    await page.locator('.ai-cli-inventory-entry').first().click();
    await page.getByRole('heading', { name: copy.title, exact: true }).waitFor();
    await capture('1-install-consent', `${language}-${theme}`);
    await page.locator('.ai-cli-consent input').first().click();
    await page.getByRole('button', { name: copy.run_native, exact: true }).waitFor();
    assert.ok((await page.locator('#ai-cli-preview').innerText()).includes('1.0.0'), 'preview identifies the version');
    await capture('1-install-preview', `${language}-${theme}`);
    await page.getByRole('button', { name: copy.run_native, exact: true }).click();
    await waitTool('claude', { version: '1.0.0', managed: true, status: 'installed-not-signed-in' });
    await page.getByRole('button', { name: copy.run, exact: true }).waitFor();
    await capture('2-sign-in', `${language}-${theme}`);
    await page.getByRole('button', { name: copy.run, exact: true }).click();
    await page.waitForFunction(() => window.document.querySelector('.ai-cli-terminal .ai-cli-output')?.textContent.includes('LOCAL-1234'));
    const terminal = await page.locator('.ai-cli-xterm').boundingBox(), footer = await page.locator('.ai-cli-footer').boundingBox();
    assert.ok(terminal && footer && terminal.y >= 0 && terminal.y + terminal.height <= footer.y, 'sign-in output is visible without scrolling');
    await capture('2-device-code', `${language}-${theme}`);
    if (index === 0) {
      const launches = (await readFile(join(fixtures.root, 'launches.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      const login = launches.findLast(call => call.provider === 'claude' && call.args.includes('login'));
      assert.ok(login?.pid, 'sign-in is a real operating-system process');
      await page.reload();
      await until(async () => { try { process.kill(login.pid, 0); return false; } catch { return true; } }, 'reload left the old sign-in process alive');
      await page.locator('.ai-cli-inventory-entry').first().click();
      await page.getByRole('button', { name: copy.sign_in_again, exact: true }).click();
      await page.getByRole('button', { name: copy.run, exact: true }).click();
      await page.waitForFunction(() => window.document.querySelector('.ai-cli-terminal .ai-cli-output')?.textContent.includes('LOCAL-1234'));
      await capture('2-reload-recovery', `${language}-${theme}`);
    }
    await page.locator('.xterm-helper-textarea').focus(); await page.keyboard.type('approve'); await page.keyboard.press('Enter');
    await waitTool('claude', { status: 'ready', tested: false });
    await page.getByRole('button', { name: copy.test_it, exact: true }).waitFor();
    await capture('3-test', `${language}-${theme}`);
    await page.getByRole('button', { name: copy.test_it, exact: true }).click();
    await waitTool('claude', { tested: true });
    await page.getByText(copy.test_success, { exact: true }).waitFor();
    assert.ok(await page.locator('.ai-cli-terminal .ai-cli-output').textContent().then(value => value?.includes('OK from claude 1.0.0')));
    await page.locator('.ai-cli-terminal').scrollIntoViewIfNeeded();
    await capture('3-answer', `${language}-${theme}`);
    if (index === 0) {
      const conversation = await invoke('conversations:create', { scope: 'general', providerId: 'claude-cli', modelId: 'fixture-model' });
      await invoke('chat:start', { scope: 'general', requestId: '33333333-3333-4333-8333-333333333333', conversationId: conversation.id, providerId: 'claude-cli', modelId: 'fixture-model', userMessage: 'Hold the old version' });
      const deadline = Date.now() + 10000;
      let held;
      while (Date.now() < deadline) { try { held = JSON.parse(await readFile(join(fixtures.root, 'held.json'), 'utf8')); break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); } }
      assert.ok(held, 'real provider stream reached the fake old executable');
      assert.ok(held.binary.includes('/1.0.0/'));
      await fixtures.update();
      await invoke('ai-cli:checkUpdates');
      await page.evaluate(() => window.dispatchEvent(new window.Event('vstudy:ai-cli-changed')));
      await waitTool('claude', { status: 'update-available', latestVersion: '1.1.0' });
      await page.getByRole('button', { name: copy.update.replace('{{version}}', '1.1.0'), exact: true }).click();
      await page.getByRole('button', { name: copy.run_native, exact: true }).click();
      await waitTool('claude', { version: '1.1.0', previousVersion: '1.0.0', appliesToNewChats: true });
      process.kill(held.pid, 0);
      assert.ok(Date.now() - Number(await readFile(join(fixtures.root, 'heartbeat'), 'utf8')) < 2000, 'old process still makes progress after activation');
      await capture('4-updated-with-old-chat', `${language}-${theme}`);
      await writeFile(join(fixtures.root, 'release-held'), 'finish');
      await until(async () => (await invoke('messages:list', { conversationId: conversation.id })).some(message => message.role === 'assistant' && message.parts.some(part => part.text?.includes('The old session finished.'))), 'the original chat did not finish after activation');
      await page.getByRole('button', { name: copy.rollback.replace('{{version}}', '1.0.0'), exact: true }).click();
      await page.getByRole('button', { name: copy.run_native, exact: true }).click();
      await waitTool('claude', { version: '1.0.0', previousVersion: '1.1.0' });
      await capture('5-rollback', `${language}-${theme}`);
      results.push({ language, theme, colorScheme, reloadStopsSignInProcess: true, liveOldProcess: true, oldBinaryVersion: held.version, activated: '1.1.0', rollback: '1.0.0' });
    } else results.push({ language, theme, colorScheme, install: true, signIn: true, tinyTransportAnswer: true });
    for (const [provider, version, radio] of [['codex', '0.166.0', 1], ['agy', '1.0.0', 2]]) {
      await page.locator('.ai-cli-chooser input').nth(radio).click();
      await page.waitForFunction(id => window.document.querySelector('.ai-cli-chooser input:checked')?.closest('label')?.textContent.includes(id), provider === 'codex' ? 'Codex' : 'Antigravity');
      await capture(`${provider}-1-install`, `${language}-${theme}`);
      await page.locator('.ai-cli-consent input').first().click();
      await page.getByRole('button', { name: copy.run_native, exact: true }).click();
      await waitTool(provider, { version, managed: true, status: 'installed-not-signed-in' });
      await page.getByRole('button', { name: copy.run, exact: true }).waitFor();
      await capture(`${provider}-2-sign-in`, `${language}-${theme}`);
      await page.getByRole('button', { name: copy.run, exact: true }).click();
      await page.waitForFunction(() => window.document.querySelector('.ai-cli-terminal .ai-cli-output')?.textContent.includes('LOCAL-1234'));
      await page.locator('.xterm-helper-textarea').focus(); await page.keyboard.type('approve'); await page.keyboard.press('Enter');
      await waitTool(provider, { status: 'ready', tested: false });
      await page.getByRole('button', { name: copy.test_it, exact: true }).waitFor();
      await capture(`${provider}-3-test`, `${language}-${theme}`);
      await page.getByRole('button', { name: copy.test_it, exact: true }).click();
      await waitTool(provider, { tested: true });
      await page.getByText(copy.test_success, { exact: true }).waitFor();
      assert.ok((await page.locator('.ai-cli-terminal .ai-cli-output').textContent()).includes('OK from'), 'the real provider transport returned its fixture answer');
      await page.locator('.ai-cli-terminal').scrollIntoViewIfNeeded();
      await capture(`${provider}-3-answer`, `${language}-${theme}`);
      results.at(-1)[provider] = { install: true, signIn: true, tinyTransportAnswer: true, version };
    }
    await page.getByRole('button', { name: copy.close, exact: true }).click();
    await invoke('settings:set', { ...await invoke('settings:get'), uiScale: 125 });
    await page.reload();
    for (const [width, height] of [[900, 768], [1440, 900]]) {
      await app.evaluate(({ BrowserWindow }, [width, height]) => BrowserWindow.getAllWindows()[0].setSize(width, height), [width, height]);
      await page.evaluate(() => window.dispatchEvent(new window.CustomEvent('vstudy:ai-cli-setup', { detail: { provider: 'agy' } })));
      await page.getByRole('heading', { name: copy.title, exact: true }).waitFor();
      await capture(`layout-${width}-125`, `${language}-${theme}`);
      assert.equal(await page.locator('body').evaluate(body => body.scrollWidth > window.innerWidth), false, 'setup fits the viewport at 125%');
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => window.document.activeElement?.closest('.ai-cli-sheet')), 'keyboard focus stays in setup');
      await page.keyboard.press('Escape');
      await page.locator('.ai-cli-sheet').waitFor({ state: 'hidden' });
    }
    results.at(-1).layout125 = [900, 1440];
    results.at(-1).keyboard = true;
    assert.deepEqual(errors, [], 'renderer has no uncaught errors');
    await app.close(); app = undefined;
    console.log(JSON.stringify(results.at(-1)));
  }
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ fakeAccounts: true, realMainAndPreload: true, signedReleaseFixtures: true, realPty: true, results, snapshots }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) { await page.screenshot({ path: join(evidence, 'failure.png') }).catch(() => {}); await writeFile(join(evidence, 'failure.txt'), await page.locator('body').ariaSnapshot().catch(() => 'unavailable')); }
  await writeFile(join(evidence, 'failure-state.json'), JSON.stringify({ tools: page && !page.isClosed() ? await invoke('ai-cli:list').catch(() => []) : [], output: page && !page.isClosed() ? await page.locator('.ai-cli-terminal .ai-cli-output').textContent().catch(() => '') : '' }, null, 2));
  throw error;
} finally { if (app) await app.close(); await rm(root, { recursive: true, force: true }); }
