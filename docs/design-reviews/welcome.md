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
