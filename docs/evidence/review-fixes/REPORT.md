# Stream L review fixes

The goal is a production-quality student app with verified review defects fixed and regressions that fail before the fixes.

Branch `t3/review-fixes` started at `cae7325`, which was also main. The assigned checkout originally had the unused branch name `t3/review-restore-planner-fixes`; it was renamed without changing checkouts. Main remained unchanged during this pass. No PR or merge was requested or created.

## Findings

Every finding was verified and fixed. No finding was dismissed as not a bug.

| Finding | Result and regression evidence |
| --- | --- |
| 1. Crafted SQLite trigger and path escape | Restore compares every table, index, trigger, and view by name and SQL with an empty database built from app migrations at the archive's version before any migration or write. FTS shadow tables must match those generated objects. Optional SQLite statistics must match their known definitions. Chat and materials use a configured library root. `backup.test.ts` rejects a path-rewriting trigger, dropped app trigger, extra view, table, and index. `chat.test.ts` verifies forged paths never reach a provider. Six regressions failed before the fix. |
| 2. Planner validation and startup recovery | Restore strictly parses all tasks, exams, goals, plans, blocks, and reminders. Normal reads skip corrupt rows without deleting them and native startup shows a localized warning. The startup journal remains until services and the renderer load. Failed or interrupted startup restores the previous database and library and retains rejected files. Tests cover corrupt rows in all six tables, healthy tasks beside corrupt data, reminder startup, visible warning, successful confirmation, rollback, and interrupted rollback. The seven initial validation/read regressions failed before the fix. The Electron test also exposed and verified a fix for initial-navigation cancellation during reload. |
| 3. Native Moodle download maintenance gate | The complete authenticated download and import owns an `enterStorageRequest` release. Tests reject downloads before network/IO while busy and verify maintenance drains an accepted download. Both failed before the fix. |
| 4. Submitted-linked draft tasks | One shared completion rule excludes submitted-linked tasks from drafts and renders them in Done. Drafts use the current linked deadline's earlier due time. Logic and planner UI regressions failed before and pass after. |
| 5. Active material version | Material context reads `content.ai.md` for the AI version and original Markdown otherwise. The test checks both versions. It failed before and passes after. |
| 6. History refresh and pagination | Previous result components stay mounted. The regression checks node identity, focus, scroll, and no repeated search status text during pending refresh and pagination. It failed before and passes after. |
| 7. Model change after first send | Model selection reads current persisted messages instead of the initial renderer history. Failures render inline and preserve the working chat. Both regressions failed before and pass after. |
| 8. Cancelled storage cleanup | Cleanup returns a validated `{cancelled:true}` alternative. The renderer displays no completion message. IPC and UI tests cover both cleanup operations. Four regressions failed before and pass after. |
| 9. Material approval lifetime | Approval lives on the requested message's metadata instead of a shared ref. The adapter validates it before including it in course IPC. A refused append cannot attach approval to the next turn. A real assistant-runtime test verifies a delayed first turn still sends the approved materials. A plain immediate `finally` cleanup failed that runtime test, so the shared ref was removed. |
| 10. Rename undo for empty title | Undo preserves the empty title. The validated patch contract accepts it and SQLite clears custom metadata to NULL, retaining automatic titles. UI undo and repository regressions failed before and pass after. |
| 11a. Copy feedback | Toolbar and footer use the same acknowledged copy action. Failed writes show no success, feedback expires after two seconds, and navigation resets it. Both regressions failed before and pass after. |
| 11b. Calendar filter localization | Planner and Moodle export dialogs use the main-process translation. Native dialog tests check English, Traditional Chinese, and Japanese. Chinese and Japanese failed before and pass after. |

The `L-*-before.log` files preserve failing reproductions. Focused passing results are in `L-*-after.log`, `L-2-final.log`, and `L-9-final.log`. Source tests are under `apps/desktop/src` with the subsystem named in this table.

## Commands and results

Run from the repository root unless specified.

- `pnpm install --frozen-lockfile` passed. This checkout initially had no installed dependencies.
- `pnpm typecheck` passed on the final implementation.
- `pnpm lint` passed independently and again inside the final security check.
- `pnpm knip` passed. It emitted its existing CSS configuration hint and Node deprecation notice.
- `pnpm test --pool=forks --maxWorkers=2` initially passed 973 tests with 14 skipped. After the real-runtime regression and startup reload fix, the full suite ran again inside `pnpm security:check` and passed 974 tests with 14 skipped, across 127 passing and 5 skipped files.
- `pnpm security:static` and final `pnpm security:check` passed. The audit reported no unreviewed dependency advisories. Existing reviewed advisories and three dynamic `openExternal` lint warnings remain; these checks do not mean the dependency graph has no advisories.
- `pnpm build` passed on the final implementation.
- `VSTUDY_STORAGE_EVIDENCE=<worktree>/docs/evidence/review-fixes/electron pnpm --dir apps/desktop exec node e2e/storage.mjs` passed against the built Electron artifact. Only one Electron ran at a time. `electron/electron.json` records ZIP validation, restart restore, preserved original content, and integrity with zero issues. All six language/theme accessibility runs had zero violations.
- `git diff --check` passed.

The first Electron attempt stopped at the one-instance guard while the novice-test checkout owned Electron. A later attempt caught the initial-navigation reload race. Both failed attempts are recorded under `attempts/`. The successful run closed both Electron instances it launched, one before and one after restart. No other stream's process was terminated.

## Artifacts and contracts

Local screenshots are under `docs/evidence/review-fixes/electron/`. `restore-validated.png` shows staged restore, and `en-narrow-restored.png` shows the restored app. Language and theme screenshots cover en, zh-Hant, and ja. PNGs follow the repository's existing ignore policy and remain local; the JSON result and text evidence are committed.

Restore schema pinning is documented in `docs/STORAGE.md` and `docs/SECURITY.md`. `restore-startup.json` is the new private recovery journal. The retained `previous` and `failed` directories are not automatically deleted. Planner corruption is skipped with a warning rather than silently deleted or repaired.

Shared changes are limited to `shared/storage.ts`, `shared/chat-history.ts`, `shared/planner-policy.ts`, `shared/planner-draft.ts`, their tests, and additive `history.json` and `planner.json` strings in en, zh-Hant, and ja. Cleanup acknowledgements add `{cancelled:true}`; an empty title clears custom metadata. Material approval is per-message runtime metadata and passes the existing validated chat IPC shape.

Fix Root Causes shaped schema pinning before mutation and the configured file root. Model the Domain shaped per-message approval ownership and the cleanup acknowledgement alternative. Test Behavior, Not Implementation shaped provider payload, visible warning, persistent focus, and restored-file assertions. Those principle instructions were read during this pass. Implementation and verification ran in-thread because this task was explicitly assigned to an implementation sub-agent. No further agents were spawned.

Independent post-fix review remains with the parent coordinator. No physical power-loss test, live provider call, real school login, or signed release was performed in this stream.
