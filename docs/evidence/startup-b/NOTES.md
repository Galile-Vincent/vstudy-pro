# Stream B: startup FTS and batch migration evidence

Reproduce from this worktree root (Node v24.19.0, local macOS disk):

```sh
node docs/evidence/startup-b/bench.mjs --baseline
node docs/evidence/startup-b/bench.mjs
pnpm --filter @vstudy/desktop exec vitest run src/main/db/migrate.test.ts src/main/services/search-maintenance.test.ts src/main/services/library.test.ts src/main/ipc/library.test.ts --pool=forks --maxWorkers=2
pnpm --filter @vstudy/desktop typecheck
pnpm --filter @vstudy/desktop exec eslint src/main/db/migrate.ts src/main/db/index.ts src/main/services/search.ts src/main/ipc/library.ts src/main/db/migrate.test.ts src/main/services/search-maintenance.test.ts src/main/ipc/library.test.ts
```

The script loads the actual SearchService and migration runner via Vite's module loader without listening on a port. `--baseline` loads those two files from immutable commit c67522f5. Both sides seed the same deterministic 15,360-byte indexed text per document, on a WAL database, incrementally at 1,000/3,000/6,000 documents. The 5 ms interval measures main-thread availability during the complete rebuild; it does not measure renderer frames. Full output is in before.txt and after.txt. These are single warm synthetic runs, not production cold-start percentiles. The healthy fixture has no missing-file IO.

Baseline at 1k/3k/6k: FTS check 272.0/803.1/1568.7 ms, complete rebuild 386.3/1162.3/2306.7 ms, maximum event-loop gap 272.6/824.0/1645.8 ms.
After at 1k/3k/6k: FTS check 267.4/798.2/1567.3 ms, complete rebuild 376.4/1112.3/2328.6 ms, maximum event-loop gap 6.4/6.6/6.6 ms. The standalone FTS check intentionally still runs synchronously for measurement; production rebuild dispatches it to a worker.

The IPC lifecycle test asserts exactly `window-created -> window-shown -> maintenance`; registration, creation, and even the synchronous show callback cannot start rebuild. It also checks cancellation before show and the existing deferred-until-next-startup failure log. No Electron instance was launched. On-disk worker tests repair missing, duplicate, orphan, and deliberately corrupted FTS data. In-memory stores retain the inline scan because an independent SQLite connection cannot share them; production uses disk stores.

The upgrade fixture is a 200,196,096-byte indexed relational DB with three pending migrations. Before: `pending=3 migrationMs=677.7 snapshots=3`. After: `pending=3 migrationMs=226.2 snapshots=1`. Tests inspect the snapshot's original sentinel and migration version, exercise success and failure batches, verify earlier transactions stay committed on a later failure, and successfully upgrade the recovered snapshot. Three newest snapshots are retained after a successful batch; failed batches never prune. Existing snapshots are reused without another VACUUM on retry of the same first pending version.

Crash-check comparison on the same 200 MB relational fixture: baseline integrity/quick 160.4/26.4 ms; after 175.1/33.1 ms. On the 514,039,808-byte FTS-heavy database, integrity/quick were 1758.9/1710.9 ms before and 1779.0/1900.0 ms after. Quick_check skips relational index consistency work, but FTS virtual-table checking still dominates this corpus: no general FTS recovery speedup is claimed. Explicit user integrity checks remain full checks.

Final focused run: 54 tests passed across 4 files. Typecheck and lint on all touched TypeScript files passed. A corrupt-index fixture initially failed because Node enables SQLite defensive mode; the fixture explicitly disables defensive mode only to inject corruption. No production defensive-mode setting changed.

Limitations/follow-ups: schema migrations and the single recoverable snapshot still precede window creation; upgrades can therefore still take time. Upgrade progress UI is intentionally a follow-up. Worker maintenance still shares SQLite locking with main-process writes. No physical power-cut or hardware-failure test, packaged Electron launch, or unrelated full test suite was run.
