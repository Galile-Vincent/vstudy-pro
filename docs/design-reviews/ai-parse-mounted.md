# Mounted AI parse review — 2026-11-04

The reader header opens the AI parse popover. The Library action opens that document with the panel expanded. A quality prompt and conversion-failure action expose the same entry point. Provider/model/options use the existing vendor selector; CLI enablement remains an explicit Settings action. Antigravity is excluded because its image contract is unsupported.

The panel displays page count, scope, approximate token/cost estimate, admission cap, monthly-budget override, per-page statuses and explicit start/cancel/resume. Estimate changes invalidate confirmation; stale estimate responses are ignored. Unknown pricing and an estimate exceeding the cap disable Start. Switching versions reloads the document, clears browser/application selection and remounts reader state. Citation navigation checks the version.

## Visual critique

Three implementation/review rounds maximum. Final evidence under `/tmp/vstudy-ai-parse`: `panel-light.png`, `panel-dark.png`, `panel-200-percent.png`, and list/grid menus at both text scales.

| Expo principle | Assessment and action |
| --- | --- |
| Contrast | Start is the sole filled action. Dark ghost/outline controls now explicitly use the app's ink/surface tokens. Axe confirms no violations in the tested panel states. |
| Hierarchy | Heading, model, scope/estimate, spending decision, then Start. Removed duplicate compare/original/use/revert controls from the idle panel. |
| Alignment | Controls share the panel inset. Cost input has a single border. Menu items have one fixed icon column, including Pin/PinOff. |
| Proximity | Estimate sits next to scope; cap and override are grouped. Per-page results remain beside progress. |
| Repetition | Existing shadcn buttons, vendor selector, colors and radii are reused without modifying vendor sources. |
| Balance | Popover stays within the viewport, caps its height and scrolls internally. Menus flip away from the right/bottom edges. |
| White space | Compact, spaced field groups replace the former dense duplicate action row. At 200% text the panel scrolls vertically; controls remain reachable. |
| Unity | Same reader, Library and Settings affordances and three locale catalogs. No new accent bars or custom icon vocabulary. |

## Boundaries

- Existing service requires `ready` documents. Failed conversions and scanned/no-text-layer PDFs expose an explanatory recovery message, not a functioning OCR/recovery pipeline. This requested behavior remains limited by the existing backend.
- The USD 1 default is an admission/abort cap, not a guaranteed billing ceiling. Concurrent in-flight calls and estimation error can exceed it. There is no global chat/parse budget escrow.
- No independent OCR or semantic/equation verification is added. Rejected pages keep original Markdown; accepted pages still need human comparison.
- Resume is explicit. Accepted pages are reusable with matching model/options; reopening restores the job's provider/model, but scope/options are editable and not a frozen historical job configuration.
- No authenticated provider was exercised for this mounting task: Anthropic API, OpenAI API, compatible APIs, Claude CLI and Codex CLI remain unverified live here. Antigravity parsing is unsupported. Fake-provider results do not prove provider obedience or billing accuracy.

## Verification

Final command counts and full-suite disposition are recorded below when the run settles. Screenshots and logs are local artifacts, not committed binary fixtures.

- `pnpm typecheck`, `pnpm lint`, build, and whitespace checks pass.
- Vitest: **67 files passed / 4 skipped; 351 tests passed / 13 skipped** (71 files, 364 tests total).
- `pnpm vendor:check`: **60** pinned vendor sources match; no vendor edits.
- Targeted `node e2e/ai-parse.mjs`: **38 checks passed**, including 16 menu placements with 32 viewport/label assertions; **5 axe scans, 0 violations** (light, dark, 200% text, Traditional Chinese, Japanese). Also verifies CLI defaults, estimate/run, both version switches, and the Library action.
- Mechanical design detector: **0 findings** on changed UI targets.
