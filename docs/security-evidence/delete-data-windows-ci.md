# Delete-all Windows CI follow-up

Run from the workspace root:

```sh
pnpm --filter @vstudy/desktop test:delete:win32
pnpm --filter @vstudy/desktop exec vitest run --pool=forks --maxWorkers=2
```

The first command uses `vitest.delete-win32.config.ts`, runs only the five
files that failed Windows job 129107271810, and sets `process.platform` to
`win32` before importing application modules. The filesystem remains the
host filesystem. The filesystem-mocked delete-data unit suite also substitutes
`path.win32` and uses a drive-qualified root, so backslash and drive handling
are exercised on Mac. Real-filesystem tests keep host paths. POSIX-only
quarantine and directory-fsync cases explicitly select `darwin`; Windows lock
cases explicitly select `win32`. Descriptors are restored after each case.
The existing POSIX permission test is skipped in the forced run and still runs
in the normal Mac suite. No symlink or hardlink coverage was removed.

macOS CI now runs this command after the normal desktop suite. It covers eager
owned-entry deletion, marker durability and removal, lock failures and retries,
startup recovery, quiescing real worker families, backup restoration/deletion,
POSIX rename errors, and quarantine discovery with Windows path semantics.
It does not emulate Windows kernel locks, ACLs, antivirus, case-insensitive
filesystem behavior, native symlink privileges, or Electron relaunch.

## Classification

All eleven failures in the supplied Windows log are test assumptions:

- hardening, review/lifecycle and study-backup expected the root directory to
  disappear. Round 3 explicitly retains the Windows root and eagerly deletes
  all non-allowlisted children. Their fixtures now require an empty Windows
  root and no pending marker; POSIX still requires root removal. Worker-drain,
  link rejection and restored-study assertions remain intact.
- delete-data rename failures (EACCES/EPERM/EBUSY), atomic rename, and admission
  failure tests accidentally selected Windows eager deletion with a mock that
  omitted realpath. They now explicitly select the POSIX contract and add a
  complete realpath fake plus Windows admission/lock cases for all three codes.
- delete-data quarantine retry hard-coded slash-separated expected paths.
  Expectations now use join/dirname and the mock-only forced run uses path.win32.
- delete-pending EPERM/EBUSY cases injected rename errors even though Windows
  never renames. They now run both contracts, inject persistent rm errors at
  the resolved owned-file path for Windows, require reporting/relaunch and
  retained data/marker, then prove startup recovery removes both.

No production code change was necessary for these failures. Windows avoids
renaming a profile while Chromium may hold handles. Expected lock failures
retain the durable marker and are retried at startup. The `win32Error: 5`
elsewhere in the supplied log belongs to a passing cross-user pipe access-denial
probe, not deletion.

## Local evidence (macOS, 2026-11-09)

The initial five-file forced run, before assertion fixes, reproduced all eleven
failures: 5 failed files; 11 failed / 30 passed / 1 skipped tests. This run also
used the path.win32 mock for the fake-filesystem unit suite; platform stubbing
alone cannot reproduce the native separator mismatch.

After fixes: 5 passed files; 46 passed / 1 skipped tests. Five additional cases
cover three Windows admission/error codes and two additional platform variants
of durable lock recovery. Before/after logs and the full-suite summary are in `delete-data-windows-ci/`.

Full desktop suite: 321 passed / 7 skipped files; 2,871 passed / 20 skipped
tests (baseline 2,866 passed; five new cases). Frozen-lockfile install, targeted
ESLint, desktop typecheck, commitlint and vendor-check passed. Vendor-check ran
before every application-file commit. The full run emitted the existing
MaxListenersExceededWarning during download tests.

The existing round-3 real-Electron and filesystem evidence is unchanged.
Only a subsequent native Windows CI run can verify Windows behavior.
