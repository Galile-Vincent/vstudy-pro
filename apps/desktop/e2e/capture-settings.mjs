/** Settings dialog design evidence: every tab, both schemes, en and zh-Hant, two window sizes, open disclosures, sizes, axe, and non-text contrast. */
import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values: flags } = parseArgs({ options: {
  label: { type: 'string', default: 'after' },
  quick: { type: 'boolean', default: false },
  assert: { type: 'boolean', default: false },
  axe: { type: 'boolean', default: false },
} });
const out = resolve('../../docs/evidence/settings/design-pass');
const tabs = ['general', 'appearance', 'providers', 'agents', 'usage', 'storage', 'privacy'];
const sizes = flags.quick ? [[1280, 800]] : [[1280, 800], [1100, 720]];
const locales = flags.quick ? ['en'] : ['en', 'zh-Hant'];
const rows = [], axeResults = [], contrast = [], errors = [];
await mkdir(out, { recursive: true });

const luminance = ([r, g, b]) => [r, g, b].map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };

for (const locale of locales) for (const scheme of ['dark', 'light']) {
  const profile = await mkdtemp(join(tmpdir(), 'vstudy-settings-'));
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${profile}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: locale } });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(`${locale}/${scheme}: ${error.message}`));
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme });
  await page.evaluate(async ({ scheme, locale }) => { const s = await window.desktop.invoke('settings:get', {}); await window.desktop.invoke('settings:set', { ...s, language: locale, colorScheme: scheme, onboardingCompleted: true, welcomeSeen: true }); }, { scheme, locale });
  for (const [width, height] of sizes) {
    await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [width, height]);
    await page.reload();
    await page.locator('.app-shell').first().waitFor();
    await page.evaluate(() => window.dispatchEvent(new window.Event('vstudy:open-settings')));
    await page.locator('.settings-dialog[data-state=open]').waitFor();
    const tag = `${locale}-${scheme}-${width}x${height}`;
    for (const [index, tab] of tabs.entries()) {
      await page.locator('.settings-tabs [role=tab]').nth(index).click();
      await page.waitForTimeout(500);
      const pane = page.locator('.settings-pane:not([hidden])');
      const m = await page.evaluate(() => {
        const box = el => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
        const d = window.document.querySelector('.settings-dialog'), p = window.document.querySelector('.settings-pane:not([hidden])');
        return { dialog: box(d), tabs: box(window.document.querySelector('.settings-tabs')), header: box(window.document.querySelector('.settings-header')), pane: p.clientHeight, scroll: p.scrollHeight, overflowX: p.scrollWidth > p.clientWidth + 1 || d.scrollWidth > d.clientWidth + 1, dialogScrolls: d.scrollHeight > d.clientHeight + 1 };
      });
      rows.push({ locale, scheme, size: `${width}x${height}`, tab, ...m });
      await page.screenshot({ path: join(out, `${flags.label}-${tag}-${tab}.png`) });
      if (m.scroll > m.pane + 1) {
        await pane.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await page.waitForTimeout(150);
        await page.screenshot({ path: join(out, `${flags.label}-${tag}-${tab}-bottom.png`) });
        await pane.evaluate(el => { el.scrollTop = 0; });
      }
      if (await pane.locator('details').count()) {
        await pane.evaluate(el => { const all = [...el.querySelectorAll('details')]; all.forEach(d => { d.open = true; }); el.scrollTop += all[0].getBoundingClientRect().top - el.getBoundingClientRect().top - 16; });
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(out, `${flags.label}-${tag}-${tab}-open.png`) });
        if (flags.axe && locale === 'en' && width === 1280) {
          const result = await new AxeBuilder({ page }).setLegacyMode(true).include('.settings-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
          axeResults.push({ scheme, tab: `${tab} (open)`, violations: result.violations.map(v => `${v.id}: ${v.nodes.length}`) });
        }
        await pane.evaluate(el => { el.querySelectorAll('details').forEach(d => { d.open = false; }); el.scrollTop = 0; });
      }
      if (flags.axe && locale === 'en' && width === 1280) {
        const result = await new AxeBuilder({ page }).setLegacyMode(true).include('.settings-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        axeResults.push({ scheme, tab, violations: result.violations.map(v => `${v.id}: ${v.nodes.length}`) });
      }
      if (locale === 'en' && width === 1280) {
        const samples = await page.evaluate(() => {
          const rgba = value => { const n = (value.match(/[\d.]+/g) ?? []).map(Number); return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n.length > 3 ? n[3] : 1]; };
          const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3]));
          const backdrop = el => { const layers = []; for (let node = el; node; node = node.parentElement) { const c = rgba(window.getComputedStyle(node).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 0.99) break; } return layers.reverse().reduce((under, top) => over(top, under), [255, 255, 255]); };
          const pane = window.document.querySelector('.settings-pane:not([hidden])');
          const edge = (selector, label) => [...pane.querySelectorAll(selector)].slice(0, 1).map(el => { const cs = window.getComputedStyle(el); const bg = backdrop(el.parentElement); const own = parseFloat(cs.borderTopWidth) > 0 ? rgba(cs.borderTopColor) : rgba(cs.backgroundColor); return { selector: label, fg: over(own, bg), bg }; });
          return [
            ...edge('[data-slot=switch][data-state=unchecked]', 'switch off edge'), ...edge('[data-slot=switch][data-state=checked]', 'switch on fill'),
            ...edge('[data-slot=select-trigger]', 'select edge'), ...edge('input:not([type=checkbox], [type=radio], [type=range])', 'input edge'),
            ...edge('[data-slot=toggle-group]', 'segmented edge'), ...edge('[data-slot=toggle-group-item][data-state=on]', 'segmented selected fill'),
            ...edge('.scheme-card[aria-pressed=true]', 'selected scheme edge'), ...edge('.theme-card[data-selected=true]', 'selected theme edge'),
            ...edge('[data-slot=button][data-variant=secondary]', 'secondary button edge'),
          ];
        });
        for (const sample of samples) contrast.push({ scheme, tab, selector: sample.selector, ratio: ratio(sample.fg, sample.bg) });
      }
    }
  }
  await app.close();
}

const size = row => `${row.dialog[2]}x${row.dialog[3]}`;
const table = ['| locale | scheme | window | tab | dialog | tabs list | pane height | content height | overflow-x | dialog scrolls |', '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.locale} | ${r.scheme} | ${r.size} | ${r.tab} | ${size(r)} | ${r.tabs.join(',')} | ${r.pane} | ${r.scroll} | ${r.overflowX} | ${r.dialogScrolls} |`)].join('\n');
await writeFile(join(out, `${flags.label}-sizes.md`), table + '\n');
await writeFile(join(out, `${flags.label}-report.json`), JSON.stringify({ rows, axe: axeResults, contrast, errors }, null, 2) + '\n');
console.log(table);
if (axeResults.length) console.log(axeResults.map(a => `axe ${a.scheme} ${a.tab}: ${a.violations.join(', ') || 'no violations'}`).join('\n'));
const seen = new Set(contrast.map(c => `${c.scheme} ${c.selector} ${c.ratio}`));
console.log([...seen].sort().join('\n'));
if (errors.length) console.log('page errors:', errors);
if (flags.assert) {
  for (const group of [...new Set(rows.map(r => `${r.locale}|${r.scheme}|${r.size}`))]) {
    const set = rows.filter(r => `${r.locale}|${r.scheme}|${r.size}` === group);
    assert.equal(new Set(set.map(size)).size, 1, `dialog size is constant across tabs for ${group}: ${set.map(r => `${r.tab}=${size(r)}`).join(' ')}`);
    assert.equal(new Set(set.map(r => r.tabs.join())).size, 1, `tab list does not move for ${group}`);
    assert.ok(set.every(r => !r.overflowX && !r.dialogScrolls), `only the pane scrolls, no horizontal overflow for ${group}`);
  }
  assert.deepEqual(axeResults.filter(a => a.violations.length), [], 'axe finds no violations on any tab');
  console.log('PASS dialog size constant per window on every tab, header and tab list fixed, only the pane scrolls');
}
