# Final application code review

Reviewed HEAD: `7a165fa0b7b8dc3c4c0c2c142306be65547b6a9b` (2026-11-04). Inspection only; this report is the sole repository change and is intentionally uncommitted.

## Verdict

Do not ship this HEAD as a durable personal document/chat store yet. The isolation and validation work is substantial, and ordinary-path tests are healthy. The remaining serious problems are lifecycle ordering and operations that span multiple commits or filesystem writes. A passing happy-path suite does not establish that a user's previous conversation survives a failed edit or that quitting preserves an active answer.

Scope included main, shared, preload, renderer, converter, repository/desktop scripts and desktop E2E (the E2E directory is `apps/desktop/e2e`, not root `e2e`). The application-wide inventory/static pass covered 266 TS/TSX/Python/MJS files, 27,142 lines; manual tracing concentrated on stateful services, security boundaries, renderer effects and their tests. This is not a claim of exhaustive semantic verification of every UI component. No native GUI E2E suite, packaged release, real Keychain interaction, real provider chat, actual disk exhaustion or process-kill crash campaign was run. Fault injection below is identified explicitly.

Severity: **blocker** = fix before release because ordinary lifecycle or storage failure can lose visible user data; **warning** = concrete faulty behavior or material operational gap. No style nits are included.

## Ranked findings

### 1. Blocker — editing commits removal of the old branch before replacement is durable

**Location:** `apps/desktop/src/main/services/chat.ts:112`, `:125`; `apps/desktop/src/main/db/index.ts:244` (`supersede`).

`supersede()` commits its own transaction. The replacement user insert and activity insert happen afterward, outside it. A crash between these calls, or an insert failure, leaves the existing suffix hidden with `supersededBy` pointing at a replacement that does not exist. Normal history endpoints filter those rows out, so reopening does not recover the user's conversation.

**Executed evidence:** seeded a real in-memory store with a user and assistant, installed a SQLite `BEFORE INSERT ON messages` trigger raising `ABORT`, then edited the user through the real `ChatService.start`. Start threw `simulated storage failure`; `store.messages.list(conversationId)` returned `[]`. The old rows still exist physically, but there is no application recovery/branch browser.

**Smallest fix:** make superseding, replacement insertion and acceptance bookkeeping one transaction/savepoint; validate fallible request/model options before committing it. Define regeneration's pre-output cancellation behavior too: it currently hides the prior assistant before knowing there will be a replacement.

### 2. Blocker — no single-instance ownership of shared database and library

**Location:** `apps/desktop/src/main/index.ts:31`, `:95`; `apps/desktop/src/main/services/documents.ts:86–94`; `apps/desktop/src/main/services/library.ts:159–170`.

There is no `requestSingleInstanceLock` anywhere in the application. Two launches can operate the same userData. SQLite serializes SQL writes but does not serialize source publication, converter output, fixed `.tmp` configuration files or process-local job/stream maps.

**Concrete scenario from code:** A and B both query a not-yet-imported hash and find no row. A publishes its directory. B executes the unconditional `rm(directory)` intended for orphan recovery and removes A's newly published files before publishing its own copy. Different extensions with identical bytes make this particularly damaging: A's eventual row can reference a source filename that B removed. Separately, a second instance's purge cannot see the first instance's `activeConversions`, so it may remove a directory still being written. Both instances also accept streaming into one conversation because their `active` maps are independent.

**Smallest fix:** acquire Electron's single-instance lock before opening the store, constructing services or touching shared files; quit the losing instance and focus the existing window. Multi-instance support instead requires real cross-process ownership, not just busy_timeout.

### 3. Blocker — quit closes SQLite before active chat is aborted and persisted

**Location:** `apps/desktop/src/main/ipc/index.ts:81`; `apps/desktop/src/main/index.ts:167–175`; `apps/desktop/src/main/services/chat.ts:155–158`, `:202–234`.

`registerIpc` creates `chat` but its disposer never calls `chat.dispose()`. `before-quit` prevents normal quit, disposes converter/IPC, closes the store, then calls `app.quit()`. The window remains alive during that disposal. A still-streaming chat therefore reaches the window's `destroyed` abort hook only after SQLite has closed. Its partial assistant/usage persistence throws and is swallowed by `finish`; the answer disappears on restart. If converter disposal takes time, the chat can also keep running during shutdown.

**Evidence:** direct shutdown call-order trace; no native quit reproduction was performed. `ChatService.dispose()` already exists but has no production caller. CLI termination includes asynchronous cleanup and delayed SIGKILL, which this shutdown path also does not await; descendant survival is a risk, not a separately proven finding here.

**Smallest fix:** stop accepting work, abort/persist chats while the store is open, await active producer/process cleanup, stop document work, and close the store last. Make the chat disposer awaitable rather than assuming synchronous abort means the provider has exited.

### 4. Warning — deleting/changing a saved key does not invalidate an in-flight unlock

**Location:** `apps/desktop/src/main/services/secrets.ts:60–73`; `apps/desktop/src/main/ipc/chat.ts:45–46`.

`getInMainOnly()` reads ciphertext, awaits Keychain, then unconditionally writes the result into `unlocked`. `delete()` clears memory/disk but cannot invalidate that continuation. An unlock already in flight can resurrect the deleted key. The compatible-provider origin-change handler calls the same delete operation: an old-origin unlock can repopulate the cache after the URL changes, allowing subsequent requests to use the old credential at the new origin.

**Executed evidence:** delayed the encryption adapter's decrypt promise, began unlock, deleted the provider key, then released decryption. Results: `has(provider) === false`, `isUnlocked(provider) === true`; `getInMainOnly(provider)` still returned the deleted key. No real credential or network endpoint was used.

**Smallest fix:** maintain a per-provider credential generation and check it after every await; bump it on delete, replacement and session-key changes. Bind compatible credentials to the configured origin or invalidate work on configuration revision as well.

### 5. Warning — undo after conversion finishes leaves an idle document stuck converting

**Location:** `apps/desktop/src/main/services/documents.ts:174–193`; `apps/desktop/src/main/services/library.ts:149–158`.

Soft deletion makes `documents.get` return null. A conversion finishing during the 30-second undo interval therefore skips ready/failed finalization and removes its job. Restore clears `deletedAt` and reindexes content but never finalizes or requeues conversion. The document remains `converting`; neither Retry (requires failed) nor Re-convert (rejects converting) repairs it in-session.

**Executed evidence:** gated a real DocumentService converter, imported HTML, soft-deleted, released conversion and awaited idle, then restored. Status was `converting` with an FTS row present and no job remaining. Restart can enqueue it again, so this is not permanent file loss.

**Smallest fix:** persist terminal conversion state for hidden-but-not-purged rows, keeping FTS visibility conditional; alternatively have restore reconcile/requeue unfinished state through DocumentService.

### 6. Warning — one failed status write poisons the whole conversion queue

**Location:** `apps/desktop/src/main/services/documents.ts:154`, `:187–195`.

The catch block's failed-state transition can itself throw (disk full, I/O error). That rejects `job`, and `this.queue = job` retains the rejection. Every later job attaches only a fulfillment callback with `.then(...)`, so no later converter executes, even after storage recovers. There is also no immediately attached rejection handler on that queue promise.

**Executed evidence:** injected a SQLite trigger rejecting only transitions to `failed`, made the converter throw, waited for rejection, removed the trigger, then imported a second file. The second idle wait rejected with the *old* error; converter call count stayed at one and both documents remained `converting`. Node also emitted PromiseRejectionHandledWarning in the probe.

**Smallest fix:** retain a recovered queue tail (`job.catch(...)`) independently of each job's outcome; handle secondary persistence failures explicitly without converting them into a permanently rejected scheduler.

### 7. Warning — model discovery can leave a child/process tree running after timeout

**Location:** `apps/desktop/src/main/providers/models.ts:36–53`.

The discovery helper spawns outside ProcessScope, sends only default SIGTERM on timeout/output cap/successful initialization, and settles its promise before the child closes. A CLI ignoring TERM remains running; descendants receive no group signal. Its directory can be removed while it still runs, and application shutdown has no registry/disposer for it. This differs from the scoped converter and streaming CLI transports that escalate/kill groups.

**Evidence:** deterministic code path for a child that handles/ignores SIGTERM; not a claim that the currently installed vendor CLI does so. The timeout bounds the caller's wait, not process lifetime.

**Smallest fix:** use the existing process-scope pattern, group termination and a short SIGKILL escalation; await close before deleting the cwd and register discovery work in shutdown disposal.

### 8. Warning — older documents migrate with false zero-byte metadata indefinitely

**Location:** `apps/desktop/src/main/db/library-migration.ts:11–13`; `apps/desktop/src/main/services/search.ts:14–26`, `:49–56`.

Version 5 adds `sizeBytes DEFAULT 0` and nullable pageCount without backfilling existing source files. Startup search repair can fill contentChars but never stats the source or counts pages. An existing multi-megabyte document is consequently displayed/sorted as zero bytes and disappears from a positive minimum-size filter after upgrade. No later migration repairs it.

**Evidence:** seeded older-schema upgrades retain these defaults; source stat backfill exists only for newly imported files. All SQL migrations still pass integrity/foreign-key checks; this is semantic metadata loss, not SQL migration failure.

**Smallest fix:** add a resumable, bounded startup metadata backfill for legacy rows using contained source/Markdown paths. Represent unavailable size as unknown rather than asserting zero; do not rewrite already-applied historical migration SQL.

### 9. Warning — app-owned model options still bypass localization

**Location:** `apps/desktop/src/main/providers/models.ts:26–27`; `apps/desktop/src/renderer/model-picker.tsx:104`.

The app creates the option label `Thinking` and values `enabled`/`disabled`, then renders `o.label` and capitalized `v.label` directly as visible text and ARIA labels. A Claude model advertising supportsThinkingOff therefore displays English controls in both Japanese and Traditional Chinese. These are app-authored controls, not vendor model names that should remain untranslated.

**Smallest fix:** map known option/value IDs to translated labels in the renderer, retaining provider labels only for genuinely unknown vendor-defined options. Add locale rendering coverage with a supportsThinkingOff fixture. Catalog key parity alone cannot detect this gap.

### 10. Warning — operational data-model documentation describes obsolete recovery/search behavior

**Location:** `docs/DATA_MODEL.md:61`, `:63`, `:65`.

The document claims an 80 ms synchronous search guard and says a worker deadline is still needed. Production IPC actually uses a killable utility process with a 1500 ms timeout (`services/search-runner.ts:6–7`). It also claims startup rebuild detects length-mismatched entries; the missing-row query only checks copy count, so a single stale row of a different valid length is not compared with disk. It says legacy usage summary/dashboard deserialize events, while `db/usage.ts:24–52` reads rollups. These statements can misdirect corruption diagnosis and performance work.

**Smallest fix:** update the current operational contract to match these implementations; if length reconciliation is required, implement/version it explicitly rather than documenting nonexistent recovery.

## Verification performed

- `pnpm typecheck`: PASS (exit 0).
- `pnpm lint`: PASS (exit 0).
- `pnpm test`: PASS; 53 test files passed, one skipped; 287 tests passed, eight skipped; 7.27 seconds. Skips include live/opt-in integration paths, so this does not establish provider/converter deployment readiness.
- `node apps/desktop/scripts/security-audit.mjs`: PASS against the checked-in advisory acceptance list, **not** vulnerability-free. Current output: one critical, 11 high, eight moderate, one low; unreviewed IDs zero. Those existing accepted advisories were not reclassified as newly discovered defects.
- Madge 8.0.0: processed 263 files, five resolution warnings, ten reported cycles. TypeScript transpilation-based analysis removing type-only imports confirms **three runtime strongly connected groups**, listed below. Raw Madge cycles through providers/index include type-only edges and must not all be treated as runtime cycles.
- Knip 6.44.1: 41 unused-file candidates, one unused runtime dependency (`tw-shimmer`), three dev dependency candidates, 131 unused exports and 46 exported types. Unconfigured Electron entries, worker entrypoints, scripts and E2E are false-positive sources; this is an inventory, not 41 proven dead files.
- Depcheck 1.4.7: runtime candidates `tw-animate-css`, `tw-shimmer`; development candidates CycloneDX and tailwindcss. CSS/config/script usage means these results require manual reconciliation. Do not remove CSS tooling based on depcheck alone.
- Python: system interpreter initially failed due to absent converter/test dependencies. An existing converter environment ran `test_pdf_md.py` successfully (30 tests). Pytest/reportlab were then installed only into `/tmp/vstudy-review-pydeps` for broader converter testing. Full converter pytest result: **49 passed, 15 subtests passed**, 12.87 seconds (`-p no:cacheprovider` avoided a repository pytest cache). No project dependency file was changed.
- Locale parity/interpolation tests pass. A direct en-versus-zh-Hant/ja comparison found only two identical strings longer than 18 characters in each: `Markdown · markitdown` and `Markdown · {{converter}}`, both intentional format/parser labels. No missing catalog key or concrete plural/ICU runtime defect was demonstrated. This does not cover dynamically rendered labels (finding 9) or substitute for native-speaker review.

### Seeded migration execution

Executed real migrations on separate disk-backed snapshots at every schema version 1 through 9, then opened each through production `openStore` to reach v9. Each snapshot was seeded with a document, conversation and JSON message; v3+ snapshots also contained usage with 100 input, 20 output, cache read/write 3/4, reasoning 5 and unknown cost. Snapshots were created with migrations/version records committed individually. Every upgrade preserved the message, reported `integrity_check=ok`, and had an empty foreign_key_check. v3+ rebuilt rollups retained the seeded token/cache/reasoning counts and unknownPrices=1. Existing-v1/v2 snapshots correctly had no usage data. Production backup paths were exercised when crossing v5/v8.

These are synthetic seeded snapshots, not copies of a real user's database. They establish successful forward application on existing rows, not power-failure guarantees, backup behavior under concurrent writers, all possible legacy JSON shapes, or correct filesystem metadata backfill (finding 8).

Reproduction helpers remain outside the repo: `/tmp/vstudy-review.cjs` (migrations and undo), `/tmp/vstudy-chat-probe.cjs` (failed edit and credential race), `/tmp/vstudy-queue-probe.cjs` (queue poisoning), `/tmp/vstudy-static-review.cjs` (runtime graph). Logs use `/tmp/vstudy-review-*.log`. The database fixtures are under `/tmp/vstudy-review-db-Jft8Q7`. These paths are local review evidence, not committed test assets.

## Security and data-integrity observations without additional findings

The registrar validates sender/frame plus schemas, response schemas, rate and payload limits. Drop tokens are unpredictable, single-use, frame-bound and expiring; issuance comes from trusted preload drop events. The separate synchronous drop channel is outside the generic registrar and deserves explicit regression coverage, but I did not demonstrate a page-world bypass. Asset/application protocols restrict method, host/path, file type and containment; no concrete traversal/XSS bypass was found. CLI top-level resolution uses installed/pinned paths and CLI environments replace inherited PATH. Converter executable discovery is explicit; its scrubbedEnvironment still carries inherited PATH, which merits dependency-tool scrutiny but is not itself a demonstrated exploit here.

Direct app-controlled provider fetches, CLI request/discovery/quota launches, converter installation and confirmed external opening have egress records. The inventory does not enumerate opaque CLI requests, DNS, subprocess downloads or Chromium traffic; README and WELCOME_EXPERIENCE explicitly disclose this. No unsupported assertion of complete network capture is warranted.

Usage insert triggers keep each committed usage event and its daily rollup atomic. Message persistence and usage recording are separate commits, including multiple model usage records: storage-failure ordering and shutdown still need tests. Charging usage that occurred even when saving an answer fails can be intentional; I did not label orphan messageId alone as a billing bug. Soft purge intentionally retains usage history outside the document FK cascade.

Import publication and physical deletion are not one transaction with SQLite. Source publication precedes row insertion, and deletion removes files before rows. Reimport can recover a pre-insert orphan; purge retries can remove a stale row after missing files. `.import-*`, conversion temp dirs and partial files are cleaned on normal finally paths, but forced termination bypasses finally; no general startup sweep for abandoned import staging was demonstrated. These are crash-campaign targets, not invented proof of permanent corruption.

License inventory `docs/licenses.json` includes multiple non-MIT license groups, including MPL/EPL/CC entries; package presence alone is not a license violation. SECURITY explicitly says Python licenses need a separate distribution review. No concrete incompatible redistribution or missing-notice violation was established in this inspection. Signed distribution remains unverified.

README and WELCOME_EXPERIENCE are substantially aligned with current constraints (no OCR/sync, CLI opt-in, lazy keys, scoped privacy inventory); the welcome table's usage source path points to nonexistent `main/services/usage.ts` instead of `main/db/usage.ts`/`main/ipc/usage.ts`. PRODUCT_DESIGN_V2 is explicitly a design reference, not proof of implementation: e.g. its AST/converter-version caches and external/contentless FTS design differ from the current one-entry selection cache, source-hash reuse and ordinary FTS table. DATA_MODEL already admits the missing caches, but needs the corrections in finding 10.

## Test quality and top ten missing critical behaviors

The suite has useful real SQLite/FTS tests, real process-group tests and provider wire fixtures; it is not uniformly over-mocked. The failure probes above escaped it. `services/chat.test.ts` repeatedly waits 5–15 ms for completion instead of synchronizing on explicit terminal events. E2E `home-onboarding.mjs:47` uses a 200 ms refresh sleep; `converter-lifecycle.mjs:24` waits a fixed 65 seconds for idle shutdown. Replace those with bounded condition polling. Animation capture sleeps can be intentional sampling and should not be confused with correctness synchronization.

`e2e/security-audit.mjs:20–25` tests that a frame cannot use the parent bridge, but a zero-execution frame is also sufficient to pass: it does not prove the message was rejected by the main registrar. Keep the registrar's direct frame-identity tests and add a demonstrably executing untrusted-frame negative case where possible. No whole test was declared vacuous solely because it uses mocks.

Top ten behaviors lacking demonstrated automated coverage in the reviewed suite:

1. Failed/crashed edit after superseding and before replacement commit, preserving the old active branch.
2. Native application quit during a nonempty stream, persisting partial text/usage before DB close and awaiting child exit.
3. Second-instance launch while importing, converting, migrating or purging shared userData.
4. Key unlock racing delete, session replacement and compatible-origin changes.
5. Soft-delete → conversion completes/fails → undo inside grace time.
6. Failed ready/failed status writes, followed by recovered storage and successful subsequent queued conversion.
7. TERM-resistant discovery subprocesses/descendants, including shutdown during discovery.
8. Legacy migration metadata backfill, missing source files and interrupted/retried backfill.
9. Faults between multi-model usage inserts and assistant persistence; rollup/raw/message reconciliation after restart.
10. Process-kill/disk-full boundaries of source publication, output rename, physical delete and migration checkpoint/backup/commit.

The extra review probes cover portions of 1/4/5/6 now, but are intentionally not committed regression tests. Full E2E and live checks were not executed during this review.

## Maintainability and first refactors

Runtime cycle groups confirmed after TypeScript removes type imports:

- `providers/{api,models,codex,cli}.ts`.
- `resources/converter/{index,warm-worker}.ts`.
- `renderer/{providers,model-picker,onboarding/onboarding,usage/settings,usage/dashboard,usage/chip}.tsx`.

No initialization crash was demonstrated from these cycles, so they are refactor evidence rather than additional correctness findings. Extract provider names/UI-free option metadata, environment helpers, error classes and converter process contracts into leaf modules to break them.

Files above roughly 1000 lines: `tool-fallback.aui.tsx` 1333, `renderer/library/index.tsx` 1070, `converter/pdf_md/__init__.py` 1070, `thread.aui.tsx` 1005. LibraryView combines queries/paging, selection, undo, dialogs, context menus and drag/keyboard mutations; it is the first UI module to split. The converter's extraction phases deserve separate bounded units with preservation tests. Do not mechanically split vendored-style UI primitives before fixing application lifecycle risks.

First refactor: introduce one explicit application shutdown/ownership coordinator, with services exposing stop-accepting, abort/persist and await-idle/dispose phases. Then make chat branch mutation atomic and document conversion/restore share one state reconciler. Extract process lifetime handling so discovery, chat, converter and search cannot each invent cleanup rules. Reconcile Knip entrypoints before deleting exports/dependencies. No TODO/FIXME markers were found in the requested source/script/E2E scope; the demonstrated problems are in implemented paths, not marked stubs.

## Top five risks to ship

1. Conversation branches disappear after a failed edit.
2. A second app instance races shared library publication and purge.
3. Quitting drops an active answer/usage and does not await provider teardown.
4. A deleted or old-origin key returns through a late Keychain continuation.
5. Conversion and undo/storage-failure paths strand documents or disable the queue until restart.

Address these with small failure-oriented regression tests and the lifecycle/transaction fixes above before investing in component cleanup. The normal-path checks passing is encouraging; it does not offset these demonstrated state-management failures.
