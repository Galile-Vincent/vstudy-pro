import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { seedRoute } from './helpers/tab-route.mjs';
import { seedArtCourses } from './fixtures/art-courses.mjs';
import { captureTime, seedCoursesDesign } from './fixtures/courses-design.mjs';

const phase = process.env.COURSES_CAPTURE_PHASE ?? 'astryx';
const evidence = resolve(process.env.VSTUDY_EVIDENCE_DIR ?? '../../docs/evidence/courses/design-pass');
const profile = await mkdtemp(join(tmpdir(), 'courses-astryx-'));
const results = { phase, screens: [], audits: [], errors: [] };
await mkdir(evidence, { recursive: true });
let app;
try {
  app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${profile}`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: 'en', VSTUDY_FAKE_PROVIDER: '1' },
  });
  const page = await app.firstWindow();
  await page.evaluate(() => window.desktop.invoke('analytics:setConsent', {enabled:false}));
  page.on('pageerror', error => results.errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setMinimumSize(320, 320));
  const fixture = await seedCoursesDesign(app, profile);
  await page.clock.setFixedTime(captureTime);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const capture = async name => {
    const file = `${phase}-${name}.png`;
    await page.screenshot({ path: join(evidence, file), animations: 'disabled' });
    results.screens.push(file);
  };
  const navigate = async (route, language = 'en', colorScheme = 'light') => {
    await page.evaluate(async ({ language, colorScheme }) => {
      const settings = await window.desktop.invoke('settings:get', {});
      await window.desktop.invoke('settings:set', { ...settings, language, colorScheme, themeId: 'vstudy', onboardingCompleted: true, welcomeSeen: true });
      localStorage.setItem('vstudy-onboarding-v1', JSON.stringify({ version: 1, step: 'start', goal: 'school', status: 'completed', done: ['setup'], dismissed: ['courses'] }));
    }, { language, colorScheme });
    await seedRoute(page, route);
    await page.reload();
    await page.locator(route.courseId ? '.course-head' : '.moodle-course-card').first().waitFor();
  };
  const audit = async name => {
    const report = await new AxeBuilder({ page }).setLegacyMode(true).include('[data-course]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const violations = report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }));
    results.audits.push({ name, violations });
    assert.deepEqual(violations, [], name);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} has no horizontal overflow`);
    assert.equal(await page.getByRole('main').count(), 1);
  };
  for (const width of process.env.COURSES_CAPTURE_NARROW_ONLY === '1' ? [552] : [552, 900, 1280]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 800), width);
    for (const language of ['en', 'zh-Hant', 'ja']) for (const scheme of ['light', 'dark']) {
      await navigate({ view: 'courses' }, language, scheme);
      const name = `${language}-${scheme}-${width}`;
      await audit(name);
      await capture(name);
    }
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
  await navigate({ view: 'courses' });
  const termTabs = page.getByRole('tablist', { name: 'Course terms' }).getByRole('tab');
  assert.equal(await termTabs.count(), 4);
  for (const tab of await termTabs.all()) {
    await tab.click();
    assert.equal(await tab.getAttribute('aria-selected'), 'true');
    const panel = page.locator(`[id="${await tab.getAttribute('aria-controls')}"]`);
    assert.equal(await panel.isVisible(), true);
    assert.equal(await panel.getAttribute('aria-labelledby'), await tab.getAttribute('id'));
  }
  await page.getByRole('combobox', { name: 'Sort courses' }).click();
  await page.getByRole('option', { name: 'Name', exact: true }).click();
  assert.ok((await page.getByRole('combobox', { name: 'Sort courses' }).textContent()).includes('Name'));
  const firstId = fixture.details[0].course.id;
  const row = page.locator(`[data-course-id="${firstId}"]`);
  const pin = row.locator('.course-pin');
  await pin.focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(id => document.querySelector(`[data-course-id="${id}"] .course-pin`)?.getAttribute('aria-pressed') === 'true', firstId);
  await pin.focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(id => document.querySelector(`[data-course-id="${id}"] .course-pin`)?.getAttribute('aria-pressed') === 'false', firstId);
  await row.locator('.course-open').focus();
  await page.keyboard.press('Enter');
  await page.locator('.course-head').waitFor();
  const richFixture = await seedArtCourses(app, captureTime);
  await navigate({view:'courses',courseId:richFixture.details[0].course.id});
  const week = page.locator('.moodle-week-heading').first();
  await week.scrollIntoViewIfNeeded();
  if (await week.getAttribute('aria-expanded') !== 'true') await week.click();
  const module = page.locator('.moodle-module').first().getByRole('button').first();
  await module.click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await module.evaluate(node => node === document.activeElement), true);
  await page.getByRole('button', { name: 'More course actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Disconnect school', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('tab', { name: 'Deadlines', exact: true }).click();
  assert.equal(await page.getByRole('tab', { name: 'Deadlines', exact: true }).getAttribute('aria-selected'), 'true');
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await page.getByRole('button', { name: 'Course assistant', exact: true }).click();
  const assistant = page.locator('#course-assistant-panel');
  await assistant.waitFor();
  const contentBounds = await page.locator('.course-detail-content').boundingBox();
  const assistantBounds = await assistant.boundingBox();
  assert.ok(assistantBounds.x >= contentBounds.x + contentBounds.width - 1, 'Assistant docks beside the course');
  await capture('assistant-docked');
  await page.keyboard.press('Escape');
  await assistant.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'Course assistant', exact: true }).evaluate(node => node === document.activeElement), true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(720, 800));
  await page.getByRole('button', { name: 'Course assistant', exact: true }).click();
  await assistant.waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Docked assistant fits a narrow window');
  await capture('assistant-narrow');
  await page.keyboard.press('Escape');
  await audit('course-detail');
  assert.deepEqual(results.errors, []);
  await rm(join(evidence, 'failure.png'), {force:true});
  results.artifact = createHash('sha256').update(await readFile('out/main/index.js')).digest('hex');
  console.log(`PASS Courses: ${results.screens.length} screenshots; responsive en/zh-Hant/ja, terms, sort, keyboard pins, course opening, drawer focus return, disconnect cancellation, detail tabs, docked assistant, axe.`);
} catch (error) {
  if (app?.windows()[0]) await app.windows()[0].screenshot({ path: join(evidence, 'failure.png') });
  throw error;
} finally {
  await writeFile(join(evidence, `${phase}-results.json`), JSON.stringify(results, null, 2));
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
