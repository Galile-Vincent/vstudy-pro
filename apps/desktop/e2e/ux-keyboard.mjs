/** Regression coverage for global dialogs after replaying the first-run guide. */
import { _electron as electron } from 'playwright';
import { installSchoolFixture } from './ux-fixture.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'vstudy-ux-keyboard-'));
const evidence = resolve('../../docs/evidence/ux');
await mkdir(evidence, { recursive: true });
let app;
try {
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${profile}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: 'en', VSTUDY_FAKE_PROVIDER: '1' } });
  const page = await app.firstWindow();
  page.setDefaultTimeout(5000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.onboarding').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.onboarding').waitFor({ state: 'detached' });
  const results = [];
  for (const replay of [false, true]) {
    if (replay) {
      await page.getByRole('button', { name: 'Help', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Getting started setup', exact: true }).click();
      await page.locator('.onboarding').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.onboarding').waitFor({ state: 'detached' });
    }
    for (const shortcut of ['Meta+k', 'Control+k']) {
      const trigger = page.getByRole('button', { name: /Find a conversation/ });
      await trigger.focus();
      await page.keyboard.press(shortcut);
      const dialog = page.getByRole('dialog', { name: 'History', exact: true });
      await dialog.waitFor();
      await dialog.getByRole('searchbox').focus();
      await page.keyboard.press('Tab');
      await page.waitForFunction(() => window.document.querySelector('.history-dialog')?.contains(window.document.activeElement));
      assert.ok(await dialog.evaluate(node => node.contains(window.document.activeElement)), 'Tab stays in finder');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Escape');
      const closed = await dialog.waitFor({ state: 'detached', timeout: 1500 }).then(() => true, () => false);
      if (closed) {
        await page.waitForFunction(() => window.document.activeElement?.getAttribute('aria-label')?.includes('Find a conversation'));
        assert.ok(await trigger.evaluate(el => el === window.document.activeElement), 'focus returns to finder trigger');
        if (replay) await page.screenshot({ path: join(evidence, 'after-history-dismissed.png') });
      }
      results.push({ replay, shortcut, closed, focus: await page.evaluate(() => window.document.activeElement?.getAttribute('aria-label')) });
      if (!closed) {
        await page.screenshot({ path: join(evidence, 'before-history-escape.png') });
        await writeFile(join(evidence, 'before-history-escape.txt'), await page.locator('body').ariaSnapshot());
        await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      }
    }
  }
  await page.keyboard.press('Meta+k');
  await page.locator('.history-dialog').waitFor();
  await page.screenshot({ path: join(evidence, 'after-history-open.png') });
  await writeFile(join(evidence, 'after-history-open.txt'), await page.locator('body').ariaSnapshot());
  await page.keyboard.press('Escape');
  await writeFile(join(evidence, 'keyboard-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await installSchoolFixture(app);
  await page.evaluate(() => window.localStorage.setItem('vstudy-route', JSON.stringify({ view: 'courses', courseId: '10000000-0000-4000-8000-000000000010' })));
  await page.reload();
  await page.locator('.moodle-module').first().waitFor();
  await page.locator('.moodle-chat-button').click();
  await page.keyboard.press('Meta+k');
  await page.locator('.history-dialog').getByRole('searchbox').focus();
  await page.keyboard.press('Escape');
  await page.locator('.history-dialog').waitFor({ state: 'detached' });
  const retained = await page.locator('.moodle-chat-button').getAttribute('aria-expanded') === 'true';
  await page.screenshot({ path: join(evidence, retained ? 'after-nested-escape.png' : 'before-nested-escape.png') });
  assert.ok(retained, 'Escape closes only the top dialog and keeps the course assistant open');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.document.querySelector('.moodle-chat-button')?.getAttribute('aria-expanded') === 'false');
  console.log('PASS. Nested finder Escape preserves assistant, then assistant Escape restores its trigger.');
  assert.ok(results.every(result => result.closed), 'Escape closes History before and after guide replay');
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
