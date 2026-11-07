/** Captures first run in an isolated profile. Baseline mode requires the original renderer. */
import { performance } from 'node:perf_hooks';
import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'vstudy-onboarding-audit-'));
const evidence = resolve('../../docs/evidence/onboarding');
await mkdir(evidence, { recursive: true });
let app;
try {
  const start = performance.now();
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: 'en' } });
  const page = await app.firstWindow();
  await page.locator('.onboarding').waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  const screens = [];
  const baseline = process.env.VSTUDY_CAPTURE_BASELINE === '1';
  const prefix = baseline ? 'before' : 'after';
  for (let i = 0; i < (baseline ? 4 : 8); i++) {
    const path = join(evidence, `${prefix}-${i + 1}.png`);
    await page.screenshot({ path });
    screens.push({ path, text: await page.locator('.onboarding').innerText() });
    if (!baseline && i === 7) await page.locator('.onboarding-content > button').click();
    if (!baseline && i === 4) await page.locator('.analytics-choices button').last().click();
    else await page.locator('.onboarding footer .primary').click();
  }
  await page.locator('.onboarding').waitFor({ state: 'detached' });
  if (!baseline) {
    await page.getByTestId('document-markdown').waitFor();
    await page.screenshot({ path: join(evidence, 'after-first-task.png') });
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('heading', { name: 'Getting started', exact: true }).waitFor();
  }
  await page.screenshot({ path: join(evidence, `${prefix}-home.png`) });
  await writeFile(join(evidence, `${prefix}.json`), JSON.stringify({ elapsedMs: Math.round(performance.now() - start), screens }, null, 2));
} finally { await app?.close(); await rm(directory, { recursive: true, force: true }); }
