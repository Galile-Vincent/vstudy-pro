import { _electron as electron } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
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
const sizes = flags.quick ? [[1280, 800]] : [[1280, 800], [1100, 720], [1100, 600]];
const locales = flags.quick ? ['en'] : ['en', 'zh-Hant', 'ja'];
const textSizes = flags.quick ? [100] : [100, 200];
const rows = [], axeResults = [], contrast = [], errors = [];
await mkdir(out, { recursive: true });

const luminance = ([r, g, b]) => [r, g, b].map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };

for (const locale of locales) for (const scheme of ['dark', 'light']) {
  const profile = await mkdtemp(join(tmpdir(), 'vstudy-settings-'));
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${profile}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: locale } });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(`${locale}/${scheme}: ${error.message}`));
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme });
    await page.evaluate(async ({ scheme, locale }) => { const s = await window.desktop.invoke('settings:get', {}); await window.desktop.invoke('settings:set', { ...s, language: locale, colorScheme: scheme, onboardingCompleted: true, welcomeSeen: true }); }, { scheme, locale });
    for (const uiScale of textSizes) for (const [width, height] of sizes) {
      await page.evaluate(async uiScale => { const s = await window.desktop.invoke('settings:get', {}); await window.desktop.invoke('settings:set', { ...s, uiScale }); }, uiScale);
      await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [width, height]);
      await page.reload();
      await page.locator('.app-shell').first().waitFor();
      await page.evaluate(() => window.dispatchEvent(new window.Event('vstudy:open-settings')));
      await page.locator('.settings-dialog[open]').waitFor();
      const tag = `${locale}-${scheme}-${width}x${height}-${uiScale}`;
      const tabList = page.locator('.settings-tabs');
      const horizontal = true;
      if (flags.assert) {
        const triggers = tabList.getByRole('tab');
        await triggers.nth(0).focus();
        await page.keyboard.press(horizontal ? 'ArrowRight' : 'ArrowDown');
        await page.waitForFunction(() => document.activeElement === document.querySelectorAll('.settings-tabs [role=tab]')[1]);
        await page.keyboard.press(horizontal ? 'ArrowLeft' : 'ArrowUp');
        await page.waitForFunction(() => document.activeElement === document.querySelectorAll('.settings-tabs [role=tab]')[0]);
        await triggers.nth(1).hover();
        await page.waitForTimeout(400);
        const hoverTint = await triggers.nth(1).evaluate(tab => window.getComputedStyle(tab.firstElementChild).backgroundColor);
        const hoverAlpha = Number(hoverTint.match(/(?:,|\/)\s*([\d.]+)\)$/)?.[1] ?? 1);
        assert.ok(hoverAlpha < 0.5, `${locale}-${scheme} hovered tab keeps its label visible (translucent hover layer): ${hoverTint}`);
        await page.mouse.move(0, 0);
      }
      for (const [index, tab] of tabs.entries()) {
        await page.locator('.settings-tabs [role=tab]').nth(index).click();
        await page.waitForTimeout(400);
        const pane = page.locator('.settings-pane:not([hidden])');
        const m = await page.evaluate(() => {
          const box = el => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
          const d = window.document.querySelector('.settings-dialog'), p = window.document.querySelector('.settings-pane:not([hidden])');
          return { dialog: box(d), tabs: box(window.document.querySelector('.settings-tabs')), header: box(window.document.querySelector('.settings-dialog h2')), inner: box(p.querySelector('.settings-pane-inner')), pane: p.clientHeight, scroll: p.scrollHeight, overflowX: p.scrollWidth > p.clientWidth + 1 || d.scrollWidth > d.clientWidth + 1, dialogScrolls: d.scrollHeight > d.clientHeight + 1 };
        });
        if (flags.assert && tab === 'providers') {
          const novice = JSON.parse(await readFile(resolve(`src/shared/locales/${locale}/novice.json`), 'utf8'));
          for (const key of ['privacy_lead', 'privacy', 'step_access', 'step_key']) {
            const shown = key.startsWith('privacy');
            const disclosure = pane.locator(shown ? '.settings-intro p' : '.settings-disclosure ol > li').filter({ hasText: novice[key] });
            assert.equal((await pane.textContent()).split(novice[key]).length, 2, `${tag} one ${key} disclosure including closed guides`);
            assert.equal(await disclosure.textContent(), novice[key], `${tag} exact ${key} disclosure`);
            assert.equal(await disclosure.isVisible(), shown, `${tag} ${key} is ${shown ? 'expanded' : 'collapsed'}`);
            assert.equal(await disclosure.evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('.provider-row input')) & window.Node.DOCUMENT_POSITION_FOLLOWING)), true, `${tag} ${key} precedes key entry`);
          }
          const hierarchy = await pane.locator('.settings-intro').evaluate(el => {
            const [lead, detail] = el.querySelectorAll('p'), a = window.getComputedStyle(lead), b = window.getComputedStyle(detail);
            return { lead: parseFloat(a.fontSize), detail: parseFloat(b.fontSize), gap: detail.getBoundingClientRect().top - lead.getBoundingClientRect().bottom, muted: a.color !== b.color };
          });
          assert.ok(hierarchy.lead > hierarchy.detail && hierarchy.muted && hierarchy.gap >= 8, `${tag} safety lead and helper text are separate levels ${JSON.stringify(hierarchy)}`);
          const spacing = await pane.locator('.astryx-card > .provider-row + .provider-row').evaluateAll(els => els.map(el => el.getBoundingClientRect().top - el.previousElementSibling.getBoundingClientRect().bottom));
          assert.ok(spacing.length > 0 && spacing.every(gap => gap >= 12), `${tag} provider forms have visible separation`);
        }
        if (flags.assert) assert.ok(Math.abs(m.inner[0] - m.header[0]) <= 2 && m.inner[2] <= 720, `${tag} ${tab} content aligns with the dialog title and stays within the reading width ${JSON.stringify([m.inner, m.header])}`);
        rows.push({ locale, scheme, uiScale, size: `${width}x${height}`, tab, ...m });
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
        if (locale === 'en' && width === 1280 && uiScale === 100) {
          const samples = await page.evaluate(() => {
            const rgba = value => { const n = (value.match(/[\d.]+/g) ?? []).map(Number); return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n.length > 3 ? n[3] : 1]; };
            const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3]));
            const backdrop = el => { const layers = []; for (let node = el; node; node = node.parentElement) { const c = rgba(window.getComputedStyle(node).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 0.99) break; } return layers.reverse().reduce((under, top) => over(top, under), [255, 255, 255]); };
            const pane = window.document.querySelector('.settings-pane:not([hidden])');
            const edge = (selector, label) => [...pane.querySelectorAll(selector)].slice(0, 1).map(el => { const cs = window.getComputedStyle(el); const bg = backdrop(el.parentElement); const own = parseFloat(cs.borderTopWidth) > 0 ? rgba(cs.borderTopColor) : rgba(cs.backgroundColor); return { selector: label, fg: over(own, bg), bg }; });
            const scrollbar = window.getComputedStyle(pane).scrollbarColor.match(/(?:rgba?|color)\([^)]*\)/g);
            if (!scrollbar || scrollbar.length !== 2) throw new Error('Expected explicit scrollbar thumb and track colors');
            return [
              { selector: 'scrollbar thumb', fg: over(rgba(scrollbar[0]), backdrop(pane)), bg: over(rgba(scrollbar[1]), backdrop(pane)) },
              ...edge('.astryx-switch:not([data-checked])', 'switch off edge'), ...edge('.astryx-switch[data-checked]', 'switch on fill'),
              ...edge('.astryx-selector', 'select edge'), ...edge('[data-pressable-container]:has(> input:not([type=checkbox], [type=radio], [type=range]))', 'input edge'),
              ...edge('.astryx-segmented-control', 'segmented edge'), ...edge('.astryx-segmented-control-item[data-selected]', 'segmented selected fill'),
              ...edge('.scheme-card[aria-pressed=true]', 'selected scheme edge'), ...edge('.theme-card[data-selected=true]', 'selected theme edge'),
              ...edge('button[data-variant=secondary]', 'secondary button edge'),
            ];
          });
          for (const sample of samples) contrast.push({ scheme, tab, selector: sample.selector, ratio: ratio(sample.fg, sample.bg) });
        }
      }
    }
  } finally {
    await app.close();
  }
}

const size = row => `${row.dialog[2]}x${row.dialog[3]}`;
const table = ['| locale | scheme | window | text size | tab | dialog | tabs list | pane height | content height | overflow-x | dialog scrolls |', '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.locale} | ${r.scheme} | ${r.size} | ${r.uiScale}% | ${r.tab} | ${size(r)} | ${r.tabs.join(',')} | ${r.pane} | ${r.scroll} | ${r.overflowX} | ${r.dialogScrolls} |`)].join('\n');
await writeFile(join(out, `${flags.label}-sizes.md`), table + '\n');
await writeFile(join(out, `${flags.label}-report.json`), JSON.stringify({ rows, axe: axeResults, contrast, errors }, null, 2) + '\n');
console.log(table);
if (axeResults.length) console.log(axeResults.map(a => `axe ${a.scheme} ${a.tab}: ${a.violations.join(', ') || 'no violations'}`).join('\n'));
const seen = new Set(contrast.map(c => `${c.scheme} ${c.selector} ${c.ratio}`));
console.log([...seen].sort().join('\n'));
if (errors.length) console.log('page errors:', errors);
if (flags.assert) {
  assert.deepEqual(errors, [], 'zero renderer errors');
  for (const row of rows) {
    const [width, height] = row.size.split('x').map(Number);
    assert.equal(row.dialog[2], Math.min(960, width - 32), `clamped 960px wide dialog for ${row.locale}/${row.scheme}/${row.size}/${row.uiScale}/${row.tab}`);
    assert.ok(row.dialog[3] <= height - 32, `dialog fits the window for ${row.locale}/${row.scheme}/${row.size}/${row.uiScale}/${row.tab}`);
  }
  for (const scheme of ['dark', 'light']) {
    for (const selector of ['select edge', 'input edge', 'segmented edge', 'scrollbar thumb']) {
      assert.ok(contrast.some(c => c.scheme === scheme && c.selector === selector), `required ${scheme} contrast sample ${selector}`);
    }
  }
  const stateSamples = new Set(['segmented selected fill', 'selected scheme edge', 'selected theme edge', 'secondary button edge']);
  for (const sample of contrast.filter(sample => !stateSamples.has(sample.selector))) assert.ok(sample.ratio >= 3, `${sample.scheme}/${sample.tab}/${sample.selector} contrast ${sample.ratio} must be at least 3:1`);
  for (const group of [...new Set(rows.map(r => `${r.locale}|${r.scheme}|${r.size}|${r.uiScale}`))]) {
    const set = rows.filter(r => `${r.locale}|${r.scheme}|${r.size}|${r.uiScale}` === group);
    assert.equal(new Set(set.map(size)).size, 1, `dialog size is constant across tabs for ${group}: ${set.map(r => `${r.tab}=${size(r)}`).join(' ')}`);
    assert.equal(new Set(set.map(r => r.tabs.join())).size, 1, `tab list does not move for ${group}`);
    assert.ok(set.every(r => !r.overflowX && !r.dialogScrolls), `only the pane scrolls, no horizontal overflow for ${group}`);
  }
  assert.deepEqual(axeResults.filter(a => a.violations.length), [], 'axe finds no violations on any tab');
  console.log('PASS clamped 960px dialog, fixed tabs, pane scrolling, contrast >= 3:1, zero renderer errors');
}
