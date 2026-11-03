# Home, onboarding and blank chat review

Implementation: B2, 2026-11-03. Design source: PRODUCT_DESIGN_V2 sections 2, 3, 5, 8 and 10. Screenshots are outside the repository under `/tmp/vstudy-home`; the exact matrix and axe results are in `docs/evidence/home-screenshots.json`.

## Scope and integration

Home uses dashboard:get for recent documents, pins, monthly rollups, the 14-day series, streak and recent activity. Folder destinations use library:folders:list. Imports use the existing file chooser / native dropped File bridge / importPaths pipeline; sample imports use an enum-validated channel resolving bundled resources in main, then the same DocumentService. No renderer-controlled sample paths are accepted. Samples have English and local-language passages. Optional settings fields preserve existing settings records: onboardingCompleted and displayName.

Shell integration followed B1 commit 81767ab. B1's Library integration commit 6ca6a75 includes the small Home route adapter. Workspace has the activity hook and shared BlankChat; assistant-ui's Welcome slot also uses BlankChat. Settings can reopen onboarding. The native dialog provides focus trapping and Escape; step headings receive focus and the prior connected element receives focus on completion.

Activity heartbeats require the reader to be ready and visible with no covering modal, a focused document, and pointer/key/scroll interaction in the previous 30 seconds. Each timer tick counts at most one second, sends 15-second bounded batches and drops sub-batch time on unmount rather than overcounting. Main still clamps sender elapsed time. Home refreshes on activity-updated, usage-updated, library-updated, focus, conversion progress and a one-minute fallback. The contract currently exposes a heartbeat request, not a main activity broadcast; the renderer dispatches activity-updated after successful heartbeats/imports.

## Round 1 — capture, critique, revise

Evidence: `/tmp/vstudy-home/round-1/en-1200-light-{home-empty,home-populated,home-long-names,home-huge-tokens,home-zero-streak,home-streak-40,onboarding-0,onboarding-1,onboarding-2,onboarding-3,chat-document}.png`.

- Contrast: primary upload text inherited the card ink color on its ink background. Added explicit inverse token colors. Axe found a prohibited label on a generic progress container; added its group role.
- Hierarchy: optional path entry competed with file selection. Moved it under a disclosure, keeping file selection dominant.
- Alignment: the browser reset placed the dialog at the top left. Added automatic dialog margins to center it at all target sizes.
- Proximity: conversion status from onboarding leaked into the unrelated Home upload card. Restricted progress to imports owned by each upload component.
- Repetition: retained shared token radii, typography and material in Home, onboarding and blank chat. Input/button inner corners use r-sm within r-lg panels.
- Balance: reducing optional path density shortened the first grid row. Pins have bounded scrolling so a large collection cannot dominate the dashboard.
- White space: retained the single welcome sentence, language/name controls and distinct footer. No provider catalog is shown on the welcome step.
- Unity: reused the same AnimatedText and native-language catalogs across the three surfaces rather than adding a separate animation system.

## Round 2 — capture, critique, revise

Evidence: `/tmp/vstudy-home/round-2/en-1200-light-*.png`, plus the full three-language, light/dark 720/900/1200 matrix in the manifest.

- Contrast: inverse upload CTA is now readable in both themes. Initial axe inspection during opacity interpolation reported transient low contrast. Accessibility runs now request reduced motion before inspection, while separate component tests exercise rotation and pause behavior.
- Hierarchy: each card has a labelled h2; greeting is h1. Monthly total and streak are prominent without becoming giant display blocks.
- Alignment: the centered onboarding panel keeps all controls and footer on shared edges. Home maintains equal column widths at 900 and 1200 and one column at 720.
- Proximity: CJK Continue rows became taller and the generic list bound clipped the third document. Removed the Continue height bound while retaining it for pin collections.
- Repetition: each onboarding step uses the same progress group, title, supporting sentence, body region and Back/Skip/Continue placement.
- Balance: huge token values remain within their card; long names remain in bounded pin lists. Recent activity stays collapsed initially, keeping attention on the next reading action.
- White space: the model step fits in a centered sheet at the tested heights, with one sign-in hint beside detection results. Narrow screens scroll rather than shrinking text.
- Unity: blank chat now uses the shared primitive both before and after a conversation is created. Selection-specific prompts take precedence over document prompts; a fixed reply-language prompt is available immediately, including under reduced motion.

The final screenshots include these revisions. Rotation reserves the maximum phrase height, pauses on hover or keyboard focus and stops after three cycles. Accessible text remains a complete stable phrase; decorative visual text is aria-hidden, without letter nodes or live announcements.

## Verification and limits

Component tests cover zero/40-day streaks across all languages, sparse/zero/large sparkline scaling, empty cards, reduced motion, stable accessible text, bounded rotation, hover pause, and active-reading gating/cleanup. The document IPC test exercises Japanese sample import through conversion and rejects path-like locale values.

The Electron matrix covers four onboarding steps, empty/populated Home, long names, large token totals, zero/40-day streaks and contextual blank chat, with real IPC, a temporary SQLite database, deterministic provider responses and native file chooser/drop imports. Metadata insert shapes follow the benchmark seeder at a three-document scale; this is not a performance benchmark. The existing bench script is not imported because it immediately seeds the full million-row workload and removes its database.

The screenshot matrix is automated evidence, not a claim of human VoiceOver verification. Manual VoiceOver, an independent design reviewer from another model family, and independent native-speaker translation review remain unverified. As an implementation sub-agent, this worker did not create further delegates. Actual provider authentication/network calls are replaced by the existing fake provider in e2e; sign-in hints and API-key persistence use the real IPC paths.

## Final refinement and check ledger

A third inspection of the huge-number screenshot found an awkward line break inside a 13-digit token total. Large totals now use locale-aware compact notation, with the full number retained in the accessible label and hover title. Reading activity also pauses while a modal dialog covers the workspace. Home now supplies its own main landmark, recent activity has an explicit region name, and error-only loading no longer leaves a busy skeleton indefinitely.

Verification commands:

- `pnpm typecheck`: passed.
- `pnpm lint`: passed after concurrent shell/e2e edits settled.
- `pnpm build`: passed; Rollup reports existing removable PURE-annotation warnings in dependencies.
- Focused Home/motion/sample IPC and catalog tests: passed.
- Full `pnpm test`: one complete run passed 39 files / 209 tests, with 4 skipped. A later run during concurrent work failed the existing `src/main/db/index.test.ts:76` assertion that ready → converting must throw; the concurrent reconvert feature now permits that transition. This worker did not change that transition or assertion. Earlier converter bootstrap timing also flaked under concurrent Electron load and passed on rerun.
- `VSTUDY_FULL_MATRIX=1 node e2e/home-onboarding.mjs`: passed all three languages, 252 final screenshots; zero serious/critical axe violations for Home and every onboarding step at each tested size/theme. The native Electron protocol cannot create axe's default extra page, so the pinned `@axe-core/playwright@4.11.0` uses its supported legacy execution mode inside the same window.
- Existing `i18n.mjs`, `visual-regressions.mjs`, `library.mjs`, `library-perf.mjs`: passed in the integrated checkout.
- Existing `selection-chat.mjs`: reaches its later workspace toggle step, then times out on removed “Toggle document library”.
- Existing `conversion.mjs`: converts the office fixtures, then times out on legacy `.document-item` selection for images.md.
- Existing `chat-controls.mjs`, `assistant-elements.mjs`, `composer-visual-qa.mjs`, `pdf-reader.mjs` (600-pages.pdf): time out on the legacy “＋ Import document” button name.

Legacy script logs are `/tmp/vstudy-home-<script-name>.log`. The B1 workspace and test files were being updated concurrently; those changes remain owned by B1. No success is claimed for the failing legacy scripts. Home/onboarding e2e tests independently cover real drop import, key persistence, completion persistence, keyboard reorder, contextual selections and rendering in all three languages.
