# Review 2: security, performance and UI/UX

Read-only review of HEAD `c67522f5` on 2026-11-07. No code changed. This file is the only repo change and it is not committed.

Five reviewers ran: security on Codex gpt-6.1-sol and on Claude Opus 5.5, performance on Codex gpt-6.1-sol and on Claude Sonnet 5.5, UI/UX on Claude Sonnet 5.5. The coordinating session spot-checked every item marked Confirmed by reading the cited lines. "Both" means both model families raised the same item independently.

Labels: Verified means a reviewer measured it or traced it end to end. Traced means code reading only. Measurements come from synthetic SQLite databases built with the repo's own migrations, not from a real user profile, so read them as scaling evidence rather than production latency.

## Summary

- **Security is in good shape.** All 13 findings from audit 1 and the final code review check as fixed by inspection. The static gate passes with zero errors. No Critical or High security finding. Two Mediums and five Lows remain, mostly defence in depth.
- **Performance has one clear regression class.** Chat history search and the `chat_fts` triggers run synchronously on the main process with no worker and no deadline, and the FTS table keys on UNINDEXED columns. Startup also pays a linear integrity check before the window opens. Both perf reviewers found the search issue independently.
- **UI/UX has one shipping blocker.** The analytics consent step links to legal pages that still show TODO placeholders for the contact address and governing law.

## Status of prior audit findings

| Area | Result |
|---|---|
| Security audit 1, items 1 to 13 | All fixed by inspection (both security reviewers). Residuals: converter PATH (item 6) and the ZIP declared-size gate (item 13) remain documented limitations. |
| Final code review items 2, 3, 4, 7 | Fixed by inspection. |
| Perf audit P-01, P-02, P-05, P-07, P-10, P-13 | Fixed and re-measured where possible. Usage queries now take well under 1 ms at 200k events. |
| P-03, P-04, P-08 | Partly fixed. Weight moved into the entry chunk; the startup FTS check got worse; the double render below is new. |
| P-06, P-09 | Still hold. FTS tables still store content; streaming still yields the full snapshot per delta. |
| P-11, P-12 | Not re-run (need a live app). |
| A-02 live region, A-10 contrast | Fixed and verified. |
| A-19 pixel font sizes | Still holds. 74 `font-size: Npx` rules remain, some at 9 to 11 px. |
| UX-01 to UX-10, first-run audit | Fixes claimed with evidence in the repo. The onboarding step list changed since (see UX-4). |

## Findings

Ordered by severity. Effort is S (hours), M (a day or two), L (more).

### Critical

None.

### High

**H-1. Chat search blocks the main process. Perf, Both, Verified, M.**
`main/ipc/chat.ts:41` runs `chatHistoryRepository.search` synchronously. Document search uses a killable worker with a 1.5 s deadline (`services/search-runner.ts`), chat search has neither. Two cost shapes were measured at 100k messages:
- Empty or one-to-two character query scans all of `chat_fts` through `matching='1'` or `LIKE`: about 625 ms (`db/chat-history.ts:56-77`). History opens with an empty query, and `history/search.tsx:49` re-runs it on every `usage-updated` event, so each finished answer freezes the app again while History is open.
- A common word matching most messages: ranking about 235 ms plus 30 per-result snippet queries about 2.5 s, because `conversationId` is UNINDEXED (`db/chat-history-migration.ts:36`).
Fix: serve the empty query from `conversations` through the existing recent index with keyset paging, move MATCH and LIKE searches into the search worker, fetch snippets in one batch keyed by rowid, and stop refreshing History from `usage-updated`.

**H-2. `chat_fts` triggers scan the whole table on delete and update. Perf, Sonnet, Verified, M.**
The delete and update triggers in `db/chat-history-migration.ts` filter on UNINDEXED columns. At 100k messages: delete one conversation 352 ms, delete a document with two chats 706 ms. The 30 s purge timer in `ipc/chat.ts:32-36` can therefore hold the main thread for seconds in a row when several soft-deleted documents expire together. Fix: key `chat_fts` by `messages.rowid` (or a contentless table with `contentless_delete=1`) and delete by rowid. Needs a migration and backfill. Also fixes P-06 for chat.

**H-3. Startup runs a synchronous FTS5 integrity check before the window exists. Perf, Sonnet, Verified, S.**
`ipc/library.ts:24` calls `search.rebuild()`, whose first statement is `integrity-check` (`services/search.ts:43`), inside `registerIpc` and before `createWindow`. Measured 259 ms at 1k documents, 725 ms at 3k, 1.5 s at 6k. This alone can consume most of the 2 s cold-start budget. Fix: run it after first paint, in the search worker, or only when a cheap marker suggests corruption.

**H-4. Legal pages carry TODO placeholders that the consent step links to. UX, Sonnet, Confirmed, S.**
`website/src/config.ts:11-12` holds `TODO: monitored privacy contact address` and `TODO: governing law and venue`, rendered as visible marks by `LegalText.astro`. The analytics consent step (`renderer/analytics-ui.tsx:16`) links to these pages, and the deletion hint tells users to contact the publisher privately. There is no working contact. Fix: fill both values before shipping analytics, or disable the consent prompt until they exist. `docs/LEGAL_TODO.md` already tracks this.

### Medium

**M-1. Portable restore brings back analytics consent and identity. Security, Codex, Traced, M.**
`storage/backup.ts:57` snapshots the whole database. Restore (`backup.ts:106`) resets Moodle cache and expires accounts but leaves analytics tables untouched. `analytics/service.ts:23` then accepts the restored installation ID and enabled flag at startup (`main/index.ts:255`). A user who opted out after taking a backup is silently opted back in on restore, and restoring another machine's backup merges two identities. Fix: exclude analytics tables from the snapshot or reset them on restore, and keep the receiving installation's decision.

**M-2. Renderer ships unminified and the lazy splits are dead. Perf, Both, Verified, S to M.**
`electron.vite.config.ts` does not set `renderer.build.minify`, and electron-vite 5 defaults it off. The entry chunk is 5.46 MB (2.97 MB after an esbuild minify trial). Only four dynamic imports survive: `courses/agent.tsx:11` imports Chat statically, `review/artifacts.tsx:10` imports the reader statically, `ai-cli/setup.tsx:17` pulls xterm into the entry, and `AiCliSetupHost` is always mounted. Fix: set `minify` and `cssMinify`, extract the shared sanitize schema into a small module, and lazy-load Chat, the reader, and CLI setup.

**M-3. Every document and chat message renders twice on open. Perf, Sonnet, Verified, S.**
`markdown-plugins.ts:7-14` always calls `setPlugins` with a new object even when the source has no math and no code fences, which re-parses the whole document. Measured second commit at about 55 percent of the first (jsdom, 2 MB document: 1.6 s then 0.85 s). Fix: initialise plugin state synchronously when neither feature is present and only set state when it changes.

**M-4. Multi-version upgrades copy the database once per pending migration before any window. Perf, Both, Verified timings, M.**
`db/migrate.ts:15-26` runs `VACUUM INTO` per migration, 3.4 s and 632 MB each at 674 MB. A crash-recovery launch also runs a full `integrity_check` (`db/index.ts:97`, 2.2 s). Fix: one snapshot per upgrade batch with retention, `quick_check` instead of `integrity_check`, and a visible progress surface for long upgrades.

**M-5. Moodle course images are inlined as base64 in course JSON and fetched without the scheduler. Perf, Sonnet, Traced, M.**
`moodle/client.ts:199` and `files.ts:50-87` fetch up to 2 MiB per image with an unbounded `Promise.all`, bypassing the 6-slot scheduler, then store them inside `moodle_courses.data`. Every `saveCourse` rewrites them and every `overview()` parses them. Fix: file cache plus a reference, and route fetches through the scheduler.

**M-6. In-reader delete is permanent with a native confirm, Library delete is soft with Undo. UX, Sonnet, Confirmed, S.**
`workspace/index.tsx:427` uses `window.confirm` then `documents:delete` (hard delete, `main/ipc/documents.ts:106-110`). Library uses soft delete and restore. Fix: reuse the Library path.

**M-7. Disconnect school is one click with no confirmation. UX, Sonnet, Traced, S.**
`courses/index.tsx:534` icon button runs `DELETE FROM moodle_accounts` (`moodle/repository.ts:74-77`). Whether planner data detaches cleanly was not checked. Fix: a confirmation that names the school and what goes away.

**M-8. Onboarding puts the user's goal sixth of seven steps. UX, Sonnet, Traced, M.**
`onboarding/progress.ts:6` now has welcome, language, appearance, acquisition survey, newsletter and consent, goal, start. The first-run audit asked to keep the sequence short, and the checked-in screenshots still say "Step 4 of 6". The welcome body copy about local storage is never rendered (`onboarding.tsx` skips the body for the welcome step). Fix: move the survey and newsletter after first value, show one local-storage sentence on the welcome step, and recapture evidence.

**M-9. Almost every error collapses to "Something went wrong". UX, Sonnet, Traced, M.**
`renderer/status.ts:4-15` maps unknown codes to `errors:generic`, and about ten catch sites use it directly. Fix: surface the code in dev builds and add a next-step line for disk full, offline, and permission cases.

### Low

**L-1. Advanced shell: one saved preference, then no further native prompt. Security, Opus, Traced, S.**
`ipc/ai-cli.ts:61-66` prompts only when the preference flips on. Afterwards a compromised main frame can start a shell session and write to it through `ai-cli:input` without a gesture. Every other privileged action keeps a native prompt. Fix: confirm each shell session start, or expire the preference with the app session.

**L-2. `modelId` unvalidated for review generation and AI parse. Security, Opus, Traced, S.**
`ipc/review-generate.ts:69` and `services/ai-parse.ts:51,77` pass any string under 300 characters to the provider. It lands as a separate argv element so no flag injection was found. Unknown models also have no price for the budget check. Fix: shared `assertCatalogModel` as `conversations:create` already does.

**L-3. Moodle content views import files with no user gesture. Security, Opus, Traced, S.**
`moodle/webview.ts:150` imports any internal `pluginfile.php` navigation and `:64-69` accepts downloads. A hostile page can loop these to fill the library and feed the converter. Fix: require `hasUserGesture` or a small native prompt, and rate-limit per pane.

**L-4. Converter children inherit PATH. Security, Both, Traced, S.**
`resources/converter/contracts.ts:7` keeps `process.env.PATH`, unlike the CLI environment. uv may pick a PATH interpreter for the venv. Fix: fixed PATH as in `cliEnvironment`, plus `UV_PYTHON_PREFERENCE=only-managed`.

**L-5. Dependency-audit allowlist accepts advisories by ID with no rationale or expiry. Security, Both, Verified, S.**
`scripts/security-audit.mjs:15-20` treats every key in `docs/security-audit.json` as accepted forever, including a runtime zod advisory (desktop is on 3.24.2, mcp and newsletter on 3.25.76) and a katex one. Fix: `{id: {reason, expires, package@version}}` and fail on drift, and upgrade zod in desktop.

**L-6. New chats on a CLI provider can wait on an 8 s model-discovery spawn. Perf, Sonnet, Traced, S.**
`ipc/chat.ts:71-76` calls `listModels()` with a 60 s cache. Fix: warm on settings open and cache longer.

**L-7. History results accumulate without virtualization and with quadratic row lookup. Perf, Codex, Traced, M.**
`history/results.tsx:29-63` searches the whole items array per row and sorts the full set on render. Fix: reuse the Library viewport approach with an ID map.

**L-8. Moodle sync refetches full contents for every current course. Perf, Sonnet, Traced, M.**
`moodle/service.ts:411-428`. Fix: sync metadata and assignments for the list, load contents on open.

**L-9. UX polish set. Sonnet, Traced, S each.**
Screen-reader announcement truncates at 240 characters with no cue (`chat-accessibility.tsx:18`). Duplicate "re-parse with AI" controls on one screen (`workspace/index.tsx:433,483`). Floating "ask about this" badge can overlap the next line (`markdown.tsx:108-112`, fixed 155 px width). Jargon toggle name "Read-only structured tables (API providers only)". Dead locale keys `connect_body`, `setup_help`, `welcome_body`. Library sub-navigation shows on Home and Courses. Four entry points to the same help content.

## Improvement suggestions (not defects)

Security
- Widen `security-lint.mjs` to preload, renderer, converter resources and `apps/mcp`. Scope the `openExternal` exemption per call, not per file.
- Add an IPC-matrix test that walks `ipcContract` and asserts every key registers through `createIpcRegistrar`, plus a check that no `ipcMain.on` or `ipcMain.handle` appears outside it.
- Show the lower trust level of agy releases and non-audited Codex "latest" installs in the consent text.
- Polish: route the `vstudy:preload-drop` listener through the shared sender predicate; extend `redact()` to bare `key=` and `AIza` style keys; add an origin indicator to the SSO window; call `clearStorageData()` on Moodle disconnect; compile analytics and newsletter endpoints as constants in packaged builds; document that converter network denial is macOS only.

Performance
- Add `chat_fts`-scale and populated-corpus cold-start cases to the bench script. Findings H-1 to H-3 were invisible to the current bench.
- Coalesce streaming deltas per animation frame and memoize finished blocks (P-09).
- Render the reader by blocks or windowed, and create the per-paragraph Ask button on hover or focus only.
- Page `documents:list`, and stop `onboarding/help.tsx:56` refetching it on every progress event.
- Switch both FTS tables to contentless with explicit rowids (P-06).
- Push Moodle overview filters into SQL instead of parsing whole tables.

UI/UX
- One status line per document while converting or syncing, instead of a merged "Converting / Failed" count.
- A "what is sent to the AI" preview near the composer.
- One title voice. Today it alternates between "Make space for understanding" and "Study, with a way forward".
- Replace pixel font sizes with rem (A-19) and run the axe matrix at 400 percent zoom (A-08 still unverified).
- Add reduced-motion rules to the seven CSS files that have none, after checking which ones animate.
- Put CLI providers ahead of API keys in Settings for this audience, or add a "Set up AI" shortcut.
- Website: confirm the latest release carries the macOS arm64 and Windows x64 assets the download card links to, and rebuild `dist/` before judging the legal pages.

## Suggested order of work

1. H-4 and M-1 (shipping and privacy correctness, both S to M).
2. H-3, M-2 minify, M-3 (three small startup and first-paint wins).
3. H-1 and H-2 together, since the rowid-keyed FTS migration fixes both.
4. M-6, M-7, L-1 (destructive actions and the shell prompt, all S).
5. M-8 and M-9 onboarding and error copy.
6. The rest by severity.

## Not run

No Electron launch, no vitest, no packaged build, no live Moodle or provider calls, no VoiceOver, no memory soak. All timings are synthetic in-process numbers on an M-series Mac. Reviewer scratch notes and bench scripts are in the session scratchpad under `performance/`, `perf-claude/` and `security-claude/`.
