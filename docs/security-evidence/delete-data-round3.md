# Deletion round 3

Chromium allowlist: `CHROMIUM_HELD_ENTRIES` in delete-data.ts.
Local Electron profile listing inspected on this Mac (names only): Cache,
Code Cache, DIPS, DawnGraphiteCache, DawnWebGPUCache, GPUCache, Local Storage,
Network Persistent State, Preferences, Session Storage, Shared Dictionary,
Trust Tokens, Trust Tokens-journal, blob_storage.
Only Preferences from that listing is retained: Chromium rewrites it while running.
Other caches are removed eagerly; locked entries are retried at startup.
Network is retained for Chromium network service handles on Windows.
Local State and singleton/lock files protect the active Chromium instance.
The marker lives beside userData, contains no deletion path, and is never used
as a source of paths.

References:
- https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md
- https://github.com/chromium/chromium/blob/main/chrome/browser/prefs/README.md
- https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/process_singleton_posix.cc
- https://www.electronjs.org/docs/latest/api/session

Item 1: regression failed (backup survived), then passed with inverted coverage.

Final observations (2026-11-09, macOS, Electron 42.11.16):

| Item | Regression observed before fix | Final behavior |
| --- | --- | --- |
| 1 | Migration backup survived; 1 failure / 8 passes | All non-allowlisted entries removed, including unknown files and temporary snapshots |
| 2 | Locked converter prevented later private files from being removed | Secrets/providers first, DB/copies next, remainder last; all failures retried with backoff and returned |
| 3 | Symlink and Windows-shaped runs both left the database present | Eager priority wipe after stop; marker retained for failures |
| 4 | Partial marker write retained marker and relaunched; directory fsync errors stopped deletion | Roll back marker on failure, tolerate EINVAL/ENOTSUP directory fsync, allow retry without relaunch |
| 5 | Storage-owning stream prevented stop from running | Cancellation precedes drain; deletion disposers start concurrently; timeout retains admission hold |
| 6 | Startup callback used fromPath and omitted cookie flush | Remove Partitions before session construction; clear and flush only default session |
| 7 | Expired marker wiped data, marker symlink was overwritten, transient marker removal failed | 24-hour expiry with status notice, exclusive no-follow creation, no-follow read, marker removal retries |
| 8 | Hanging clearStorageData never settled | Six session operations each bounded to 2 seconds; later operations still attempted; incomplete result retains marker |
| 9 | Multiple quarantine failures produced multiple notices; startup reporter lacked failure notice | Aggregate errors; one unparented asynchronous notice; localized reasons/title and accurate copy in all three locales |
| 10 | Normal shutdown removed handlers before workers stopped; readiness race admitted two deletion requests | Early removal only for deletion; guard set before readiness wait; cancellation starts before waiting |

Item 10's literal guard-position claim did not reproduce: the check already
preceded appReady. The adjacent assignment race did reproduce with a behavioral
test and was fixed. Every item has a recorded failing regression before its fix.
Some existing tests that promised preservation of unknown files or no eager
Windows/symlink deletion were updated to the requested semantics.

The real Electron probe returned sameContext=false and secondCookies=[] after
setting and flushing a cookie in the fromPartition session. This supports
removing fromPath; it does not establish cookie resurrection after a crash.
The probe's quit hung and it was explicitly terminated. The final app E2Es
exited normally. Marker contents remain metadata only and cannot name a path.

Final verification:

- Frozen-lockfile install completed.
- Desktop typecheck passed; commit hooks also passed typecheck and commitlint.
- Root pnpm lint passed. UI baseline before and after: surface-class 166,
  shadow 12, radius 16, color 0, backdrop 1.
- Root vendor-check passed: 55 vendor sources and 10 application files.
- FULL desktop Vitest: 321 files / 2,866 tests passed; 7 files / 20 tests skipped.
  Parent baseline supplied by task: 320 files / 2,849 tests passed, same skips.
- Separate desktop backend run (src/main): 178 files / 1,963 tests passed;
  7 files / 20 tests skipped. An earlier overlapping run caught the deliberately
  introduced red admission-hold assertion; the stable final rerun passed.
- MCP: 14 files / 132 tests passed; 2 files / 3 tests skipped.
- Newsletter: 1 file / 25 tests passed. UI lint script tests: 8 passed.
- Build passed, with the existing large-chunk warning.
- Final rebuilt Electron E2Es, sequentially: security-delete-data, themes,
  storage, privacy-settings, selection-chat all exited 0. Themes recorded 42
  screenshots; storage verified backup integrity and restoration after restart.
  Screenshots generated over tracked fixtures were restored after verification.
- Initial storage invocation refused concurrent Electron tests. It was rerun
  alone successfully, and passed again in the final sequential E2E run.
- Optional Python converter pytest run could not start: Python has no pytest.
- Vitest emitted an existing MaxListenersExceededWarning during download tests.

Not verified: native Windows locks/antivirus behavior; Linux Electron runtime;
actual app.relaunch handoff (delete E2E disables relaunch and starts a second
process manually); crash/power-loss cookie durability; the Python converter
pytest suite. Windows-shaped mocks are not native Windows evidence. Expiry,
filesystem retries and failure paths are covered with fixtures/mocks, not a
24-hour live wait or injected OS power failure.

Logs and structured E2E results are in delete-data-round3/. No push or PR.
