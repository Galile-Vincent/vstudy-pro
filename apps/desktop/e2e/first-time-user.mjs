/** Fresh-profile acceptance through visible controls. School replies use main-process fixtures. */
import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const evidence = resolve('../../docs/evidence/onboarding');
await mkdir(evidence, { recursive: true });
const results = [];
const selected = process.env.VSTUDY_FIRST_RUN_CASE;
const matrix = selected ? [selected.split(':')] : ['en', 'zh-Hant', 'ja'].flatMap(language => ['school', 'documents', 'sample'].map(goal => [language, goal]));
async function schoolFixture(app) {
  await app.evaluate(({ ipcMain }) => {
    const id = '11111111-1111-4111-a111-111111111111', courseId = '22222222-2222-4222-a222-222222222222';
    const course = { id: courseId, accountId: id, remoteId: 1, fullName: 'Example biology', shortName: 'BIO', imageUrl: null, progress: null, startAt: null, endAt: null, favourite: false, identity: { title: { en: 'Example biology', zh: 'Example biology' }, teachers: [], code: 'BIO', term: null, classLabel: { en: null, zh: null }, lifecycle: 'current', lifecycleSource: 'server', hidden: false, hasProgress: false, format: null, summaryHtml: null } };
    const deadline = { id: '33333333-3333-4333-a333-333333333333', courseId, title: 'Example lab report', kind: 'assignment', dueAt: new Date(Date.now() + 2 * 86400000).toISOString(), url: null, submitted: false };
    let account;
    const handlers = {
      'moodle:schools': () => [{ id: 'example', name: 'Example University', host: 'https://moodle.example.edu', login: 'password' }],
      'moodle:check-site': () => ({ siteUrl: 'https://moodle.example.edu', siteName: 'Example University', authPlan: { kind: 'password' } }),
      'moodle:preflight': () => ({ ready: true }),
      'moodle:connect': (_event, input) => { if (input.username !== 'student' || input.password !== 'example-only') throw new Error('Fixture credentials incorrect'); account = { id, siteUrl: input.siteUrl, siteName: 'Example University', remoteUserId: 1, displayName: 'Example Student', status: 'connected', syncedAt: new Date().toISOString() }; return account; },
      'moodle:overview': () => ({ accounts: account ? [account] : [], courses: account ? [course] : [], upcoming: account ? [deadline] : [], unreadNotifications: 0 }),
      'moodle:course': () => ({ course, deadlines: [deadline], notifications: [], grades: [], files: [], reminders: [], sections: [], announcements: [] }),
    };
    for (const [channel, handler] of Object.entries(handlers)) { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); }
  });
}
for (const [language, goal] of matrix) {
  const profile = await mkdtemp(join(tmpdir(), 'vstudy-first-time-'));
  const catalog = async ns => JSON.parse(await readFile(`src/shared/locales/${language}/${ns}.json`, 'utf8'));
  const schools = await catalog('schools'), themes = await catalog('themes');
  const copy = await catalog('onboarding'), common = await catalog('common'), moodle = await catalog('moodle'), home = await catalog('home');
  let app;
  const started = performance.now(), screenshots = [], violations = [], errors = [];
  try {
    const launch = async () => {
      app = await electron.launch({ timeout: 15000, args: [resolve('.'), `--user-data-dir=${profile}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: language, VSTUDY_FAKE_PROVIDER: '1' } });
      const page = await app.firstWindow({ timeout: 15000 });
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 900));
      page.on('pageerror', error => errors.push(error.message));
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' }); return page;
    };
    let page = await launch();
    const capture = async name => {
      const file = `${language}-${goal}-${name}.png`; await page.screenshot({ path: join(evidence, file), animations: 'disabled' }); screenshots.push(file);
      assert.ok(await page.locator('body').evaluate(node => node.scrollWidth <= window.innerWidth), 'no horizontal overflow');
    };
    const audit = async name => {
      const result = await new AxeBuilder({ page }).setLegacyMode(true).analyze();
      violations.push({ name, violations: result.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })) });
      assert.deepEqual(violations.at(-1).violations, [], name);
    };
    const next = () => page.locator('.onboarding footer .primary').click();
    await page.locator('.onboarding').waitFor(); await capture('welcome');
    if (language === 'en' && goal === 'sample') await audit('welcome');
    await next(); await page.locator('.onboarding').getByRole('combobox').click();
    await page.getByRole('option', { name: language === 'en' ? 'English' : language === 'ja' ? '日本語' : '繁體中文', exact: true }).click();
    await next(); await page.locator('#onboarding-title').filter({ hasText: copy.step_appearance }).waitFor();
    await page.locator('.scheme-grid').getByRole('button', { name: themes.light, exact: true }).click();
    await page.locator('.themes-grid').getByRole('button', { name: themes.name_ocean, exact: true }).click();
    await page.waitForFunction(() => window.document.documentElement.dataset.theme === 'ocean');
    if (goal === 'sample') await capture('appearance');
    await next(); await page.locator(`input[value=${goal}]`).check();
    if (language === 'en' && goal === 'sample') {
      await page.getByRole('button', { name: copy.later, exact: true }).click(); await page.locator('.onboarding').waitFor({ state: 'detached' });
      await app.close(); app = undefined; page = await launch();
      await page.getByRole('button', { name: copy.resume, exact: true }).click();
      await page.locator('#onboarding-title').filter({ hasText: copy.step_goal }).waitFor();
      assert.equal(await page.locator('input[value=sample]').isChecked(), true);
    }
    await capture('goal'); await next(); await page.locator('#onboarding-title').filter({ hasText: copy.step_ai }).waitFor();
    assert.equal(await page.locator('.onboarding input[type=password]').count(), 0, 'no early secret prompt');
    if (goal === 'sample') { await capture('ai'); await audit('ai'); }
    await page.getByRole('button', { name: copy.skip_ai, exact: true }).click();
    await page.locator('#onboarding-title').filter({ hasText: copy.step_start }).waitFor();
    const privacyShownAtMs = Math.round(performance.now() - started);
    if (goal === 'school') await schoolFixture(app);
    if (goal === 'documents') {
      await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, resolve('e2e/fixtures/reading.md'));
      await page.locator('.onboarding').getByRole('button', { name: home.choose_file, exact: true }).click();
      await page.locator('.onboarding footer .primary').filter({ hasText: copy.open_document }).waitFor();
    }
    if (goal === 'sample') {
      await page.locator('.onboarding').getByRole('button', { name: copy.sample, exact: true }).click();
      await page.locator('.onboarding').getByRole('button', { name: copy.sample_added, exact: true }).waitFor();
    }
    if (language === 'en' && goal === 'sample') {
      await page.getByRole('button', { name: copy.later, exact: true }).click();
      await page.locator('.onboarding').waitFor({ state: 'detached' });
      await app.close(); app = undefined; page = await launch();
      await page.getByRole('button', { name: copy.resume, exact: true }).click();
      await page.locator('.onboarding').getByRole('button', { name: copy.sample_added, exact: true }).waitFor();
      assert.equal(await page.locator('.onboarding footer .primary').isEnabled(), true, 'imported sample survives restart');
    }
    await capture('start');
    if (goal === 'sample') {
      await page.locator('.onboarding').getByRole('button', { name: copy.back, exact: true }).click();
      await page.locator('.onboarding').getByRole('button', { name: copy.back, exact: true }).click();
      await page.locator('.onboarding').getByRole('button', { name: copy.back, exact: true }).click();
      await page.locator('.scheme-grid').getByRole('button', { name: themes.dark, exact: true }).click();
      await next(); await next(); await next(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(720, 900));
      await capture('start-dark-720'); await audit('start-dark-720');
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 900)); await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    }
    await next(); await page.locator('.onboarding').waitFor({ state: 'detached' });
    if (goal === 'school') {
      const dialog = page.locator('.moodle-connect');
      await dialog.getByRole('combobox', { name: schools.search_label, exact: true }).fill('moodle.example.edu');
      await capture('school-picker');
      await dialog.getByRole('button', { name: moodle.check_site, exact: true }).click();
      await capture('school-result');
      await dialog.getByRole('button', { name: moodle.continue_sign_in, exact: true }).click();
      await dialog.getByLabel(moodle.username, { exact: true }).fill('student'); await dialog.getByLabel(moodle.password, { exact: true }).fill('example-only');
      await dialog.getByRole('button', { name: moodle.password_sign_in, exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('heading', { name: moodle.due_soon, exact: true }).waitFor();
      await page.getByRole('button', { name: 'Example lab report', exact: true }).click(); await page.getByRole('tab', { name: moodle.deadlines, exact: true }).click();
      await capture('due-work');
      await page.getByRole('button', { name: moodle.course_assistant, exact: true }).click(); await page.locator('#course-assistant-panel').waitFor({ state: 'visible' });
    } else {
      await page.getByTestId('document-markdown').waitFor();
      await page.getByTestId('document-markdown').focus();
      for (let character = 0; character < 32; character++) await page.keyboard.press('Shift+ArrowRight');
      await page.keyboard.press('Meta+Shift+k'); await page.locator('.selection-chip').waitFor();
      if (language === 'en' && goal === 'sample') {
        await capture('selection');
        const input = page.locator('.aui-composer-input'); await input.fill('Explain this sentence'); await input.press('Enter');
        await page.locator('[data-role=assistant]').first().waitFor();
        await capture('chat-answer');
        await page.getByRole('button', { name: common.conversations, exact: true }).click();
        await page.getByRole('searchbox', { name: common.search_threads, exact: true }).fill('Explain this sentence');
        await capture('history-search');
        await page.locator('[data-slot=aui_thread-list-items]').getByText('Explain this sentence', { exact: true }).first().click();
        await page.locator('[data-role=user]').filter({ hasText: 'Explain this sentence' }).waitFor();
      }
    }
    await capture('first-task'); const firstTaskMs = Math.round(performance.now() - started);
    await page.getByRole('button', { name: copy.dismiss_tip, exact: true }).click(); await page.reload(); await page.waitForFunction(() => !!window.desktop?.invoke);
    assert.equal(await page.locator('.context-coach').count(), 0, 'dismissed tip stays dismissed');
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
    await page.getByRole('button', { name: copy.help, exact: true }).click(); await page.getByRole('menuitem', { name: copy.help_walkthroughs, exact: true }).click();
    const help = page.locator('.learning-dialog');
    for (const lesson of ['school', 'due', 'agent', 'selection', 'history']) {
      await help.getByRole('button', { name: copy[`lesson_${lesson}`], exact: true }).click();
      await help.getByRole('button', { name: copy.next_caption, exact: true }).click(); await help.getByRole('button', { name: copy.next_caption, exact: true }).click();
      assert.ok((await help.locator('.walkthrough-node[data-active=true]').innerText()).includes(copy[`${lesson}_visual_2`]));
      if (language === 'en' && goal === 'sample') { await help.evaluate(node => { node.scrollTop = 0; }); await capture(`walkthrough-${lesson}`); }
    }
    if (goal === 'sample') await audit('walkthroughs');
    if (language === 'en' && goal === 'sample') {
      await help.locator('.recorded-example > summary').click();
      const playback = await help.locator('video').evaluate(async video => { await video.play(); await new Promise(resolve => video.addEventListener('timeupdate', resolve, { once: true })); video.pause(); return { width: video.videoWidth, time: video.currentTime, tracks: video.textTracks.length, cues: video.textTracks[0]?.cues?.length ?? 0 }; });
      assert.equal(playback.width, 960); assert.ok(playback.time > 0); assert.equal(playback.tracks, 3); assert.ok(playback.cues >= 3, 'subtitle file loads');
      await capture('recorded-video');
    }
    await help.getByRole('button', { name: common.close, exact: true }).click();
    await page.getByRole('button', { name: copy.help, exact: true }).click(); await page.getByRole('menuitem', { name: copy.help_shortcuts, exact: true }).click(); await capture('shortcuts');
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: copy.help, exact: true }).click(); await page.getByRole('menuitem', { name: copy.help_setup, exact: true }).click();
    await page.locator('#onboarding-title').filter({ hasText: copy.step_welcome }).waitFor(); await page.keyboard.press('Escape');
    assert.equal((await page.evaluate(() => window.desktop.invoke('settings:get', {}))).onboardingCompleted, true);
    assert.deepEqual(errors, [], 'renderer errors');
    results.push({ language, goal, firstTaskMs, totalMs: Math.round(performance.now() - started), privacyShownAtMs, schoolAuthentication: goal === 'school' ? 'main-process fixture; no live school or Keychain' : 'not used', ai: language === 'en' && goal === 'sample' ? 'local fake provider; question and chat-history search exercised' : 'local fake provider available; no external AI', screenshots, violations, errors });
    console.log(`PASS ${language}/${goal}: first task ${firstTaskMs}ms`);
  } catch (error) {
    const page = app?.windows()[0]; await page?.screenshot({ path: join(evidence, `${language}-${goal}-failure.png`) }).catch(() => {}); throw error;
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
    await writeFile(join(evidence, selected ? `case-${language}-${goal}.json` : 'first-time-user.json'), JSON.stringify(results, null, 2) + '\n');
  }
}
