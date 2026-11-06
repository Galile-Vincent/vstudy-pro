# U3 marketing refresh

The owner wanted the README and website to show the redesigned product as curated marketing art. The delivered images show the real built app with a populated semester, an answered Reader, and a styled teacher page inside the real Moodle pane.

## Pipeline

Run from the repository root.

```sh
pnpm build
node apps/desktop/scripts/marketing-shots.mjs
```

`SHOT_THEMES`, `SHOT_MODES`, and `SHOT_ONLY` accept comma-separated filters. Filtered reshoots update matching manifest entries and preserve the rest of the contact sheet. See `docs/assets/readme/README.md` for the complete capture contract.

The view registry prepares eleven real app views. The seed reuses the existing eight-course fixture and adds six documents in two folders, five tasks, one exam, three approved study blocks, and eight saved simulated conversations. The Reader stores structured selection metadata and a source citation. The isolated process fixes UUID generation and its date epoch. Main's elapsed clock keeps security rate limiting functional. It enables the existing fake provider and never contacts a real school or paid AI service.

One Electron instance captures 1440 × 900 CSS pixels at 2×. All 132 variants have 2880 × 1800 WebP and AVIF exports. WebP quality is 82. The byte ceiling is 220,000 per image. The largest WebP is 186,566 bytes; the largest AVIF is 104,291 bytes. `export-audit.json` verifies every exported image's dimensions, bytes, and manifest entry.

## Shot sizes

Sizes are bytes. The default columns are VStudy light. Each view also has Ocean, Grove, Ember, Iris, and Rose in light and dark. `manifest.json` contains every individual size.

| Shot | Default WebP | Default AVIF | Largest WebP in matrix |
| --- | ---: | ---: | ---: |
| courses-home | 163,584 | 90,780 | 170,140 |
| course-page | 125,206 | 64,447 | 132,106 |
| planner-today | 110,260 | 57,043 | 115,074 |
| reader-chat-with-answer | 176,742 | 97,172 | 186,566 |
| history-search | 69,040 | 36,008 | 72,494 |
| library | 105,660 | 57,205 | 110,314 |
| home | 145,042 | 76,534 | 149,994 |
| themes-settings | 64,974 | 35,607 | 67,920 |
| moodle-webview | 149,002 | 79,877 | 154,902 |
| storage-settings | 58,760 | 30,467 | 61,560 |
| onboarding-welcome | 67,446 | 35,763 | 70,438 |

## Before and after

`before/reader.webp` shows the previous mostly empty reading workspace. The new `docs/assets/readme/reader.webp` has a selected passage, a complete simulated answer, and a source citation.

`before/courses.webp` shows the previous flat course layout. The new `docs/assets/readme/courses.webp` frames seven complete art cards with teachers, progress, and deadlines. The eighth, past course remains in the fixture.

`before/webview.webp` shows the old raw fixture content. `docs/assets/readme/course.webp` now shows the actual app course page. `docs/assets/readme/webview.webp` separately shows the styled demo teacher page.

The website's three hero comparisons are `hero-reader.png`, `hero-courses.png`, and `hero-course-page.png`. Courses won because its artwork and short titles remain clear at website scale. Reader and course detail remain in their matching feature sections. `../../art/marketing-decision.md` records the design and capture decisions.

The final `contact-sheet.png` contains all 132 accepted shots. The visual review rejected clipped cards, incorrect message order, model-name truncation, the empty Planner form, inherited course scroll, and white Moodle cards in dark mode. Each issue was corrected and reshot. Theme sheets and full-resolution raw PNGs remain local evidence; the source exports and full contact sheet are committed.

## Website validation

The production build emits 49 pages across English, Traditional Chinese, and Japanese. All 1,958 checked links pass. Every screenshot has alt text and explicit dimensions. Images below the hero are lazy. The final home-page image total is 213,606 bytes, below 400,000. `static.txt` records the audit.

T3's preview browser checked all 49 pages at desktop and 390-pixel mobile widths, plus 72 home language, theme, scheme, and width combinations. All 170 cases have zero WCAG 2 A/AA and 2.1 AA axe violations and no horizontal page overflow. All six theme buttons load and decode the matching light and dark captures. `browser-audit.json` records the cases. The owned preview tabs were closed after verification.

The following are individual local Lighthouse mobile runs against the production build. They are not production-hosting performance comparisons. The columns are performance, accessibility, best practices, and SEO.

| Page | Lighthouse scores | CLS |
| --- | --- | ---: |
| docs-course | 100 / 100 / 100 / 100 | 0 |
| docs-moodle | 100 / 100 / 100 / 100 | 0 |
| docs-planner | 100 / 100 / 100 / 100 | 0 |
| docs-reader | 100 / 100 / 100 / 100 | 0 |
| home-en | 100 / 100 / 100 / 100 | 0 |
| home-ja | 100 / 100 / 100 / 100 | 0 |
| home-zh-Hant | 100 / 100 / 100 / 100 | 0 |

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed without changing the lockfile. |
| `pnpm build` | Passed for built Electron main, preload, and renderer. |
| `node apps/desktop/scripts/marketing-shots.mjs` | Passed for the full 132-shot matrix. Filtered course and Moodle reshoots passed and merged into that manifest. |
| `pnpm typecheck` | Passed. The final website check also passed with zero errors, warnings, or hints. |
| `pnpm lint` | Passed. The final capture scripts also pass scoped ESLint. |
| `pnpm knip` | Passed with one existing CSS configuration hint. |
| `pnpm security:static` | Passed with three existing Electron security lint warnings. |
| `pnpm test --pool=forks --maxWorkers=2` | 997 passed, 14 skipped. Full suite ran once. Contrast checks passed. |
| `pnpm --filter @vstudy/website build` | 49 production pages built. |
| `pnpm --filter @vstudy/website verify:static` | Passed, including the 400 KB home image budget. |
| Occupied fixture port runtime check | Expected EADDRINUSE, exit code 1, and no remaining Electron process. |
| `node scripts/check-readme-links.mjs` | 134 local Markdown links passed. |
| T3 `preview_*` browser and axe | 170 cases passed; six theme swaps decoded correctly. |
| Lighthouse CLI | Seven pages scored 100 in every category, with CLS 0. |

Lighthouse ran serially using `/tmp/vstudy-website-qa/node_modules/.bin/lighthouse`, `CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, and `--chrome-flags='--headless --disable-gpu --no-sandbox' --only-categories=performance,accessibility,best-practices,seo --output=json --quiet`. The JSON files contain the measured settings and version. Electron and browser runs did not overlap.

## Ownership and limits

Production app behavior is unchanged. No shared IPC, desktop locale, or theme files changed. The existing Courses fixture is reused without modification. The app capture code is in three `apps/desktop/scripts/marketing-*.mjs` modules. Astro image lookup is in `apps/website/src/data/shots.ts`; `Window.astro`, `Home.astro`, `Docs.astro`, and the website copy consume the captures. The old public screenshot copies were removed. All three READMEs use the new defaults and localized alt text.

The default marketing images use the English interface; the library includes Traditional Chinese material. The website's existing untranslated docs retain their explicit English fallback notice. Captures use synthetic coursework and saved simulated answers. They do not certify a live school or live AI provider. Disk-usage figures can vary slightly between machines. Independent review belongs to the parent coordinator; no nested agents or PRs were created.

Model the Domain produced the view registry and manifest. Build the Lever produced the rerunnable pipeline. Prove It Works required real Electron captures and built-site browser evidence.
