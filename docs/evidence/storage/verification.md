# Stream E verification

The goal is durable local data, bounded Moodle IO, and recoverable student documents. Implementation is on `t3/data-layer`. Main streams H, A, B, and F are merged. The merge commits are `6fb989b` and `72ff1f2`. Main at verification is `f83675a7095a6130b0e44cc99e970122822cb971`.

## Changes and data shapes

The cache key is account, resource kind, and request identity. Rows contain JSON, logical bytes, access/sync timestamps, validators, and optional revision identity. Reads return the value, freshness state, and last real sync time. Credentials, private site info, raw mobile configuration, and mutations are excluded.

Backup manifests contain a version, creation time, and a complete list of paths, byte sizes, and SHA-256 hashes. ZIP contents stream with CRC32 validation. Restore stages and validates all content before creating the restart journal. Existing data remains in a recovery copy. Missing live originals cause export to fail without overwriting a previous backup.

The migration API remains `{version, sql}`. Version 18 belongs to chat history, 19 adds storage, and 20 repairs a conversation index if v18 arrives after a pre-merge v19 development database. Tests cover every historical schema, the complete empty-database path, and that out-of-order upgrade. New migrations need another unused version.

## Commands and results

| Check | Result | Evidence |
|---|---|---|
| `pnpm typecheck` | Passed after both merges and final code changes. | [Typecheck output](typecheck.txt) |
| `pnpm lint` | Passed after both merges and final code changes. | [Lint output](lint.txt) |
| `pnpm test` | Full suite ran once on Node 24.19.0. 822 passed, 14 skipped. Fork pool defaults to two workers. Includes theme contrast and semantic-token checks. | [Full output](tests.txt) |
| Focused final tests | 19 passed across the cache whitelist, backup, and locale contracts after final small changes. Earlier focused atomic/backup checks passed 11 tests. | `src/main/cache/client-cache.test.ts`, `src/main/storage/backup.test.ts`, `src/shared/i18n.test.ts` |
| `pnpm build` | Passed. Existing dynamic/static import chunk warnings remain. | [Build output](build.txt) |
| `node e2e/storage.mjs` from desktop, explicitly using Node 24 | Passed with one Electron instance at a time. Export was accepted by system unzip, clear-converted kept originals, restore survived a controlled process restart, and integrity passed. Six en/zh-Hant/ja light/dark combinations had no axe violations. | [Electron results](electron.json) |
| `node scripts/security-lint.mjs` from desktop | Passed with the two existing allowlisted dynamic-open warnings. | [Security lint](security-lint.txt) |
| `node apps/desktop/scripts/security-audit.mjs` | Failed on unreviewed minimatch advisory 1244623. E adds no dependencies. Combined `security:check` is therefore not green. | [Audit summary](dependency-audit.json), [audit output](security-audit.txt) |
| `node --max-old-space-size=512 scripts/bench-db.mjs --storage` | Passed with 10k docs, 40 courses, 40 files/course, zero failures, and RSS below 1 GiB. Five interleaved samples per side compare actual committed baseline repository modules. | [Measurements](benchmark.json) |

The test worker defaults moved to `vitest.config.ts`. This keeps normal test runs at two forks and avoids duplicate flags when the merged hooks or security command also supply worker options. The full suite was not repeated after the final focused fixes.

An early desktop-directory run selected Node 26 and failed a theme test because Node's global localStorage shadowed jsdom. The documented Node 24 runtime passed it. An initial Electron harness read rejected before main-process logs were captured. It did not recur in the later complete walkthroughs. Its cause remains unverified. The harness also needed axe legacy mode because Electron does not support opening the extra target used by axe's default mode.

## Screenshots

Screenshots remain local under the repo hygiene policy. The rerunnable Electron script regenerates them. Usage, maintenance controls, and narrow restore state were inspected directly.

- [English light usage](en-light.png).
- [English light controls](en-light-actions.png).
- [Traditional Chinese dark controls](zh-Hant-dark-actions.png).
- [Japanese dark controls](ja-dark-actions.png).
- [Validated restore](restore-validated.png).
- [Narrow layout after restore](en-narrow-restored.png).

The UI inherits semantic theme tokens. There are no literal colors in the new storage component or CSS.

## Performance interpretation

The baseline is commit `8e429e0477ccbd64245e661ff7d64734bb48d2bc`. Both sides use the same disk WAL database and warm queries. The benchmark checks returned equality and work counts. It excludes renderer paint, IPC, network latency, and actual original-file IO. The file-inventory path is faster because it no longer reloads full course details per file. Library paging is not claimed faster. Detail-read timing is not claimed faster.

A separate CPU-profile run is excluded from timing evidence. [The profile summary](profile-summary.json) shows the old course reader and repeated validation work alongside setup and integrity-check costs. There is no claim of a measured end-to-end user speedup. The comparison ran on a shared machine with other work active.

## Integration files and remaining limits

Shared changes include `main/db/index.ts`, `shared/ipc.ts`, `shared/i18n.ts`, `shared/moodle.ts`, main startup/IPC registration, the settings tab list, and one course freshness label. Every schools, themes, history, and storage namespace is retained, including pseudo locale entries. Stream D must choose a version after 20 or coordinate another unique version. The complete migration matrix follows the exported migration list automatically.

Model the Domain shaped the typed cache request/result and backup manifest. Make Operations Idempotent shaped source publication, cleanup, and the restart journal. Prove It Works required actual ZIP validation, Electron screenshots, and restore across a real process restart.

Remaining limits are documented in [STORAGE.md](../../STORAGE.md). ZIP32 stays below 4 GiB and 50,000 entries. Database metadata and migrations remain synchronous. Recovery copies require manual retention management. The integrity button checks SQLite, not hashes of all live originals. AI Markdown and provenance publish atomically as separate files. A physical power cut, hardware failure, and the native relaunch button itself were not exercised. Independent review was not run because the user prohibited extra agents. Shipping review belongs to the parent.
