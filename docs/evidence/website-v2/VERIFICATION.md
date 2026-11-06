# Website v2 verification

## Goal and state

Replace the boring, tinted marketing site with a clean neutral presentation, expressive product hero, interactive bento cards, smooth theme changes, and a header without a rule. Keep the documentation structure, three languages, and factual limitations.

Implemented on `t3/website-v2`. The final U4 integration step is pending. Main remains `ec24a40` and does not contain the clean-art work or `docs/MCP.md`. Do not treat this pass as the final screenshot refresh.

## Design evidence

- `before/` contains the live page at 1200×768 and 1440×900 CSS viewports, in light/dark and VStudy/Ocean palettes.
- `prototypes/` contains centered aurora, split studio, paper, and a comparison sheet. Static HTML sources are in `/tmp/vstudy-website-v2-prototypes/`.
- `round-1/` records the first layout, mobile overflow finding, and first bento pass.
- `round-2/` records the second critique, corrected crop, final home captures in three languages, docs captures, the school strip, and the scrolled header.
- `screenshot-manifest.json` records CSS widths and home capture filenames. T3 can rasterize a capture at a different pixel size from its CSS viewport. The coordinator explicitly requested an evidence commit, so this task commits its PNGs despite the general local-evidence ignore rule.

The first critique removed glow overflow at the decorative element. The second critique fixed the reading note overlapping its screenshot. The corrected note is in `round-2/bento-final-dark.png`.

## Browser checks

Used the T3 `preview_*` browser against the Astro production preview at `http://localhost:4323/vstudy-pro/`. One active browser or Electron check ran at a time.

| Check | Result |
| --- | --- |
| Home, 3 languages × 5 widths × 2 schemes | 30 passes. |
| All 45 docs routes × 5 widths × 2 schemes | 450 passes. |
| Horizontal overflow | None at 390, 768, 1024, 1440, or 1920 CSS pixels. |
| Axe 4.11.4, WCAG 2 A/AA and 2.1 AA | Zero violations in 30 home states and 180 docs states. |
| Six accent palettes × light/dark | Zero axe violations in 12 states. Canvas stays neutral. |
| Header and docs sidebar borders | Computed 0px. Header backdrop opacity reaches 1 after scrolling. |
| Theme scheme and palette buttons | Both invoke View Transitions and settle without the transition flag. |
| API-disabled fallback | Background samples were rgb(11,11,13), rgb(117,117,118), rgb(250,250,250). Intermediate color confirms interpolation. |
| Approval example | Approve disables the action, announces success, and exposes reset. Reset restores the action. |
| Conversation example | Matching, no-result, and recovery states pass. Cmd+K focuses its input. |
| Docs search | Traditional Chinese route opens search and returns 12 Moodle results. Escape closes it. |
| Copy code | The real button changes to Copied and announces Copied. |
| Runtime | Meaningful page content, expected page titles, no framework error overlay, no relevant application console errors in inspected captures. |

Axe ran after finite transitions settled. The home motion pause control exposes every reveal for the full-content contrast audit. Screenshot captures also exercised normal scrolling and reveals. The audit script was served temporarily from the ignored build directory and removed before Lighthouse. No axe payload ships with the site.

Reduced-motion handling is CSS and source audited. T3 preview has no reduced-motion emulation control, so this pass does not claim browser-emulated reduced-motion coverage. The media rule removes all animation, shows all reveal content, disables product transforms, and hides the unnecessary pause control. The JavaScript branch skips View Transitions and deadline ticks.

## Local Lighthouse

Lighthouse 13.6.0, default mobile throttling, one local run each on Home and Getting started. These are local production-build checks, not a hosted performance comparison.

| Page | Performance | Accessibility | Best practices | SEO | CLS |
| --- | --- | --- | --- | --- | --- |
| Home | 100 | 100 | 100 | 100 | 0 |
| Getting started | 100 | 100 | 100 | 100 | 0 |

The full JSON reports include timing details and image-delivery suggestions. They do not claim that all optimization opportunities are absent.

## Commands and results

- `pnpm install --frozen-lockfile` passed without a lockfile change.
- `pnpm typecheck` and `pnpm lint` passed for desktop and website.
- `pnpm test --pool=forks --maxWorkers=2` passed 997 tests in 132 files. Existing skips were 14 tests in 5 files.
- `pnpm security:static` passed.
- `pnpm knip` passed with the existing compiled-CSS configuration hint.
- `pnpm --filter @vstudy/website typecheck` passed with zero errors, warnings, or hints after the interaction refinements.
- `pnpm --filter @vstudy/website build` and `pnpm --filter @vstudy/website verify:static` passed for 49 pages and 2,007 links/fragments.
- Home images total 175,738 bytes. The largest complete home asset budget is 224,966 bytes, including HTML, CSS, JavaScript, and all home images, even when lazy.
- `node scripts/check-readme-links.mjs` passed 134 local links across four files.
- `impeccable detect --json apps/website/src` returned no mechanical findings.
- `git diff --check` passed.

Lighthouse command, run separately for each page after closing the T3 tab.

```sh
node /tmp/vstudy-website-qa/node_modules/lighthouse/cli/index.js \
  http://localhost:4323/vstudy-pro/en/ \
  --chrome-flags='--headless --no-sandbox --disable-gpu' \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output-path=docs/evidence/website-v2/lighthouse-home.json --quiet
```

## Resume after U4

1. Confirm the clean-art merge is on main, then merge main into `t3/website-v2`.
2. Check whether `docs/MCP.md` has arrived. Replace the coming-soon tile and FAQ with accurate shipped behavior when it has.
3. Run `pnpm build && node apps/desktop/scripts/marketing-shots.mjs`. The existing pipeline writes website assets and README derivatives. This pending command owns the allowed shared screenshot outputs.
4. Inspect the contact sheet and the large product captures for hierarchy, readable crop, clipping, contrast, sample-data quality, and theme consistency. Fix capture or placement problems before rebuilding.
5. Rebuild the website, check README links, repeat static/browser/axe/Lighthouse checks, and capture final evidence with the clean art.
6. Have the coordinator run independent review. This implementation sub-agent created no PR and spawned no reviewers.
