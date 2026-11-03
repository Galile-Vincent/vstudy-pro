# Library data model

The authoritative transport schemas are `apps/desktop/src/shared/library.ts`, spread into `shared/ipc.ts`. Library documents contain `{document, folderId, position, pinned, pinnedAt, lastOpenedAt, pageCount, sizeBytes, contentChars}`. The nested `document` preserves the existing reader/chat contract. All paths remain main-owned; export requests accept document IDs only.

```text
folders --parentId--> folders                 (maximum depth 8)
folders <--folderId-- documents                (NULL = Unfiled)
documents <--documentId-- document_tags --tagId--> tags
documents <--documentId-- conversations <--conversationId-- messages
documents <--documentId-- activity_events
activity_days(date PK): chatCount, readSeconds, importCount
usage_events --AFTER INSERT trigger--> usage_daily
usage_daily PK(date, providerId, modelId, documentId)
documents --id--> document_fts(documentId, title, filename, content)
saved_filters(id, name, queryJson, position)
settings(key, value JSON)
```

Deleting a folder reparents its children/documents to the requested parent or Unfiled in one transaction. A sibling-name collision rolls the operation back. Unique sibling names use SQLite NOCASE (ASCII case folding); full Unicode case folding is not implemented. Folder moves check both cycles and subtree height. Manual moves use midpoint REAL positions, rebalancing siblings at a gap below 1e-6. Bulk moves preserve input order and roll back as a unit. Pin timestamps survive repeated pin requests; pin reordering sets descending timestamps.

List filters combine type groups, status, converter, folder/subtree, tag, added dates, byte ranges, chats, pins, and literal text. Keysets use the selected sort value plus document UUID. Recent, Pinned, Unfiled and Converting/Failed are computed views. Messages and usage additionally expose bounded `messages:page` and `usage:page`; existing array endpoints remain compatible.

## Indexes and hot queries

| Index | Query served |
|---|---|
| folder_siblings | unique sibling names including root folders |
| folder_parent; folder_pins | folder tree/manual ordering; pinned folders |
| documents_manual; documents_all_manual | folder/all manual pages |
| documents_name; documents_all_name | folder/all case-insensitive title pages |
| documents_created; documents_folder_created | date-added pages |
| documents_opened; documents_folder_opened | recent documents and folder history |
| documents_pins | dashboard pins ordered by pin timestamp |
| documents_status; documents_converter | conversion queues/filter views |
| documents_size/type; documents_folder_size/type | size/type pages |
| documents_deleted | expired soft-delete purge |
| document_tags PK; tag_documents | assignment lookup and reverse tag joins |
| conversations_document; conversations_updated | hasChats, conversations by document/update time |
| messages_conversation; messages_page | history and keyset pages by conversation/time/ID |
| usage_created; usage_page | date ranges and keyset pages |
| usage_provider_model; usage_document_date | provider/model/document time ranges |
| usage_conversation; usage_document | legacy detail endpoints |
| usage_daily PK; usage_daily_document | month/14-day/provider/model/document rollups |
| activity_recent | recent imports/chats |
| FTS5 trigram virtual index | literal title/filename/content substring search |

`library.test.ts` asserts index use for representative metadata, status, pin, tag, message, conversation and rollup queries. Short FTS fallback necessarily scans the FTS content, not the documents table. Arbitrary combinations may use one selective index and sort the bounded metadata set; exhaustive query-plan coverage of every combination is not claimed.

## SQLite lifetime and migrations

On open: WAL, synchronous NORMAL, foreign_keys ON, busy_timeout 5000, temp_store MEMORY, mmap_size 256 MiB, cache_size -16384 (16 MiB). New databases select incremental auto_vacuum before creating tables. Existing databases retain their auto_vacuum mode: switching requires an explicit maintenance `PRAGMA auto_vacuum=INCREMENTAL; VACUUM` with sufficient free disk, a verified backup, and no active work. Opening does not impose that blocking rewrite.

Migrations are numbered, forward-only and transactional. Version 5 adds library tables/columns, rebuilds usage rollups and backfills conversation updatedAt. Before applying it to an existing database, the application checkpoints WAL and copies the database to `<db>.before-v5.bak`, mode 0600. Version 6 only adds indexes. A test creates the previous four-migration schema, inserts multilingual document/chat data and existing usage, migrates it, verifies backup creation, rollups and integrity. The previous schema remains recoverable in the backup; automatic downgrade is unsupported.

Every five minutes and on close, `PRAGMA optimize` runs. Periodic maintenance requests 128 pages of incremental vacuum. A surviving nonempty WAL triggers integrity_check after SQLite recovery; `store.integrityCheck()` also exposes an on-demand check to main code. The DB file, backups and existing secrets get mode 0600; the library gets 0700 each DocumentService startup.

## Search and caches

Search uses a separate FTS5 trigram table with original text, BM25 weights favoring title/filename, literal quoted MATCH phrases, and bound SQL parameters. Quotes are doubled inside the phrase; punctuation and operators are never accepted as query syntax. Queries under three Unicode codepoints use escaped literal LIKE so 資料, 通信, 学習 and 網路 work. Cursor ordering is `(rank, documentId)`; ranked hits are limited before snippet generation. Snippets use `[mark]` / `[/mark]` markers, never trusted HTML. Short-query snippets center on a content match.

Tests compare a CJK-only overlapping-bigram unicode61 preprocessing candidate (English tokens retained) with trigram + short-query fallback on zh-Hant, Japanese and English fixtures. Both find the required two-character terms and English. Trigram was chosen because it preserves original-text offsets/native snippets and supports arbitrary literal substrings without maintaining a second token-to-source mapping. At benchmark scale short-query fallback is below 4 ms. Search rejects results when elapsed synchronous SQL time exceeds 80 ms; this is an elapsed-time guard, not a cancellable SQLite execution deadline. Heavy content beyond the seeded workload needs a worker-thread deadline before claiming a hard bound.

Conversion finalization updates status, parser, contentChars, page markers and FTS inside one savepoint. Imports record actual bytes and MIME. Renames/deletes update FTS with database triggers; restore reloads contained Markdown. Startup checks FTS integrity, removes orphan rows and rebuilds missing/duplicate/length-mismatched entries from contained files. Missing files remain retryable. Equal-length external edits are not detected. Startup consistency checking groups index metadata once rather than rescanning FTS for each document.

Large originals and Markdown remain files; list queries read metadata only. SQLite's page cache and mmap are bounded as above; statements are prepared per service call. Existing conversion reuse is by source hash. Converter-version cache invalidation and rendered-AST LRU are not implemented in this data change. Home reads usage_daily exclusively, and `usage.rollupSummary` aggregates those rows without deserializing events. Legacy Usage screen summary/dashboard endpoints still deserialize raw records and are not covered by the new dashboard budget.

## Activity, deletion and files

Activity dates use main-process Intl with the IANA system timezone. The pure streak function accepts an explicit zone and clock. A study day has a chat, import, or at least 60 active read seconds. Yesterday's streak survives until tonight; tests cross spring DST, fall DST's date, Taipei midnight, and the grace boundary. Heartbeats validate integer seconds 1–60, constrain elapsed time per sender/document and require a live document. Chats/imports use unique event IDs to avoid duplicate increments. Opening Markdown updates lastOpenedAt.

Soft deletion hides metadata and search immediately and aborts chat through the existing ownership-aware deletion hook. Restore is idempotent while live and allowed within 30 seconds. Every 30 seconds, expired documents have their contained hash directory removed before their DB row; FK cascades remove chats/messages/tags/activity and the FTS delete trigger removes indexed content. Failed filesystem removal leaves the row for retry. Finalization skips documents already hidden/purged. Purge skips IDs with queued/running converter jobs and retries once the final writer settles; this prevents republishing files after physical deletion. Conversion work is allowed to settle during the grace period.

Imports reject source symlinks, executable signatures, mismatched PDF/Office signatures and binary data masquerading as UTF-8 text. OOXML validation bounds central-directory entries (10,000), uncompressed total (256 MiB), and per-entry ratio (200:1); rejects encrypted entries, symlink entries, traversal names and incorrect Office families before conversion. ZIP64 is not supported. The staged copy is validated again to catch changes during copying. Hostile fixture tests cover executable/PDF mismatch, symlink escape, ZIP limits, traversal and Office mismatch. Validation bounds declarations; adversarial decompressor fuzzing is unverified.

`containedPath` checks lexical and realpath containment and rejects symlinks below the library root. Markdown reads, chat context, asset serving, restore, exports, reveal and original-open use it. Native save dialogs own export destinations. Original-open accepts PDF, OOXML, Markdown, text and CSV only. Exports are limited per sender to one per second.

## Benchmark evidence

Run `node scripts/bench-db.mjs` from the repository root (Node 24). It seeds a temporary disk WAL database using explicit transactions: 5,000 documents, 400 folders, 100,000 messages, 1,000,000 usage events, including real rollup triggers and 5,000 multilingual FTS entries of approximately 3,000 characters each. Every document matches each tested search, so rank/snippet pagination sees the full library. Seed time: 32.93 s on this Mac, Node 24.19.0. Each query warms once then runs ten times. Measurements are warm-cache synchronous main-service costs; they exclude IPC/renderer paint and converter work.

| Query | p50 ms | maximum ms | budget ms |
|---|---:|---:|---:|
| Folder page | 0.28 | 0.40 | 15 |
| Filtered folder page | 0.24 | 0.26 | 15 (same list target) |
| English FTS (`science`) | 23.61 | 24.15 | 80 |
| zh-Hant (`資料`) | 2.81 | 3.29 | 80 |
| Japanese (`学習`) | 2.81 | 2.85 | 80 |
| Dashboard | 2.71 | 3.16 | 100 |
| Document metadata | 0.01 | 0.02 | 50 metadata target |
| Move | 0.06 | 0.07 | not specified |
| Usage rollup summary | 0.41 | 0.42 | not specified |

An initial English search exceeded 80 ms because it produced snippets for all 5,000 matches. Materializing ranked hits and limiting before snippets fixed the miss. Cold startup to interactive (<2 s), actual document first paint (<50 ms), maximum-size Markdown search and real low-memory behavior remain unverified.

Verification at handoff: `pnpm typecheck`, `pnpm build` (through smoke), and `pnpm smoke` passed. `pnpm test` passed all 35 files: 199 passed, 4 skipped. The focused data/service/contract selection passed 45 tests. Full lint passed earlier, but the last run encountered two concurrent renderer WIP errors (`data-table.tsx:2`, `inline-citation.tsx:2`, no-unused-expressions); this worker did not modify them. The selection-chat e2e attempt stopped at an ambiguous Import document locator after the renderer gained another import button. UI-dependent e2e flows have not been repaired in this worker's scope.
