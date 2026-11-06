# AI CLI fixture portability handoff

The fixture follow-up is on `t3/ai-cli-fixes`, commit `e707d93`, together with the four security fixes. Production executable checks, publisher verification, action allowlists, and PTY behavior are unchanged. No Electron process launched for this work.

## Source failure evidence

The owner supplied Windows run `42170686410`, job `127737543788`, and `/tmp/vstudy-sdk-fixed-windows-ci.log`. It reports 1,361 passes, 64 skips, and 22 failures. The five owned files account for 21 failures: five IPC, three probes, one PTY, six service, and six store cases. [The extracted owned failure list](evidence/ai-cli/security/windows-fixtures-ci-failures.txt) excludes unrelated failures. P owns the native Windows rerun; macOS verification is not a Windows acceptance result.

## Changed test and fixture files

Every changed test or fixture is listed below. Paths are relative to `apps/desktop/src/main/`.

| File | Change and Windows expectation |
| --- | --- |
| `ipc/ai-cli.test.ts` | When a real Windows host emulates Linux, the filesystem mocks return private Unix mode bits while preserving actual paths, file types, and IO. Both `lstatSync` and async `stat` follow that model. Native error tests reject through either `execFile` or `spawn`, matching the host terminal path. Metadata fixtures use a PE image. All six Linux/Windows provider combinations remain active. |
| `providers/setup/native-fixtures.ts` | New shared builder emits a one-section PE32+ metadata fixture with x64 or arm64 machine type. It preserves Unix bytes on Unix. Windows service version/status actions execute the fixture's JS with explicit `process.execPath` argv through the existing test injection points. The old/new transport case uses unchanged copies of the runner's real Node executable, so Windows starts real native processes at the two managed paths and retains real process leases. |
| `providers/setup/native-fixtures.test.ts` | New host-independent test exercises the Windows fixture's Node argv mapping, version result, signed-out status, signed-in status, quoted path, and exact provider arguments through a real native PTY. It also runs on macOS; that proves the fixture mapping, not native Windows loading or ConPTY. |
| `providers/setup/probes.test.ts` | Removes shebang execution on every host. Node directly runs temporary scripts named `login` and `acp`, matching the unchanged first status argument. ACP adapter calls use the absolute script path because its working directory is separate. Exit status, ACP messages, and the tool-free answer still come from real processes. |
| `providers/setup/pty.test.ts` | The argv result uses a base64 frame so ConPTY wrapping cannot split JSON strings. The consumer removes terminal controls and frame whitespace before decoding, then retains the same literal argv and environment assertions. Adds a Windows-only real native ConPTY assertion. Existing lifecycle tests stay active on Windows. |
| `providers/setup/service-fixtures.ts` | Uses shared platform-correct payloads. Windows routes version/status execution through native Node and a real PTY; Unix retains the original shebang executable, version probe, and adapter behavior. An explicit program hook adds the automatic-update marker before building the PE image. |
| `providers/setup/service.test.ts` | Existing selected files have `.exe` on Windows. Only the two embedded-login cases are macOS-only, matching the existing sandbox policy. Install, discovery, consent, idle checks, update, rollback, account preservation, and reload cases stay active on Windows. Existing test names are unchanged. |
| `providers/setup/store.test.ts` | Uses PE metadata bytes on Windows, including tampered files, so checksum and identity failures reach the intended boundary. The leased old/new transport uses actual Node executable copies on Windows and the original shell scripts on Unix. Existing names and side-by-side, rollback, checksum, and confirmation assertions remain. |
| `providers/setup/adversarial-review.test.ts` | Forged records use `.exe` paths and PE bytes on Windows. The paused-download marker is inserted into JS before binary construction, avoiding UTF-8 conversion of a PE image. Consent cancellation and prior-pin assertions remain intact. |
| `providers/setup/authenticity.test.ts` | Uses PE metadata bytes for signed-manifest and forged-key cases. Removes their old Windows skips, adding Windows coverage of the production publisher verifier. Codex's native artifact test keeps its existing macOS-only gate. |

The shared PE metadata image is not used as a real provider implementation. Windows service fixtures execute their JS through Node. The Windows transport test instead uses real Node PE bytes so the executable path itself stays leased. No compiler, network download, global install, or production validator bypass is required.

The image layout follows [Microsoft's PE format reference](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format). macOS `file` recognizes the generated x64 and arm64 samples as Windows PE32+ console images. [Recorded format inspection](evidence/ai-cli/security/windows-fixtures-pe-format.log) does not claim Windows execution of those metadata stubs.

## Platform gates and ConPTY

Only these two service tests now require macOS:

- `installs, verifies real auth, signs in with one PTY, and tests through the real Claude adapter`.
- `cancels a live login when the existing provider configuration revokes consent`.

They exercise embedded sign-in through `sandbox-exec`. The product already rejects embedded login on Windows and Linux and offers the user's own terminal. Skipping these cases there reflects that policy. Status and account-preserving updates continue to run there.

All eight existing `pty.test.ts` cases remain active on Windows. They cover literal argv and environment handling, bounded input, resize, descendant cancellation, output flood limits, one terminal per action, owner isolation, capped output, and document-reset teardown. A ninth Windows-only case, `uses the pinned native ConPTY agent on Windows for the real action lifecycle`, runs native Node and asserts node-pty 1.1.0 selected `_agent._useConpty === true`. That assertion is tied to the pinned library internals. It deliberately does not force a different backend inside the test. The pinned library selects ConPTY by default on Windows build 18309 or later. See `node-pty/src/windowsPtyAgent.ts` and `typings/node-pty.d.ts` in the installed dependency.

The ConPTY-specific case is skipped on macOS because that backend exists only on Windows. No Windows lifecycle case was skipped to hide `CreateProcess` error 193 or terminal formatting differences.

## macOS verification

| Command | Result |
| --- | --- |
| Focused IPC, probes, PTY, service, store, security-regression, and fixture tests | 57 pass, one skip. |
| `pnpm --filter @vstudy/desktop typecheck` | Passes. |
| `pnpm --filter @vstudy/desktop lint` | Passes. |
| `pnpm knip` | Passes with the existing excluded-CSS configuration hint. |
| `pnpm vendor:check` | Passes. |
| `pnpm security:static` | Passes with the existing three external-link warnings. |
| `pnpm test --pool=forks --maxWorkers=2` | One full run passes 1,184 tests and skips 15. 152 files pass and five skip. |
| Final PTY, store, and fixture rerun after output framing and unchanged-Node-copy refinements | 24 pass, one skip. Scoped lint passes. |

[The check record](evidence/ai-cli/security/windows-fixtures-checks.json) links retained output. The full test suite was not repeated after the final fixture-only refinements; the affected files were rerun directly.

## P's Windows rerun

After merging `t3/ai-cli-fixes`, run this from the repository root:

```sh
pnpm --filter @vstudy/desktop exec vitest run src/main/ipc/ai-cli.test.ts src/main/providers/setup/probes.test.ts src/main/providers/setup/pty.test.ts src/main/providers/setup/native-fixtures.test.ts src/main/providers/setup/service.test.ts src/main/providers/setup/store.test.ts src/main/providers/setup/adversarial-review.test.ts src/main/providers/setup/authenticity.test.ts --pool=forks --maxWorkers=2
```

Confirm the ConPTY-specific test actually runs. Confirm both provider status codes, ACP status and answer, old/new process leases, rollback, PE checksum failures, revoked-update cleanup, forged-record confirmation, and signed-manifest verification pass. The two embedded-login cases should skip on Windows. Then run P's normal full Windows checks. Native Windows results remain pending that CI run.

Fix Root Causes moved the incorrect OS assumptions into explicit fixtures. Test Behavior kept the same observable process, consent, identity, and output assertions.
