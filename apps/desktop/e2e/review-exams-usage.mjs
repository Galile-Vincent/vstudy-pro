import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { _electron as electron } from 'playwright';

const evidence = resolve(process.env.REVIEW_EVIDENCE_DIR || '../../docs/evidence/review-exams-usage');
const profile = await mkdtemp(join(tmpdir(), 'vstudy-review-e2e-'));
const examCourse = '00000000-0000-4000-8000-000000000026';
const results = [];
const consentGeometry = {};
let app;
const launch = () => electron.launch({ args: [resolve('.'), `--user-data-dir=${profile}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: 'en', VSTUDY_FAKE_PROVIDER: '1' } });
try {
  await mkdir(evidence, { recursive: true });
  app = await launch();
  let page = await app.firstWindow();
  await page.waitForFunction(() => !!window.desktop?.invoke);
  const doc = await page.evaluate(async () => {
    const settings = await window.desktop.invoke('settings:get', {});
    await window.desktop.invoke('settings:set', { ...settings, onboardingCompleted: true, welcomeSeen: true, language: 'en' });
    await window.desktop.invoke('analytics:setConsent', { enabled: false });
    await window.desktop.invoke('providers:configure', { kind: 'api', id: 'anthropic-api', enabled: true });
    localStorage.setItem('vstudy-onboarding-v1', JSON.stringify({ version: 1, step: 'start', goal: 'documents', status: 'completed', done: ['setup', 'document', 'walkthrough', 'help'], dismissed: ['workspace', 'courses'] }));
    return window.desktop.invoke('documents:importSample', { language: 'en' });
  });
  await page.waitForFunction(async id => (await window.desktop.invoke('documents:get', { documentId: id }))?.status === 'ready', doc.id);
  const userData = await app.evaluate(({ app }) => app.getPath('userData'));
  await app.close(); app = undefined;
  const db = new DatabaseSync(join(userData, 'vstudy.sqlite'));
  db.prepare("INSERT OR IGNORE INTO study_courses(id,title,createdAt,archivedAt) VALUES(?,'Exams',?,?)").run(examCourse, new Date().toISOString(), new Date().toISOString());
  const source = { documentId: doc.id, version: 'original', excerptHash: 'a'.repeat(64), quote: 'A force changes the motion of an object.' };
  const common = { conceptKey: 'forces', explanation: 'Force changes motion. Review the source and compare the direction of the acceleration.', source };
  const items = [
    { ...common, id: 'q1', type: 'mcq', stem: 'Which statement explains how an applied force changes the motion of an object?', options: ['A force changes motion in the direction of the resulting acceleration.', 'A force always leaves motion unchanged.'], answer: 0 },
    { ...common, id: 'q2', type: 'multi_select', stem: 'Select the statements supported by the source.', options: ['Force can change motion.', 'Acceleration has a direction.', 'Force never affects motion.'], answer: [0, 1] },
    { ...common, id: 'q3', type: 'calculation', stem: 'Calculate the force when mass is 2 kg and acceleration is 3 m/s².', answer: 6, tolerance: 0, unit: 'N' },
    { ...common, id: 'q4', type: 'cloze', stem: 'A force changes the {{blank}} of an object.', answer: 'motion', alternatives: [] },
    { ...common, id: 'q5', type: 'true_false', stem: 'A force can change motion.', answer: true },
  ];
  const titles = {};
  for (const mode of ['light', 'dark']) {
    titles[mode] = `Physics practice ${mode}`;
    db.prepare("INSERT INTO study_artifacts(id,courseId,kind,title,scopeJson,resolvedScopeJson,status,idempotencyKey,attemptToken,testJson,providerId,modelId,promptVersion,createdAt) VALUES(?,?,'test',?,?,?,'ready',?,?,?,'anthropic-api','fake','v1',?)").run(randomUUID(), examCourse, titles[mode], JSON.stringify({ kind: 'documents', documentIds: [doc.id] }), JSON.stringify({ unitIds: [], documentIds: [doc.id], conceptKeys: ['forces'], from: null, to: null, timeZone: 'UTC', sources: [{ documentId: doc.id, version: 'original', excerptHash: source.excerptHash }], assumptions: [] }), randomUUID(), randomUUID(), JSON.stringify({ version: 1, items }), new Date().toISOString());
  }
  db.close();
  app = await launch(); page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => !!window.desktop?.invoke);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 1000));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const shot = async name => { await page.screenshot({ path: join(evidence, `${name}.png`), animations: 'disabled' }); };
  const nav = name => page.locator('.shell-sidebar').getByRole('button', { name, exact: true }).click();
  for (const mode of ['light', 'dark']) {
    await page.evaluate(async mode => {
      const settings = await window.desktop.invoke('settings:get', {});
      await window.desktop.invoke('settings:set', { ...settings, colorScheme: mode, themeId: 'vstudy' });
      localStorage.setItem('vstudy-route', JSON.stringify({ view: 'review' }));
      window.sessionStorage.clear();
    }, mode);
    await page.reload();
    await nav('Review');
    const consent = page.locator('.review-consent');
    await consent.waitFor();
    const geometry = await consent.evaluate(card => {
      const body = card.querySelector('.review-consent-body');
      const text = body.querySelector('p');
      const header = card.parentElement.querySelector('[data-slot="page-header"]');
      return { cardMargin: getComputedStyle(card).margin, parentGap: getComputedStyle(card.parentElement).gap, headerMargin: header && getComputedStyle(header).margin, siblings: [...card.parentElement.children].slice(0,3).map(el => ({ tag: el.tagName, class: el.className, height: el.getBoundingClientRect().height, display: getComputedStyle(el).display })), clipped: body.scrollHeight > body.clientHeight + 1, textClipped: text.scrollHeight > text.clientHeight + 1, shadow: getComputedStyle(card).boxShadow, gap: header ? card.getBoundingClientRect().top - header.getBoundingClientRect().bottom : null };
    });
    consentGeometry[mode] = geometry;
    assert.equal(geometry.clipped, false, JSON.stringify(geometry));
    assert.equal(geometry.textClipped, false);
    assert.equal(geometry.shadow, 'none');
    if (geometry.gap !== null) assert(geometry.gap <= 32, JSON.stringify(geometry));
    await shot(`review-${mode}`);
    await consent.getByRole('button', { name: 'Not now', exact: true }).click();
    await nav('Exams');
    await page.getByText(doc.title, { exact: true }).waitFor();
    const setup = page.locator('.exams-view');
    await setup.getByLabel(doc.title, { exact: true }).check();
    await setup.getByRole('combobox', { name: 'Difficulty', exact: true }).click();
    await page.getByRole('option', { name: 'Hard', exact: true }).click();
    await setup.getByLabel('Calculation', { exact: true }).fill('4');
    await setup.getByLabel('Calculation', { exact: true }).press('Tab');
    assert.equal(await setup.getByLabel('Calculation', { exact: true }).inputValue(), '4');
    await shot(`exams-start-${mode}`);
    await setup.getByRole('button', { name: 'Exam history', exact: true }).click();
    await setup.getByRole('button', { name: new RegExp(`^${titles[mode]}`) }).click();
    await page.locator('.exam-question-stem').waitFor();
    await shot(`exams-player-${mode}`);
    for (let i = 0; i < items.length; i++) {
      const player = page.locator('.exam-player');
      if (i === 0) await player.getByRole('radio').first().check();
      if (i === 1) { await player.getByRole('checkbox').nth(0).check(); await player.getByRole('checkbox').nth(1).check(); }
      if (i === 2 || i === 3) await player.getByRole('textbox').fill(i === 2 ? '6' : 'motion');
      if (i === 4) await player.getByRole('radio').first().check();
      await shot(`exams-${items[i].type}-${mode}`);
      await player.getByRole('button', { name: i === 4 ? 'Submit final answer' : 'Submit answer', exact: true }).click();
      if (i < 4) await player.getByRole('button', { name: 'Next question', exact: true }).click();
    }
    await page.getByRole('button', { name: 'View results', exact: true }).click();
    await page.getByRole('tab', { name: 'All', exact: true }).waitFor();
    await shot(`exams-results-${mode}`);
    await page.getByRole('tab', { name: 'Incorrect', exact: true }).click();
    await page.getByText('No incorrect answers.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Back to setup', exact: true }).click();
    await setup.getByRole('button', { name: 'Exam history', exact: true }).click();
    await setup.getByText('Loading your review…', { exact: true }).waitFor({ state: 'hidden' });
    await shot(`exams-history-${mode}`);
    await page.evaluate(() => window.dispatchEvent(new window.CustomEvent('vstudy:open-settings', { detail: { tab: 'usage' } })));
    const settings = page.locator('.settings-dialog');
    await settings.getByLabel('Monthly budget (USD)', { exact: true }).fill('12.5');
    await settings.getByLabel('Monthly token cap', { exact: true }).fill('5000');
    await settings.getByLabel('Warn at (%)', { exact: true }).fill('70');
    await settings.getByRole('button', { name: 'Save usage settings', exact: true }).click();
    const saved = await page.evaluate(() => window.desktop.invoke('settings:get', {}));
    assert.equal(saved.monthlyBudgetUsd, 12.5);
    assert.equal(saved.monthlyTokenBudget, 5000);
    assert.equal(saved.warnAtPercent, 70);
    await settings.getByText('Usage settings saved', { exact: true }).waitFor();
    await shot(`usage-${mode}`);
    await settings.getByRole('combobox', { name: 'Usage period', exact: true }).scrollIntoViewIfNeeded();
    await shot(`usage-dashboard-${mode}`);
    await page.keyboard.press('Escape');
    results.push(`PASS ${mode}: full consent, flat card, compact gap; exam selectors and all five answer types; results filter and history; usage budget save.`);
  }
  assert.deepEqual(errors, []);
  await writeFile(join(evidence, 'runtime.json'), JSON.stringify({ results, errors, consentGeometry }, null, 2));
  await rm(join(evidence, 'failure.png'), { force: true });
  console.log(results.join('\n'));
} catch (error) {
  if (app) await (await app.firstWindow()).screenshot({ path: join(evidence, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  if (app) await app.close();
  await rm(profile, { recursive: true, force: true });
}
