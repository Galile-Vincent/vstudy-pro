import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const profile = await mkdtemp(join(tmpdir(), 'vstudy-astryx-'));
const evidence = process.env.VSTUDY_EVIDENCE_DIR ?? join(tmpdir(), 'vstudy-astryx-hover');
await mkdir(evidence, { recursive: true });
const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${profile}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: 'en' } });
const samples = [];
try {
  const page = await app.firstWindow();
  for (const scheme of ['light', 'dark']) {
    await page.evaluate(async scheme => { const s = await window.desktop.invoke('settings:get', {}); await window.desktop.invoke('settings:set', { ...s, onboardingCompleted: true, welcomeSeen: true, colorScheme: scheme }); }, scheme);
    await page.reload();
    const row = page.locator('.shell-sidebar').getByRole('button', { name: 'Home', exact: true });
    await row.hover();
    await page.screenshot({ path: join(evidence, `${scheme}-sidebar.png`) });
    await page.evaluate(() => window.dispatchEvent(new window.Event('vstudy:open-settings')));
    const dialog = page.locator('.settings-dialog[open]');
    const targets = [
      ['button', dialog.getByRole('button').first()],
      ['tab', dialog.getByRole('tab').first()],
    ];
    for (const [kind, target] of targets) {
      await target.hover();
      assert.ok(await target.isVisible());
      const colors = await target.evaluate(el => {
        const style = getComputedStyle(el);
        return { hover: style.getPropertyValue('--color-overlay-hover'), pressed: style.getPropertyValue('--color-overlay-pressed') };
      });
      assert.match(colors.hover, /6%|0\.06/);
      assert.match(colors.pressed, /10%|0\.1/);
      samples.push({ scheme, kind, ...colors });
      await page.screenshot({ path: join(evidence, `${scheme}-${kind}.png`) });
    }
    await page.keyboard.press('Escape');
    await page.locator('.learning-help-trigger').first().click();
    const item = page.getByRole('menuitem').first();
    await item.hover();
    assert.ok((await item.innerText()).trim());
    await page.screenshot({ path: join(evidence, `${scheme}-menu.png`) });
    await page.keyboard.press('Escape');
  }
  console.log(JSON.stringify({ result: 'PASS', samples, evidence }));
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}
