# Delete-pending Windows host investigation

Base: `5a925378`; Windows CI run: https://github.com/ava-apple/vstudy-pro/actions/runs/42606388493

## Root cause: test assumption (b)

The test changes `process.platform` to `darwin` on a Windows host. This enables
`markDeletionPending`'s POSIX parent-directory open/fsync, but does not change
Node's native Windows filesystem implementation. A directory-open failure occurs
before quiescing or rename. The marker has already been written and synced;
the catch removes it, reports the error with `scheduled=false`, and does not
relaunch. Thus the later read sees ENOENT and the once-rejected rename mock is
never reached. This is correct fail-closed behavior for a failed marker commit.
Real Windows product execution skips directory fsync and uses deferred deletion.

The supplied complete Windows log was reviewed, including all stderr blocks,
warning/error diagnostics, deletion tests and final failure sections. It records
2 darwin-case failures and both win32 cases passing; it does not record the
swallowed directory-open error itself. The local injected reproduction and code
trace establish the explanation; a new real Windows CI run is still required.

## Reproduction and fix

On macOS, temporarily wrap the mocked `fs.open` in the original matrix:

```ts
if (platform === 'darwin') {
  vi.spyOn(fs, 'open').mockImplementation(async (path, flags, mode) => {
    if (String(path) === dirname(root) && flags === 'r') {
      throw Object.assign(Error('Windows directory open'), {code:'EPERM'});
    }
    return actual.open(path, flags, mode);
  });
}
```

`pnpm --filter @vstudy/desktop exec vitest run src/main/services/delete-pending.test.ts --pool=forks --maxWorkers=2`
then gives exactly 2 failed / 13 passed, with ENOENT at the marker read in both
darwin cases. The temporary injection was removed after recording the result.

The fixed matrix injects just the POSIX parent-directory handle capability on
both hosts, asserting sync and close. Actual marker open/write/file-sync and
readback remain real; rename failure, scheduled report, relaunch, retained data,
startup wipe and marker removal assertions remain. No tests are newly skipped.
Product code is unchanged. Two additional cases inject the directory-open error:
darwin must abort safely, while win32 must never attempt that directory open.

A third new case mocks `realpath(root)` to a distinct canonical directory, using
a junction/symlink alias so both names refer to the same data. It proves a locked
wipe leaves the marker at the requested root, not the resolved path, and startup
resolves the data path while removing the original marker. This simulates alias
expansion, not actual Windows 8.3/UNC behavior. Production marker creation,
reading and removal all use `root + '.delete-pending'`; realpath only selects the
data directory. The short-name temp path in CI therefore does not explain the
missing marker.

## Validation on macOS

- Forced-win32 script: 5 files passed; 49 tests passed, 1 skipped.
- Full desktop suite (`pnpm --filter @vstudy/desktop exec vitest run --pool=forks --maxWorkers=2`): 321 files passed, 7 skipped; 2874 tests passed, 20 skipped (three new tests; no new skips).
- Desktop typecheck: passed.
- Desktop lint (including UI ratchet): passed.
- Vendor check: 55 vendor sources and 10 application files match reviewed hashes.

## Windows log risk review

`DELETE_LOCKED` is intentionally emitted by logging.test.ts's stopped-sink
persistence test. EPERM/EBUSY are injected lock cases; both win32 variants passed.
Partial/crashed wipes, locked converter prioritization, bounded retries, marker
removal retries, symlink-root deletion and all 20 delete-data tests passed.
No additional delete-all failure or unhandled rejection appears in the log.

Other warnings include React act/controlled-input/layout warnings (including
DeletionNotice updates in agents-app tests), a web-chat mock download listener
limit warning, unsupported Windows terminal encoding, expected document recovery
fault injection, Node module/deprecation warnings, and ignored dependency build
scripts. These do not establish a deletion-path failure and are outside this fix.

Remaining risk: native Windows open/flush/ACL/antivirus locks, junction and
8.3/UNC behavior, and Electron's live Chromium handles are not verified by a Mac
platform stub or injected filesystem capability. Only the next Windows CI run
can verify this patch on Windows; a live Electron deletion run is separate
coverage. No push or PR was performed.
