# Welcome implementation review

Implementation started 2026-11-03; verification completed 2026-11-04. Design authority: `docs/WELCOME_EXPERIENCE.md`, with the lead's decisions recorded at its top. The optional onboarding tour supersedes acceptance criterion 1's automatic launch. This is an implementation and self-review report, not a release approval.

## What shipped

A lazy Welcome route, all seven sections, the exact catalog copy in English, Traditional Chinese and Japanese, Home and Settings entries, an optional final onboarding tour, and persisted `welcomeSeen`. There is no automatic tour after onboarding.

The sample comes through `welcome:sampleDocument`: strict locale enum request, bounded string response, trusted main-frame sender enforcement through the existing registrar, and a main-owned bundled filename. It does not import a document or accept a path. The facts derive from the shared MIME registry, provider enum and registered shipped locale catalogs. Tests pin the supported claims to 8/6/3 and compare sample citation headings with the resources.

The demo uses the production document and reply Markdown components, transcript/selection styles, and a static citation chip. A twelve-step timeout player preserves its remaining delay when paused, stops after three loops on the source highlight, and has fake-timer tests. IO pauses the player below 40% visibility; visibilitychange and the page toggle also pause it. There is no continuous production animation-frame loop. Count-up frames stop after 600 ms; the spotlight uses a throttled pointer handler. Marquee, float and parallax use CSS.

Shell navigation feature-detects View Transitions, skips them under reduced motion, skips an overlapping transition, and applies navigation even if the API throws. A focused Library/Home document card receives the shared name only for that transition; the mounted reader receives the matching name. Other navigation uses the root cross-fade.

## Self-critique and two revision rounds

The implementation brief and incumbent system supplied the product/design direction; no new visual identity was invented. Impeccable context and its craft floor were read. Its detector returned `[]` for the Welcome implementation. The shared preview rejected the Electron file URL (`unsupported-protocol: file:`); verification used the repository's Playwright/Electron harness. No independent reviewer or other model family was used in this implementation-sub-agent turn.

| Principle | First critique and revision | Second critique and revision | Final assessment |
|---|---|---|---|
| Contrast | Overlapping glass layers allowed descendant text to paint across another card. Isolated each card's stacking context and ordered the three layers. | Animated text could freeze at low opacity off-screen and fail axe. Restricted off-screen pauses to repeating motion; one-shot text reveals finish. Audits wait for entrances to settle. | Final-state and settled-motion axe audits include the centered spotlight; see manifest. Native visual contrast review still advised. |
| Hierarchy | The hero occupied the entire first screen, hiding the following heading. Reduced its minimum height and outside padding. | Added the promised persona icons and kept the situation darker than the job and footer. | Primary action dominates; the desktop next-section heading provides a scroll cue. |
| Alignment | Progress dots competed with content at the trailing edge. | Reserved a trailing column at the large container breakpoint; provider grids retain shared edges. | Container widths, rather than viewport widths, control layouts. |
| Proximity | Persona situation, job and first-use guidance initially read as one text block. | Added a quiet inset for the job and a separated first-use footer. | Provider commands stay beside their own copy control; demo captions stay beside the stage. |
| Repetition | Initial sections reused the existing neutral surfaces and radius tokens. | Used production Markdown, Home streak and sparkline components; all decorative examples remain labelled. | Type, surfaces, icons and controls match the rest of the app. |
| Balance | Layered hero needed a shorter excerpt and explicit stacking. | Clamped the selected excerpt and added a compact hero type token for narrow panes. | Reviewed 720/900/1200 layouts and CJK wrapping. At narrow widths the stack follows the text. |
| White space | Initial hero spacing made the narrative feel disconnected. | Tightened only the opening section; preserved generous space between later ideas. | Long CJK persona copy remains visible and cards grow naturally. Expanded en-XA wraps without horizontal overflow. |
| Unity | A standalone marketing mock would drift from the reader. | Kept the real reader/reply renderer, real Home components and app shell; restored the Settings entry on Close. | Welcome is part of the app, with local-document actions and no invented social proof. |

Round-two reference captures are retained under `/tmp/vstudy-welcome/review-round-2/`; the final matrix is indexed in `docs/evidence/welcome-screenshots.json`. The earliest exploratory screenshots were overwritten during the matrix and are not separate baseline artifacts. The transcript records their inspection; no retained before-image comparison is claimed.

The hero headline uses opacity and rise without the proposed blur. Earlier runs recorded long frames; the spec explicitly allows dropping the blur. Initial exploratory measurements had long frames during navigation/scroll/demo. Memoizing the real reader and finishing off-screen reveals reduced work; the final measurements, including misses, are recorded below. This is evidence of the measured runs, not proof of causation for each improvement.

## Verification and measurements

The 1,118-image screenshot manifest (including 960 signature frames) indexes final section images and twelve-frame signature sequences for hero, demo, cursor hover and view transition in en/zh-Hant/ja × 720/900/1200 × light/dark. Supplementary captures include full pages, solid materials, en-XA at 900 light and 200% zoom. Hero sequences include the complete entrance, rather than ending before the CTA delay. Screenshot timing is sampled wall-clock timing, not a lossless video or an exact per-vsync trace.

- `e2e/welcome.mjs`: locale/width/theme matrix, signature frames, settled-motion and reduced-motion axe, off-screen idle animations, pause state, native/synthetic visibility, performance probes and runtime errors.
- `e2e/welcome-supplement.mjs`: full-page matrix and axe for every section in each locale/theme/motion combination, with centered spotlight.
- `e2e/welcome-details.mjs`: no automatic launch, optional tour, Home/Settings return focus, pause persistence, dot focus, chatSide mirroring, 200% zoom, reduced-motion transition bypass, real shared-element morph, throwing API fallback.
- `e2e/welcome-performance.mjs`: bounded rAF measurement probes and PerformanceObserver for layout shifts/long animation frames, both themes, with a Home baseline. These probes are test-only.

The mock desktop is not used for the production matrix. The en-XA run uses a temporary Vite development renderer with the real Electron bridge, since that language is intentionally development-only. No runtime dependency was added. The Welcome JS and CSS chunk measured 12,889 bytes gzipped, below 35 KB; exact filenames/sizes are in `docs/evidence/welcome-bundle.json`.

Reference host: Apple silicon (`arm64`), macOS 27.0.1, built Electron app at 1200 px. The final probe ran after the other Electron test processes had closed.

| Theme | Phase | p95 ms | LoAF >50 ms | Estimated dropped frames | CLS |
|---|---|---:|---:|---:|---:|
| light | home-baseline | 18.3 | 0 | 0 | 0 |
| light | hero | 18.0 | 0 | 0 | 0 |
| light | scroll | 18.3 | 0 | 0 | 0 |
| light | demo | 18.2 | 0 | 0 | 0 |
| dark | home-baseline | 18.2 | 0 | 0 | 0 |
| dark | hero | 18.5 | 0 | 1 | 0 |
| dark | scroll | 18.3 | 0 | 0 | 0 |
| dark | demo | 18.3 | 0 | 0 | 0 |

The Home baseline also exceeds 16.7 ms. This suggests host/display cadence contributes to the result; it does not excuse or erase the Welcome gate failure. Final raw values are in `docs/evidence/welcome-performance.json` and `/tmp/vstudy-welcome/performance-both-themes.json`.

The strict p95 ≤16.7 ms gate is **not met on this host**. Do not treat zero long frames as equivalent to meeting that gate. Dropped-frame estimates use a 60 Hz interval and `round(interval / (1000/60)) - 1`; these are estimates from rAF intervals, not hardware presentation counters. Long-frame counts come from `long-animation-frame` entries. CLS excludes shifts associated with recent input, per the platform metric.

Off-screen checks observed zero running Welcome animations and a renderer CPU sample around 0.08% in the main matrix (one-second sampling, host-dependent). This supports “approximately zero animation work,” not a universal CPU guarantee. The current Playwright/Electron macOS run did not change document visibility when `BrowserWindow.hide()` ran. A synthetic visibilitychange check verifies the handler and player pause; **native hide behavior remains unverified**. Playwright changes Chromium launch behavior, so the observation should be repeated in an ordinary packaged window. Live macOS Reduce Transparency setting changes were not manually verified; CSS query and startup attribute solid-material fallbacks were verified.

## Acceptance criteria

| # | Result | Evidence / limits |
|---|---|---|
| 1 | Pass with the lead's changed placement decision | `welcome-interactions.json`: first run stays on Home; final optional tour works; `welcomeSeen` persists; Home and Settings entries and return focus pass. Locale matrix uses translated entry/chrome. |
| 2 | Self-review pass; human comprehension unverified | Exact hero, section headings, personas, local storage copy and source demo reviewed in screenshots. No actual 30-second user comprehension study was run. |
| 3 | Pass | `facts.test.ts`, sample/citation and IPC tests, exact copy catalogs, labelled scripted demo. No testimonials, logos, awards or user counts. |
| 4 | Implemented; strict timing equivalence is not exhaustively proven | CSS/timeline and state machine tests; twelve-frame sequences in the matrix; reduced motion and pause checks. Headline blur deliberately omitted under the spec's performance fallback. Count-up uses bounded rAF directly, rather than a WAAPI timing clock. Streak/bar and answer sequencing are approximate visual treatments, not per-keyframe numeric assertions. |
| 5 | Pass for deterministic controls; native hide unverified | Player fake-timer ordering/remaining-delay/three-loop/replay/final-state tests, off-screen IO checks, chatSide assertion, synthetic visibility test; static four-step list is outside the inert stage. Native hide caveat above. |
| 6 | Partial / gate not met | See performance JSON and table: p95 gate misses; report CLS, long frames and dropped estimates as measured. First hero paint <150 ms was not separately instrumented. |
| 7 | Automated pass; manual portions unverified | Main matrix and 84 supplemental section × locale × theme × motion audits: zero serious/critical. Centered spotlight enabled. 200% zoom reflows without horizontal overflow. VoiceOver and independent measured contrast review remain manual. |
| 8 | Matrix captured and self-reviewed | Manifest plus en-XA/solid/full-page/zoom captures, token-based colors/radii/elevation. No independent design reviewer signed off. |
| 9 | Pass for observed behavior; timing limits | Shared card/reader names observed; transition completion 364.8 ms including scheduling, under 400 ms test target. CSS morph duration is 320 ms and cross-fade 240 ms total. Reduced motion bypass and API-throw navigation pass. |
| 10 | Checks pass as recorded; no new dependency | Typecheck/lint/unit/build and existing e2e suite results in `welcome-checks.json`; new matrix/details/supplement scripts. 235 tests pass; four pre-existing conditional tests remain skipped. The standalone performance script exits nonzero for its p95 gate. Strict performance assertions are intentionally not represented as passing. |

## Remaining manual review

Native-speaking reviewers must review **all zh-Hant and ja copy**, particularly personas, the Good-to-know paragraph and the added tour link. The copy is retained verbatim from the design tables; retention is not native approval.

VoiceOver script (not run): open from Home, confirm the introduction landmark and one complete hero heading; read all section headings in order; confirm the inert stage and repeated marquee are absent from the accessibility tree; operate a progress dot and hear the destination/current state; open from Settings and close, confirming focus returns to the tour entry; repeat with Reduce Motion and Reduce Transparency enabled. Verify no content relies on the moving stage and no decorative persona card adds a tab stop.

An independent reviewer from a different model family and a human 30-second comprehension test were not performed. These are review gaps, not implied approvals.

## Independent-review revision, 2026-11-04

This addendum supersedes the earlier acceptance/performance results for the revised Welcome. The retained independent punch list is `welcome-independent.md`; the complete twenty-item response, including deliberate exceptions, is `welcome-response.md`.

Changes: AI/Mac category and qualified privacy/citation copy in all three catalogs; fixed-padding layered hero without clamps or blur; single controls-only header; demo immediately after hero; legible persona footers; undashed sparkline with labelled fixture usage; CLI-first providers and static strip when it fits. Explicit CJK phrase boundaries prevent mid-phrase headline breaks. The demo toolbar grows naturally, quoted selection comes from the actual sample, decorative headings have no heading semantics, and ResizeObserver keeps the cited heading aligned after resizing.

Pause is the first Tab destination from the h1, uses one stable label and state, and never recreates entrance animations. Finite reading reveals finish once when paused (including a paused reopen); the demo and looping motion retain their paused position. Dots have roving tabindex and arrow-key navigation. The float ends after three cycles.

### Performance investigation and final result

Bypassing Welcome View Transitions eliminated the duplicate Home/Welcome snapshot entrance. Initial isolated probes still recorded one 33.3–33.4 ms interval on the first mount, with eleven clean subsequent entrances. Non-urgent React navigation alone did not eliminate that miss. The retained pre-bundling trace is `/tmp/vstudy-welcome2/entrance-trace-before-bundling.json`: max layout 7.141 ms, paint 1.034 ms, task 10.226 ms; no snapshot/ViewTransition events. Those individual events do not sum to an exclusive frame cost and do not prove that host jitter caused the miss.

The final implementation prepares the module/CSS during idle and bundles the three existing sample files in the lazy chunk. This avoids loading and re-rendering the sample during the entrance. The measurement begins with 1.8 seconds of Home baseline (idle preloading is enabled), then includes the first Welcome mount and eleven re-entries: six light and six dark. No run is discarded. The final isolated script exits zero; raw data is in `../evidence/welcome2-performance.json`.

| Theme | Phase | p95 ms | Max ms | Estimated dropped frames | Intervals >20 ms | CLS |
|---|---|---:|---:|---:|---:|---:|
| light | Home baseline | 17.9 | 18.7 | 0 | 0 | 0 |
| light | 6 entrances (worst) | 18.4 | 18.7 | 0 | 0 | 0 |
| dark | Home baseline | 18.1 | 18.4 | 0 | 0 | 0 |
| dark | 6 entrances (worst) | 18.5 | 18.6 | 0 | 0 | 0 |
| light | hero idle | 18.2 | 18.7 | 0 | 0 | 0 |
| dark | hero idle | 17.5 | 18.4 | 0 | 0 | 0 |
| light | scroll | 18.1 | 18.7 | 0 | 0 | 0 |
| dark | scroll | 18.3 | 18.7 | 0 | 0 | 0 |
| light | demo loop | 18.2 | 18.7 | 0 | 0 | 0 |
| dark | demo loop | 17.9 | 18.7 | 0 | 0 | 0 |

All phases have zero LoAF >50 ms. The executable gate now requires twelve entrances with zero estimated dropped frames, zero >25 ms hero intervals, zero >20 ms scroll/demo intervals, Home-relative p95 within +1 ms, and zero CLS. These are rAF-based estimates on this host, not hardware presentation counters. The original absolute p95 ≤16.7 ms gate is superseded in the design reference, not silently reported as met.

Final trace: `/tmp/vstudy-welcome2/entrance-trace.json`, with renderer-main summary in `../evidence/welcome2-trace.json`. Max style update 0.762 ms, layout 7.429 ms, paint 1.102 ms, task 11.098 ms. Trace overhead means this diagnostic run is separate from the twelve-run timing gate.

Off-screen: zero running animations in both themes. One-second Electron samples: renderer 0.060% light / 0.101% dark, GPU 0.084% / 0.110%. Samples are host-dependent. Hero backdrop filters are removed; the sticky header retains material over scrolling content. A controlled before/after hero GPU percentage comparison was not repeated; the reviewer's 1.3% versus 0.4% numbers remain their measurements.

### Critique and verification

First rebuilt hero/demo/who images are retained under `/tmp/vstudy-welcome2/round-1/` and were viewed. The eight-principle critique and revisions are in `welcome-response.md`. Reviewing the English matrix exposed the stale resize-dependent citation offset; the second revision adds ResizeObserver and verifies the target is within 5 px of the reader clip top. Japanese and Traditional Chinese hero frames were viewed at full size; phrase breaks and card content are clean. A later geometry assertion caught a clipped citation in the 720 px Traditional Chinese demo. Shortened the scripted answer in all three catalogs and removed layout space reserved by invisible hint/thinking rows; final checks explicitly require the citation inside its answer viewport. The pause no-replay test now checks monotonic clocks and visible text: finished CSS animation clocks may advance beyond their end time after resuming, so exact clock equality was an invalid assertion. Final contact sheets cover hero/demo/who at all 18 locale/width/theme combinations; all copy remains visible and persona labels use the explicit 12/13 px floor.

Final evidence: `../evidence/welcome2-screenshots.json` indexes the full matrix plus final layout/entrance recaptures; `/tmp/vstudy-welcome2/supplement.json` holds the 84 section audits. Main and supplemental settled/reduced-motion axe audits have zero serious/critical findings. A further 12 whole-view locale × theme × motion audits on the final source also pass (`welcome2-axe.json`). The manifest contains 1,086 matrix entries, 72 final layouts, and 432 final entrance/transition frames. `welcome2-checks.json` records commands, exits and log paths, including every existing e2e script and the added trace/layout scripts. Typecheck, zero-violation lint, 235 tests (four existing skips), and production build pass. The isolated performance script now passes. Bundle sizes are recorded in `welcome2-bundle.json`, below the 35 KB gzip budget, with no new runtime dependency.

Still unverified: native-speaker sign-off for zh-Hant/ja, manual VoiceOver, human 30-second comprehension, native macOS hide/minimize visibility behavior and live OS Reduce Transparency changes. Synthetic visibility and CSS/startup transparency fallbacks are automated. First hero paint <150 ms was not separately instrumented. These limits are retained rather than presented as approvals.
