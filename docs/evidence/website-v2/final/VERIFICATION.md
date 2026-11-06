# Website v2 final integration verification

## Result

Step 6 is complete. Main `6d26b91` was merged as `67755ea`. The app was rebuilt, all 132 marketing captures were regenerated, and the website was rebuilt with the clean art. Asset commit `816f147` refreshes the website images, the 11 shared image aliases used by all three READMEs, and the marketing manifest.

`docs/MCP.md` is still absent from this merged main. The website's MCP tile and FAQ accurately remain marked coming soon. This pass changes no desktop implementation code beyond the authorized merge.

## Capture and art review

Checked `pgrep -fl 'VStudy Pro|Electron'` before launching the capture pipeline. No other Electron instance was running. The pipeline used one disposable Electron instance, closed it on completion, and removed its profile. No other process was killed. Browser verification started after that instance exited.

The matrix contains 11 views, six theme packs, and both schemes, for 132 captures. All 132 were visually inspected on the 12 `review-*.jpg` sheets. Full-size course-home and course-page captures were also inspected. The course covers are soft color fields without the old stripe, contour, image, or glyph overlays. Cards are clean, titles and deadlines remain legible, and no stray dialogs appear. History search, appearance settings, storage settings, and onboarding retain their intended panels.

The pipeline reports zero renderer errors. All 264 encoded WebP/AVIF variants decode at 2880×1800. The largest WebP is 186,564 bytes; the largest AVIF is 104,281 bytes. All 22 format/alias combinations match the corresponding capture by SHA-256, both in the website aliases and in `docs/assets/readme/`. English, Traditional Chinese, and Japanese README links retain their stable filenames.

See `asset-validation.json`, `image-integrity.json`, `review-groups.json`, and the marketing manifest for the complete inventory. `docs/evidence/marketing/contact-sheet.png` is the full matrix; the per-group sheets here are easier to inspect.

## Sticky header regression

Verified home and Getting started at 1440px and 390px in light and dark. Used real T3 browser wheel actions, not class changes or a synthetic scroll event. Each action produced 42 to 49 native scroll events. After the fade settled, every header had the scrolled class, backdrop opacity 1, `blur(16px)`, an 85% neutral background, and a 0px bottom border.

Navigation remains legible over the bright product image and over docs prose. The original reported overlap was not reproduced after real scrolling and the fade completed. No header CSS fix was needed. `header-scroll.json` records the eight states. `header-home-dark-bento.png` also checks the earlier dark bento overlap position. The eight `header-{home,docs}-{1440,390}-{light,dark}.png` captures show the settled results.

## Browser and accessibility

Used the production Astro preview at `http://localhost:4323/vstudy-pro/` through T3 `preview_*` tools. Checks cover all 49 generated pages, including the root home alias, all three languages, both schemes, and widths 390, 768, 1024, 1440, and 1920.

| Check | Result |
| --- | --- |
| Responsive states | 490 passed. No horizontal overflow. One meaningful h1 on every page. |
| Axe 4.11.4 | Zero violations in 220 page states, covering home at every width and docs at 390/1440. |
| Palette previews | Zero violations in 12 additional light/dark palette states. |
| Header wheel regression | Eight states passed. |
| Home image payload | 144,274 bytes, below the 450 KB request and existing 400 KB static limit. |
| Largest complete home payload | 193,506 bytes including HTML, CSS, JavaScript, and all home images. |

Axe uses WCAG 2 A/AA and 2.1 AA tags. Finite animations settle first. The real motion pause control exposes all home reveal content for full-page contrast checks. The temporary axe script was removed from the ignored build directory before Lighthouse. No audit script ships with the website.

The twelve `home-{en,zh-Hant,ja}-{390,1440}-{light,dark}.png` captures show the final clean-art home pages. `browser-audit.json`, `palette-audit.json`, and `screenshot-manifest.json` hold raw results and capture names.

Reduced motion retains the previously audited CSS and JavaScript branches. T3 preview does not expose reduced-motion emulation, so this report does not claim new emulated coverage.

## Lighthouse

Lighthouse 13.6.0 with default mobile throttling, one local production-preview run per page. These results do not claim hosted Pages performance.

| Page | Performance | Accessibility | Best practices | SEO | CLS |
| --- | --- | --- | --- | --- | --- |
| Home | 100 | 100 | 100 | 100 | 0 |
| Getting started | 100 | 100 | 100 | 100 | 0 |

Both reports have no runtime error. Full reports are `lighthouse-home.json` and `lighthouse-docs.json`.

## Commands

All repository checks ran once after merging U4. They passed.

```sh
pnpm install --frozen-lockfile
pnpm build
pgrep -fl 'VStudy Pro|Electron'
node apps/desktop/scripts/marketing-shots.mjs
pnpm typecheck
pnpm lint
pnpm knip
pnpm test --pool=forks --maxWorkers=2
pnpm --filter @vstudy/website build
pnpm --filter @vstudy/website verify:static
node scripts/check-readme-links.mjs
```

The test run passed 1,026 tests in 134 files. The 14 tests in five skipped files are existing skips. Knip reports only the existing compiled-CSS configuration hint. The static audit checks 49 pages and 2,007 links/fragments. The README checker passes 134 local links across four files. Typecheck and lint report zero Astro errors, warnings, or hints.

Lighthouse ran sequentially after closing the T3 browser tab.

```sh
node /tmp/vstudy-website-qa/node_modules/lighthouse/cli/index.js \
  http://localhost:4323/vstudy-pro/en/ \
  --chrome-flags='--headless --no-sandbox --disable-gpu' \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json \
  --output-path=docs/evidence/website-v2/final/lighthouse-home.json --quiet
```

The docs run substitutes `/en/docs/getting-started/` and `lighthouse-docs.json`. Build, capture, test, lint, typecheck, knip, static, and link outputs are saved beside this report. Log trailing whitespace is normalized without changing results.

Prove It Works drove the full capture review, image integrity comparisons, real wheel regression, and final browser checks. All work ran in-thread. No PR was created or deployed; independent review remains with the coordinator.
