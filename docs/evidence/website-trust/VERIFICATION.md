# Website trust implementation

## Goal and result

Replace the school's real-university strip with a clearly fictional discovery demo. Explain the app's six provider connections without implying partnerships or unsupported compatibility. Keep both sections separate from the Download stream.

Implementation is on `t3/website-trust`, based on main `b02238b`. The new components are `Schools.astro` and `Providers.astro`. Home only imports and places them. No desktop implementation, release, Download component, runtime dependency, or lockfile changes are included.

## Decisions and data shapes

`data/trust.ts` owns five fictional `exampleSchools` records, the provider connection registry, and a complete `TrustCopy` record for English, Traditional Chinese, and Japanese. The registry satisfies `Record<ProviderConfig['id'], ...>` against the desktop shared contract. Each connection has a name, neutral brand label, connection method, and privacy category. Account and endpoint discovery determine available models. The page does not promise a fixed model list.

The carousel owns its active index, typed-query position, manual pause state, interruption reasons, and two cancellable timers. Normal playback changes slides every 4.8 seconds. Hover and focus pause temporarily. Touch, dots, arrows, and Pause stop automatic progression until Play. Page motion pause and document visibility also stop it. Inactive slides are inert and hidden from assistive technology. Keyboard arrows retain focus on a stable dot when leaving a slide. Connect only animates and makes no request.

Pre-rendered overlapping slides and a reserved control row avoid a JavaScript-induced layout change. The static list is available without JavaScript. Native reduced-motion preference shows all five cards and hides the playback controls. Only transform and opacity transition between slides. Search typing is hidden from assistive technology, which receives the complete query instead. The live region is off while playing and polite while paused.

CYCU is described as an early test site with complete course-content compatibility unconfirmed. The old pane evidence shows a localhost fixture. The school guide now distinguishes directory discovery and local demos from verified live-school operation in all three languages. No UCL compatibility claim remains on Home.

Model the Domain changed the provider implementation to an exhaustive typed registry and localized records. Sequence Work into Verifiable Units separated components, truthful documentation, provider guide links, and evidence into commits. Prove It Works changed acceptance from compilation to real browser checks, native reduced-motion emulation, and production-preview audits.

The throughput checkpoint kept source and brand verification first. The two component boundaries separate independent concerns. Shared edits are limited to Home placement, removal of obsolete school strings/styles, and additive school-guide paragraphs. This implementation delegate performed the work directly and did not start nested agents. The coordinator owns independent review and integration.

## Brand usage

Official sources were fetched on 2026-11-06. The full wording summary and URLs are in [WEBSITE_DESIGN_NOTES.md](../../WEBSITE_DESIGN_NOTES.md). This table records implementation choices, not legal conclusions.

| Brand | Official guidance reviewed | What ships |
| --- | --- | --- |
| Anthropic and Claude Code | [Trademark guidelines](https://www.anthropic.com/legal/trademark-guidelines) specify prior approval and unaltered supplied artwork. | Names in site typography. No logo. |
| OpenAI and Codex | [Design guidelines](https://openai.com/brand/) tie logo use to OpenAI services and require supplied artwork, ownership acknowledgment, and no implied endorsement. No specific works-with badge permission was verified for this presentation. | Names in site typography. No logo. |
| Google Antigravity | [General guidance](https://about.google/brand-resource-center/guidance/), [icon guidance](https://partnermarketinghub.withgoogle.com/brands/google/branding-guidelines/how-to-show-googles-brand/), and [product compatibility](https://partnermarketinghub.withgoogle.com/brands/google/use-cases/product-co-branding/) describe accurate plain text and separate product-icon approval rules. | Antigravity name in site typography. No Google or product icon. |
| OpenAI-compatible endpoints | Desktop API adapter and shared provider contract describe this connection category. | A descriptive label. No model vendor marks. |

No brand asset, brand font, unofficial kit, imitation logo, or real university mark was added. The trademark and non-affiliation disclaimer appears in all three languages. The sections make no third-party requests.

## Browser evidence

The initial interactive inspection used T3 `preview_*` against the production Astro preview. It covered the school demo and provider grid at desktop and mobile widths. That tab was closed before automated tests. The standalone browser test then ran one Chrome process. It supplies the native reduced-motion emulation unavailable in the T3 appearance control. Lighthouse runs only after that browser closes.

`verify-browser.mjs` is the rerunnable behavior and accessibility test. `browser-audit.json` records the results.

| Check | Result |
| --- | --- |
| Languages and widths | 30 Home states pass. Three languages, five widths at 390/768/1024/1440/1920, and both schemes. |
| Full Home axe audit | Zero WCAG 2 A/AA and 2.1 AA violations in all 30 states. |
| Palettes | 54 section audits pass. All nine app packs, both schemes, and all three languages. |
| Palette methods | Six website packs use the actual controls. Slate, Paper, and High contrast use their real accent tokens because the website exposes six pack buttons. The report distinguishes these methods. |
| Changed school guides | 12 additional guide states pass axe and overflow checks, across three languages, two widths, and both schemes. |
| Browser errors | Zero. |
| Autoplay | Changes the active school and keeps the stage height constant. |
| Hover and focus | Each holds the same slide and typed query for more than five seconds. |
| Manual and touch pause | Each stops progression. Play resumes when hover and focus leave. |
| Keyboard | Enter, previous/next, dots, and ArrowRight navigation pass. Slide focus moves to the selected dot. |
| Demo Connect | Makes zero requests and does not navigate. |
| Reduced motion | Five visible static cards, hidden controls, zero axe violations, unchanged after 5.1 seconds. |
| No JavaScript | All five examples remain visible. |

There are 24 final section screenshots for both sections, three languages, both schemes, and CSS widths 390 and 1440. `screenshot-manifest.json` records all 32 PNGs with actual dimensions, bytes, and hashes.

The short frame sequence is `frame-01` through `frame-08`. Frames 01/02 show automatic advancement. Frames 03/04 show the carousel held on hover. Frames 05/06 show manual pause. Frames 07/08 show the complete reduced-motion list. The last pair has identical SHA-256 hashes. `browser-audit.json` records each frame's time and playback, query, visibility, live-region, focus, and stage-height state.

## Repository checks

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass. No lockfile changes. |
| `pnpm typecheck` | Pass. Zero Astro errors, warnings, or hints. |
| `pnpm lint` | Pass. |
| `pnpm knip` | Pass. Existing compiled-CSS configuration hint only. |
| `pnpm test --pool=forks --maxWorkers=2` | Pass. 1,026 tests pass, 14 existing skips. |
| `pnpm security:static` | Pass. No unreviewed advisories. Three existing dynamic-openExternal warnings, zero errors. |
| `pnpm --filter @vstudy/website build` | Pass. |
| `pnpm --filter @vstudy/website verify:static` | Pass. 49 pages, 2,039 links/fragments, zero failures. |
| `node scripts/check-readme-links.mjs` | Pass. 134 local links across four files. |
| `node docs/evidence/website-trust/verify-browser.mjs` | Pass. Behavior checks, 30 responsive states, 54 palette states, zero page errors. |
| `node docs/evidence/website-trust/verify-controls.mjs` | Pass. Additional keyboard controls, page-wide pause/resume, and 12 school-guide states. |
| `node docs/evidence/website-trust/verify-lighthouse.mjs` | Pass. Six local mobile runs score 100 in every category with zero CLS. |
| `git diff --check` | Pass. |

The static audit reports 144,274 bytes of Home images and 212,228 bytes for the largest complete Home payload. The new sections add no image bytes. The existing 400 KB image limit is stricter than the requested 450 KB limit.

Browser-harness corrections during implementation covered cached HTTP 304 responses, the relative palette path, and app packs absent from the website's visible picker. The final clean browser run completed with all assertions passing. The source also removed the obsolete mobile school-title override, reserved the initial control row, and retained keyboard focus when a slide becomes inert.

## Lighthouse

Lighthouse 13.6.0 ran once per locale and page with default mobile throttling against the local production preview. All six runs scored 100 in performance, accessibility, best practices, and SEO. Each reported zero CLS and no runtime error. These are local audit results, not production-hosting measurements or a speed comparison. The machine had 12 CPU cores and a load average of about 4 before verification. No competing browser was launched by this delegate.

| Language | Page | Performance | Accessibility | Best practices | SEO | CLS |
| --- | --- | --- | --- | --- | --- | --- |
| en | home | 100 | 100 | 100 | 100 | 0 |
| en | schools-guide | 100 | 100 | 100 | 100 | 0 |
| zh-Hant | home | 100 | 100 | 100 | 100 | 0 |
| zh-Hant | schools-guide | 100 | 100 | 100 | 100 | 0 |
| ja | home | 100 | 100 | 100 | 100 | 0 |
| ja | schools-guide | 100 | 100 | 100 | 100 | 0 |

`lighthouse-summary.json` and the six `lighthouse-*.json` files contain the raw results. `verify-lighthouse.mjs` fails on scores below 95, nonzero CLS, or a runtime error. It launches one Chrome process and closes it in a finally block.

## Reproduction and limits

Use the repository's pinned Node and pnpm versions. Start the production preview, then run the scripts sequentially. QA dependencies are kept outside the workspace. This run used Lighthouse 13.6.0, its Puppeteer dependency, and axe-core 4.14.0 under `/tmp/vstudy-website-qa`. Set `QA_PACKAGE_DIR`, `WEBSITE_URL`, and `CHROME_PATH` to use another installation or host.

```sh
pnpm --filter @vstudy/website build
pnpm --filter @vstudy/website preview --host 127.0.0.1 --port 4337
node docs/evidence/website-trust/verify-browser.mjs
node docs/evidence/website-trust/verify-lighthouse.mjs
node docs/evidence/website-trust/verify-controls.mjs
pnpm --filter @vstudy/website exec astro preview stop
```

Module-header comments follow the shared brief. The comment pass found no suppression, commented-out code, or workaround comment. Deslop review found no added dependencies, speculative abstraction, or defensive error handling. Independent reviewer verdicts, production GitHub Pages verification, and deployment belong to the coordinator. No PR was opened or deployment attempted.
