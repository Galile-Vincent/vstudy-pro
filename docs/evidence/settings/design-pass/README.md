# Settings dialog design pass

Rerun from `apps/desktop` after `pnpm build`:

```
node e2e/capture-settings.mjs --label before --axe
node e2e/capture-settings.mjs --label after-3 --axe --assert
```

Each run writes window screenshots for every tab in dark and light, `en` and `zh-Hant`, at 1280x800 and 1100x720. It adds `-bottom` shots for scrolling panes and `-open` shots with every disclosure open. `<label>-sizes.md` is the measured size table. `<label>-report.json` holds the same rows plus axe results and sampled non-text contrast.

## Critique of `before-*`

Measured in `before-sizes.md` and seen in the screenshots.

1. The dialog changes size. Six tabs are 880x640. Appearance is 1100x768 at 1280x800 and 1068x688 at 1100x720. The tab list jumps 110 px sideways when you open Appearance.
2. Two heading systems. General, Usage, Storage and Privacy use small uppercase muted labels. Appearance and Agents use bold sentence-case headings at two other sizes.
3. Appearance scrolls 1651 px. Three scheme cards take 260 px. Nine theme packs with large spheres take three rows of 220 px. Text size, density, reader font, reader size, material, contrast and glass opacity sit in one flat list under the label "Interface". Create theme and Add theme float as bare text next to the heading.
4. General. The two language selects have different widths (14rem and 16rem) so right edges do not line up. The About row button reads "What is VStudy Pro? · Try it", which joins two unrelated labels. "Show welcome guide" repeats its row label.
5. AI services. The setup guide is a full card of prose at the top of the pane. Its ordered list lost its numbers. AI tools render as wrapping chips that mix sans names with monospace "Not installed". Each API provider row is a wall: a link, a primary white Test connection button, two paragraphs, then the key form. The Advanced summary is unstyled browser text.
6. Usage is 1880 px and Privacy 1920 px tall. Long prose sits inside tonal cards with no rhythm. In Privacy the converter status line sits flush against the card edge, outside the padding.
7. Fields have no visible edge. Inputs, selects and segmented controls are a 5 percent ink fill on a 4 percent ink card. Budget inputs in dark mode are nearly invisible (measured 1.06:1 for the field edge in light).
8. Groups are tonal grey slabs with no dividers between rows. Rows inside one group read as one blob.

axe (wcag2a, wcag2aa, wcag21aa) found no violations on any tab before the change. Text contrast was already fine. The problems are layout, hierarchy and non-text contrast.

## Design decisions in `after-3-*`

1. One shell. `min(1000px, 100vw - 32px)` by `min(700px, 100dvh - 32px)` on every tab. Measured 1000x700 at 1280x800 and 1000x688 at 1100x720, identical on all seven tabs, in both schemes and both locales. A hairline separates the fixed header and the fixed tab list. Only the pane scrolls, with a 16 px top and 32 px bottom fade mask and a thin overlay scrollbar.
2. One type scale. Pane title `--type-lg`. Section title `--type-md`, sentence case, ink. Row label `--type-base`. Helper `--type-sm`, muted. No more uppercase labels.
3. One group style. Hairline frame (`--hairline`, 10 percent ink), hairline dividers between rows, no tonal fill. Control edges use `--line` (3:1 token). Selected segments, scheme and theme cards use solid ink.
4. Appearance, in this order. Compact scheme cards with the shared ThemePreview and a check circle, the same pattern as onboarding. Then "Text and reading", so text size is in the first view at 200 percent. Then theme packs as a 3 by 3 grid of 40 px rows with flat two-color swatches (no gradient spheres). "Text and reading" holds text size, density, reader font, reader size and the live sample. "Advanced" holds material, contrast, glass opacity and custom themes. Scroll went from 1651 to 1010 px.
5. General. Both selects share a 16rem control column. Buttons read "Show" and "Open" with a one-line helper under each label.
6. AI services. "How to get AI answers" is a collapsed disclosure with real numbered steps. AI tools are rows: name, version or "Not installed" in sans, state, one chevron action. Guided setup and the update check sit in one footer row. API keys rows: name and state, then Get a key and Test connection, then the key form, then the help text. The Advanced disclosure is unchanged in content.
7. Usage, Storage, Privacy and Agents use the same groups. Pane intros sit under the title. The usage table and chart use hairline frames.

## Measured after the change

`after-3-sizes.md` and `after-3-report.json`. axe found no violations on any tab, with and without disclosures open, in dark and light. Sampled non-text contrast: control edges 4.4:1 (dark) and 4.54:1 (light). Selected states 18.09:1 and 19.8:1.
