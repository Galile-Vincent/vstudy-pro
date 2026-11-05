# Storage reference

VStudy owns one application data namespace under Electron `app.getPath('userData')`. The main process acquires Electron's single-instance lock before opening it. Renderer requests contain IDs or maintenance actions. Native dialogs select backup and export paths.

## Inventory and ownership

The following table lists the persisted data in this checkout. SQLite objects live in `vstudy.sqlite` with WAL and SHM sidecars. A row has no automatic retention limit unless the table states one. Courses and user records are retained deliberately, rather than evicted as response cache entries.

| Persisted data | Owner | Lifecycle and size bounds | Cleanup and corruption handling | Backup |
|---|---|---|---|---|
| `migrations(version, appliedAt, checksum)` | `main/db/migrate.ts` | One row per immutable migration. SHA-256 covers exact SQL bytes. | Unknown versions and changed checksums stop opening. Legacy rows adopt checksums on first open. | Included. |
| `documents` | `main/db`, `services/documents.ts`, `services/library.ts` | Hash-unique originals. Imports at most 50 MiB. Metadata is not size-limited globally. | Thirty-second soft-delete grace. Purge waits for converters and removes the directory before cascading the row. Failed removals retry. | Included. |
| `folders`, `tags`, `document_tags`, `saved_filters` | `services/library.ts` | User-owned organization. Folder depth at most eight. | Savepoints and FK constraints preserve tree and assignment consistency. Document deletion cascades tag assignments. | Included. |
| `conversations`, `messages` | `main/db`, `services/chat.ts` | Document or course scoped. Stream text and reasoning each capped at two million characters. History has no global retention cap. | Conversation deletion cascades messages. Chat acceptance and finalization use savepoints. | Included. |
| `usage_events`, `usage_daily`, `usage_parse_daily`, `latest_rate_limits` | `main/db/usage.ts` | Append-only usage and transactional rollups. One latest limit row per provider. No automatic history truncation. | Rollups update in SQLite triggers. Raw event detail and aggregate summaries use different read paths. | Included. |
| `activity_days`, `activity_events` | `services/activity.ts` | Daily aggregates and ID-deduplicated events. No global retention cap. | FK cascades document events. Daily totals remain. | Included. |
| `document_fts` and FTS5 shadow tables | `services/search.ts` | Derived trigram index, at most one million characters per field per document. | Startup validates FTS, removes orphans, and asynchronously reloads missing rows from contained files. Missing files retry next startup. | Included. |
| `settings` | `main/db`, `shared/domain.ts` | Validated JSON application settings. | Invalid settings fail validation. Application does not silently reset user preferences. | Included. |
| `ai_parse_jobs`, `ai_parse_pages` | `services/ai-parse.ts` | Jobs and per-page Markdown/provenance. Page output capped at 256 KiB. No global job retention cap. | Running jobs become cancelled on startup. Running pages become pending. Discard or document deletion removes them. | Included. |
| `moodle_accounts`, `moodle_capabilities` | `moodle/repository.ts` | Account identity, advertised functions, safe mobile configuration. Credentials are separate. | Account deletion cascades remote records and course conversations. Invalid JSON payloads fail schema validation. | Included. Restore marks accounts expired. |
| `moodle_courses`, `moodle_deadlines`, `moodle_notifications`, `moodle_grades`, `moodle_files` | `moodle/repository.ts` | Last successful remote mirror. No global retention cap. File links retain `modifiedAt` and size revision identity. Thumbnail payloads can be up to 2 MiB per course. | Sync prunes removed records transactionally. Reminders keep removed deadlines as orphaned. Changed file revisions invalidate imported-document links. | Included. |
| `moodle_reminders` | `moodle/repository.ts`, `moodle/reminders.ts` | Student-created and approved agent reminders. Never evicted as cache. | Explicit deletion, deadline cascade, or disconnect. | Included. |
| `moodle_course_details` | `moodle/repository.ts` | Derived course sections and announcements. At most 8 MiB per course and 64 MiB total. | Oldest refreshed details evict first. Reopen refetches. Explicit cache clear and disconnect remove entries. | Included. |
| `moodle_response_cache` | `main/cache` | Account, resource kind, request key, JSON wire response, byte count, sync/access time, validators, revision. At most 32 MiB, 2,000 rows, and 2 MiB per entry. | LRU eviction. Bad payloads with a supplied schema are discarded. Account FK cascade and purge fencing prevent late writes after sign-out. | Included in export. Cleared during restore. |
| `library/<sha256>/source.<ext>` | `services/documents.ts` | Immutable copied originals, each at most 50 MiB. | Copies are validated, fsynced, published exclusively, then referenced in a savepoint. Untracked hash directories are preserved for recovery. | Included with source-hash validation. |
| `library/<sha256>/content.md` | `services/documents.ts`, `resources/converter` | Original conversion, at most 8 MiB. | Atomic replacement. Clear converted files marks documents failed and retryable before deleting generated content and search entries. Originals and conversations remain. | Included. |
| `library/<sha256>/content.ai.md`, `.json` | `services/ai-parse.ts` | AI output up to 8 MiB and provenance. | Atomic replacement per file. Page records allow regeneration after interruption between the two file publications. Discard, clear converted files, or document purge removes them. | Included. |
| `.import-*`, `content*.tmp`, `content*.partial` | `services/documents.ts`, `storage/reconcile.ts` | Incomplete import and conversion artifacts. | Startup removes recognized staging artifacts before accepting imports. Interrupted converting rows are requeued. Unknown files and originals remain. | Excluded. |
| `moodle-downloads/.download-*` | `moodle/files.ts`, `storage/reconcile.ts` | Private staged Moodle downloads, each bounded to 50 MiB while streaming. One in-flight import per remote file. | Finally removes staging. Startup removes crash remnants. Download bytes are fsynced before import. | Excluded. |
| Logos and course images | `moodle/files.ts`, course JSON mirror | Raster data URLs, 2 MiB per response. Session LRU is bounded to 128 entries and 16 MiB of string storage. | Five-minute TTL, account sign-out purge, and cache clear. Public school images are session-only. | Course thumbnails in SQLite are included. Session images are excluded. |
| `providers.json`, `executable-pins.json` | `main/providers` | Validated provider config and executable trust identities. No credentials. Small synchronous configuration writes. | Temp file, fsync, rename, directory fsync. Errors retain prior files. Invalid config fails closed. | Excluded from portable backup. |
| `secrets.json` | `services/secrets.ts` | Base64 ciphertext from async Electron safeStorage, mode 0600. Keychain stores the encryption key outside userData. | Atomic flushed writes. Generation checks fence delayed key operations. Bad ciphertext or denied Keychain access surfaces an error. Session credentials never persist. | Excluded. Existing local secrets are retained during restore. |
| `converter-venv`, `.requirements-sha256` | `resources/converter` | Installed hash-locked Python environment and lock fingerprint. Size depends on pinned dependencies. | Fingerprint mismatch rebuilds the environment. Installation failure remains retryable. Not deleted by Moodle cache clear. | Excluded. |
| `codex-tool-free-*.json` and CLI temporary homes | `main/providers/codex.ts`, `cli-context.ts` | Verification cache and per-request provider runtime files. | Identity/version invalidation. Temporary homes are removed in finally blocks. System temporary remnants after process crashes remain an OS-cleanup concern. | Excluded. |
| Chromium `Cache`, `Code Cache`, `GPUCache`, `Local Storage`, `Session Storage`, preferences | Electron and `renderer/shell` | Chromium-managed caches and renderer UI state, including the last route. Chromium controls physical cache size. No application-wide hard quota is configured. | Electron's delete-all-data action removes the application namespace. Portable restore does not replace these directories. | Excluded. |
| Diagnostic logs | `main/logging.ts` | Console output only. No app-owned rolling log file. Host process or launcher can capture stdout. | Redacts home paths and provider credentials. Captured files outside userData belong to the launcher. | Excluded. |
| `vstudy.sqlite.before-v*.bak` | `main/db/migrate.ts` | One snapshot per applied migration of an existing DB. Size tracks that historical DB. | Mode 0600, includes committed WAL pages. A retry preserves the first backup. No automatic deletion. | Not recursively included. Listed as recovery usage. |
| `.backup-*`, `.restore-*`, `restore-pending.json` | `storage/backup.ts` | Snapshot scratch space, validated incoming restore, and restart journal. Restore needs space for both old and new libraries. | Normal failures remove scratch space. Completed restore retains `previous/`. Crash leftovers may require manual removal after confirming no pending restore. | Not recursively included. Listed as recovery usage. |

Usage counts physical files once. The separate response-cache payload count is a logical subset of the database total, not extra disk usage. SQLite can retain freed pages after cache clearing. Incremental vacuum and future writes reuse them. Clearing cache does not promise that the DB file immediately shrinks.

## Database lifetime and migration API

`openStore(path)` configures WAL, `synchronous=FULL`, foreign keys, a five-second busy timeout, a 16 MiB page cache, and 256 MiB mmap. Document reads, import validation reads, converter publication, exports, startup file recovery, and periodic directory deletion use asynchronous file IO. Search rebuild yields between rows. SQLite metadata operations and the legacy undo/re-import FTS reload remain synchronous. Migration snapshots and schema changes run before the window opens, so a large upgrade can still delay startup.

The migration format stays `{version: number, sql: string}`. Stream E reserves version **19** in `main/cache/migration.ts`. Version **18** remains available to stream D. New modules export an SQL string and append one unique migration entry in `main/db/index.ts`. The runner sorts by version and permits sparse version numbers, so merging an independent lower-numbered migration remains possible. Dependencies between migrations still need ordering by their authors.

Published SQL is immutable once checksums are recorded. Change an existing schema through a new migration. `migrate(db, migrations, path)` verifies stored checksums before applying pending SQL. An existing on-disk database gets a flushed `VACUUM INTO` backup before **each** pending migration. Each migration and its version/checksum row commit in one immediate transaction after a foreign-key check. A failed migration rolls back and leaves its original snapshot intact. A brand-new database and `:memory:` stores do not create migration backup files.

Legacy version rows have no historical checksum to verify. The first upgrade records hashes of the SQL shipped by this build. This detects later edits but cannot prove that an older binary used identical SQL. Unknown versions fail closed. Automatic downgrade is unsupported.

`main/db/migrate.test.ts` reconstructs every historical schema, inserts multilingual document/chat data and settings, dry-runs the upgrade, and checks all records, checksums, foreign keys, and integrity. An injected invalid migration proves transactional rollback and readable backup creation. Independent added migrations automatically join this test matrix through the exported migration array.

## Moodle cache contract

`MoodleResponseCache.get(request, load)` returns `{value, lastSyncedAt, state}`. The state is `fresh`, `stale`, or `offline`. The request identifies an account, kind, key, schema, optional revision, and read mode. A fake clock and in-memory SQLite make TTL and eviction deterministic in tests.

| Resource kind | TTL |
|---|---:|
| Courses, course contents, grades, announcements | Five minutes |
| Deadlines, completion, notification reads | One minute |
| Teachers, mobile configuration | One hour |

The default mode returns a fresh row without network work. A stale row returns immediately while one shared promise revalidates it. Cold callers also share one promise. `refresh` waits for revalidation and accepts a cached fallback only when the caller identifies the error as recoverable. `offline` never calls the loader. Explicit account purge cancels pending loaders and invalidates their generation even when a transport ignores cancellation.

Loaders receive cached ETag and modification-time validators. An `unmodified` response advances the sync timestamp without changing bytes. A changed caller-supplied `revision` invalidates the old payload. Moodle's REST POST functions used here do not expose a useful ETag or conditional timeModified contract, so the adapter uses TTL and validated full responses. It does not invent conditional REST requests. Imported Moodle files separately compare the server's `modifiedAt` and size before reusing a local document link.

`MoodleClient.setCache(cache, accountId, refresh)` caches an explicit read-function whitelist. Keys include site URL, normalized language, function, and sorted parameters. Login, site info containing private keys, tokens, and read mutations never enter the response cache. Wire responses are capped at 16 MiB while streaming. Oversized successful responses can be used without persisting them.

The service already returns the durable course mirror before refreshing. It uses `refresh` mode inside those background jobs, preserving that user-visible stale-while-revalidate behavior. Cached network fallbacks retain the last real sync time. Course details now expose `cacheState` and `lastSyncedAt` to the renderer. Opening a course shows the saved-content state and sync time. Explicit refresh still attempts the network. Auth and permission errors are never hidden as successful network fallbacks.

## Backup and restore format

Settings > Storage exports a standard, uncompressed ZIP32 archive. It is limited to less than 4 GiB and 50,000 files on restore. There is no ZIP64 or general third-party ZIP import support. Streaming keeps file contents out of aggregate RAM. The only allowed paths are `vstudy.sqlite`, `manifest.json`, and recognized originals or conversions under hash directories.

The manifest is `{format:'vstudy-backup', version:1, createdAt, files:[{path, bytes, sha256}]}`. CRC32 validates ZIP bytes. SHA-256 validates the complete manifest inventory and original content hashes. This proves integrity, not the author's identity. The backup contains private coursework and chat data in plaintext.

Before export, maintenance rejects new IPC work, drains accepted handlers, and awaits Moodle, chat, AI, import, conversion, metadata, search rebuild, and purge work. SQLite's asynchronous backup API snapshots committed WAL data. The archive publishes by flushed atomic replacement. A failed export preserves an existing destination.

Restore validates every archive entry, rejects duplicates, traversal, links, compression, and malformed headers, and verifies inventory sizes and hashes. A staged DB upgrades through the normal migration runner. SQLite integrity, foreign keys, settings, document schemas, required source files, and source hashes are checked before publication. Paths are rewritten for the receiving installation. Moodle accounts become expired and raw response cache is cleared.

A validated restore writes `restore-pending.json`. The application pauses new work until restart. On startup, before SQLite opens, idempotent renames move the previous database, sidecars, and library into `.restore-*/previous/`, then publish the incoming database and library. A crash between renames resumes from those paths. The old data is retained until the operator removes the recovery directory. Secrets, provider configuration, CLI logins, and Chromium state are not replaced. Invalid backups leave the live database and library untouched.

The integrity button snapshots SQLite and scans that snapshot in a worker. It reports database integrity and foreign-key failures. It does not hash every original file. Restore performs the stronger archive and source-hash validation.

## Failure behavior and recovery limits

Atomic publication uses a unique sibling temporary file, fsync, rename, and parent-directory fsync. Asynchronous file locks retry EBUSY three times. ENOSPC and permission failures propagate immediately. Storage IPC maps them to localized messages. Small settings, secret, provider, and pin stores retain synchronous APIs with durable replacement. Main-owned files use 0600 and library directories use 0700.

A crash after publishing an original but before committing its document row leaves an untracked hash directory. Re-importing those bytes reuses exclusive source publication. Startup preserves that original rather than deleting potentially recoverable coursework. Failed terminal conversion persistence keeps the converting marker for the next startup. Partial downloads and recognized conversion temporaries are removed at startup.

The SQLite connection and all durable user history are not moved to a dedicated DB process in this stream. Very large upgrades, overview mirrors, or synchronous SQLite operations can still block main. Backup integrity validation on restore also runs during the explicit maintenance operation. Disk-wide quota management, automatic removal of historical recovery copies, and transactional publication of AI Markdown plus provenance are not implemented. No test simulates a physical power cut or failing hardware.

## Verification and performance

Run the focused tests with `pnpm --filter @vstudy/desktop exec vitest run src/main/storage src/main/cache src/main/db/migrate.test.ts --pool=forks --maxWorkers=2`. The tests cover TTL, offline reads, validators, account isolation, purge races, LRU bounds, query-plan indexes, historical upgrades, file publication, invalid archives, portable restore, rename-interruption recovery, integrity checking, and clear-converted preservation of originals.

Run `node --max-old-space-size=512 scripts/bench-db.mjs --storage` from the repository root. It loads pre-stream repository code directly from commit `8e429e0477ccbd64245e661ff7d64734bb48d2bc` and alternates five measurements per side against the same disk WAL DB. It seeds 10,000 document metadata/FTS rows and 40 courses with 40 files each. It checks output equality, counts work and failures, and rejects RSS above 1 GiB. These are warm repository calls. Renderer, IPC, network delay, and actual original-file IO are excluded.

Measurements, profiler notes, Electron screenshots, accessibility results, and the decision trail live in [the storage evidence directory](evidence/storage/). The original larger DB benchmark remains available without `--storage`. It was not used for this memory-constrained run.
