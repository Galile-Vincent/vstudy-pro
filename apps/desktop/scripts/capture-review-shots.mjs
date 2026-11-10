import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { _electron as electron } from 'playwright';

const targetDir = '/private/tmp/claude-501/-Users-vc--t3-projects-vstudy-pro/68bc03fd-445c-465f-b3a7-abc16d2e0b8c/scratchpad/w2/review';
const desktop = fileURLToPath(new URL('..', import.meta.url));
const directory = join(desktop, 'node_modules', '.cache', 'review-shots-' + Date.now());
const prefix = process.argv[2] || 'before';

let app;
try {
  await mkdir(targetDir, { recursive: true });
  await mkdir(directory, { recursive: true });
  app = await electron.launch({
    args: [desktop, `--user-data-dir=${directory}`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', HOME: directory, XDG_CONFIG_HOME: directory, VSTUDY_LOCALE: 'en', VSTUDY_FAKE_PROVIDER: '1' }
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => !!window.desktop?.invoke);

  // Complete onboarding so views are active
  await page.evaluate(async () => {
    const settings = await window.desktop.invoke('settings:get', {});
    await window.desktop.invoke('settings:set', { ...settings, onboardingCompleted: true, welcomeSeen: true });
    window.localStorage.setItem('vstudy-onboarding-v1', JSON.stringify({ version: 1, step: 'start', goal: 'documents', status: 'completed', done: ['setup', 'document', 'walkthrough', 'help'], dismissed: ['workspace', 'courses'] }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const capture = async (filename) => {
    const outPath = join(targetDir, `${prefix}-${filename}.png`);
    await page.screenshot({ path: outPath, fullPage: true, animations: 'disabled' });
    console.log(`Saved screenshot: ${outPath}`);
  };

  for (const mode of ['light', 'dark']) {
    await page.evaluate(async (m) => {
      const s = await window.desktop.invoke('settings:get', {});
      await window.desktop.invoke('settings:set', { ...s, colorScheme: m, themeId: 'vstudy' });
      window.document.documentElement.classList.toggle('dark', m === 'dark');
    }, mode);
    await page.waitForTimeout(500);

    // 1. Review
    await page.locator('.shell-sidebar').getByRole('button', { name: 'Review', exact: true }).click();
    await page.locator('.review-page').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
    await capture(`review-${mode}`);

    // 2. Exams
    await page.locator('.shell-sidebar').getByRole('button', { name: 'Exams', exact: true }).click();
    await page.locator('.exams-view').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
    await capture(`exams-${mode}`);

    // 3. Usage
    await page.evaluate(() => window.dispatchEvent(new window.CustomEvent('vstudy:open-settings', { detail: { tab: 'usage' } })));
    await page.locator('.settings-dialog').waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
    await capture(`usage-${mode}`);

    // Close settings dialog
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
} finally {
  if (app) await app.close();
}
