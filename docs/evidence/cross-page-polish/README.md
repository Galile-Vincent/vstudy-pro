# Cross-page polish evidence

The before audit was captured from origin/main before renderer edits. `before.json` and `after.json` contain 96 computed-style snapshots each: gallery, Home, Library, Courses, History, Review, Exams, AI Chats × 1280/900/600 × light/dark × en/zh-Hant. Height is 1000px. Run `pnpm dev`, then `ROUND=after node apps/desktop/e2e/cross-page-polish.mjs` to reproduce with deterministic development fixtures.

Contact sheets exist for **every** matrix combination under `before/` and `after/`. Reading order: gallery, Home, Library, Courses, History, Review, Exams, AI Chats (two columns, four rows). Full-size selected screenshots cover English/light/1280 and Traditional Chinese/dark/600. JSON measurements include offscreen elements; screenshots show the initial viewport. Analytics consent is intentionally present in both rounds.

| Item | Before | After |
| --- | --- | --- |
| Header title | 28px / 600 | 28px / 500, wrapping allowed; shared 1.35 leading |
| Header description | inherited page-specific leading | shared 1.5 leading |
| Page cadence | Library/AI Chats 16px; Review/Home content 24px; others 32px | 32px throughout audited page containers and Home content |
| Mode selectors | Library `--active`, ad hoc ghost buttons; AI Chats outer 4% ink pill | shared library control, same 6% ink fill / 500 / 8px inner radius as segmented tabs; no shadow |
| Shared row target (English) | gallery single-line 43.5px; Home 44px; Review 19.5px target inside 56px wrapper | 56px minimum target; multi-line rows grow naturally (gallery 63px) |
| Row padding | Review 0; Exams 16px override; Courses account row 8px vertical | shared 12px; History horizontal padding 16→12px |
| Sidebar groups | Workspace→collection 16px; collection→Folders 16px; pinned/saved labels no explicit section gap | 24px; pinned/saved labels use same token |
| Progress tracks | subscription 4px; Usage native budget meter 6px | both 8px, matching library Progress |
| Waiting Cancel | Button link/sm, transparent hover | Button ghost/sm, tonal hover; same 32px height, 12px horizontal padding |
| Radius cleanup | tab 6px; reader aliases 20/10px; raw reader mark 16px and chat viewport 16px | tab token remains 6px; reader aliases 16/8px; marks/viewports use 16px token |
| Shadow contract | Whisper ring + centered 2px resting blur; centered 12px floating blur | preserved |

The waiting-state images are **isolated UpdateRow fixtures** in the current shell, using the actual component with the original link variant and final ghost variant, hovered in both captures. They compare the Cancel treatment, not the overall shell. Their geometry and hover colors are in `before-waiting.json` and `after-waiting.json`.

## Verification

- Frozen install, production build, workspace typecheck and workspace lint: passed.
- `ui:check`: shadow 5→5, radius 13→9, color 0→0, backdrop 0→0, surface-class 80→80. Baseline only decreased.
- Root vendor check: passed (55 vendor sources, 10 application files); changed shared-source SHA-256 values recomputed.
- Full `pnpm test`: passed: MCP 132 passed/3 skipped; desktop 3296 passed/20 skipped; newsletter 25 passed. An earlier run started before role/name test updates failed six Library selectors; those were corrected and the full suite rerun.
- Final focused foundation, Library folder/data-flow and update-row tests: 85 passed.
- Chromium matrix: all 96 captures and 12 Library mode interactions complete, no new error types. Baseline and final both emit 24 occurrences of the same existing Review dev-fixture error: `materializeActiveMoodleCourses` reads `.filter` from an undefined mock IPC response. This is explicitly recorded, not a clean runtime pass.
- Production Electron `library.mjs`: launch timeout after 180s, debugger connected but no window. Library, chat-history and web-chat launch retries with inherited `ELECTRON_RUN_AS_NODE` removed also timed out (30s). These native checks are blocked at launch here; no product behavior was changed to work around them.

## Scope and counts

Renderer source: **51 added, 59 removed = −8 lines** (excludes tests, locales, docs and e2e). CSS: **21 added, 43 removed = −22 lines**. Including the ratchet baseline, non-test/non-doc tracked change is −15 lines.

Library retains its virtualized table sizing (44px default rows) and History retains assistant-ui thread primitives. Usage retains semantic table rows; it is a Settings panel, not a routed page. Replacing these with ListRow would change virtualization, semantics or data/interaction ownership. No divider is added to ordinary library rows. Existing table rules and focus/contrast boundaries stay intact.

Settings files and main-process code were not touched. Native hosted-chat/reader chrome, Welcome, and specialized inbox/detail layouts retain their purpose-specific headers. The listed pre-existing e2e failures were not modified or addressed. Remaining ratchet debt is intentionally outside this small polish pass.
