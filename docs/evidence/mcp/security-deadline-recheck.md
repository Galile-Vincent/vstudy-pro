# Independent MCP startup deadline recheck

The goal is to let student-selected global agents read Moodle coursework through VStudy's session. School credentials stay in main, and writes require exact student approval. This review covers only the startup deadline fix for R1 in the [previous independent recheck](security-recheck.md#r1-low-the-nominal-95-second-retry-deadline-is-not-a-hard-deadline).

The immutable reviewed implementation is `4db6a129039be0617dd8168504d99adfdd60202a`. The inspected fix is `f2b2734944508be5259095c8ab694b5e98ae1c1e..9e7cb8086617abecf5e364d54920fdfd966af3fb`, limited to these files:

- `apps/mcp/src/bridge.ts`
- `apps/mcp/src/connection.ts`
- `apps/mcp/test/windows-pipe.test.ts`

`git diff --quiet 9e7cb80 4db6a12 --` with those three paths exited 0. The branding merge preserves the reviewed fix files exactly. Findings A through D and the full feature security review were not repeated.

**Verdict. R1 is fixed.** Source inspection, tracked regressions, and independent synthetic probes found no remaining defect in this delta. The default Windows retry cycle starts no connection at or after its deadline. A pending final relay attempt receives cancellation at the deadline without reading credentials. Readiness at 92 seconds still works. Native Windows execution remains unverified.

**Built-artifact verdict. PASS.** `pnpm --filter @vstudy/mcp verify:core` exited 0 against the freshly built CLI, official SDK, real main engine, native Unix peer helper, and synthetic backend. This is core acceptance on macOS. It is not Electron, final package, or Windows acceptance.

## Timing and cleanup behavior

`bridge.ts:118` applies the bound to the default Windows backoff schedule. `bridge.ts:122` checks the deadline before waiting, `bridge.ts:123` caps the wait by the remaining time, and `bridge.ts:124` checks again before opening. The tracked unavailable-app test observed the last attempt at 94,000 ms and failure at 95,000 ms. The old 96,000 ms start no longer occurs.

Each attempt creates a deadline timer at `bridge.ts:126`. Its signal combines with client-close cancellation at `bridge.ts:130` and reaches the authenticated connector through `connection.ts:46`. `windows-pipe.ts:45` destroys all three process streams and kills the relay on cancellation. Its cleanup also clears the native readiness timer. `bridge.ts:132` closes a late successful connection before `authenticate` can read an identity at `bridge.ts:78`. The `finally` at `bridge.ts:147` clears the outer attempt timer on success, failure, cancellation, and a late return.

The deadline is a connection-startup budget, refreshed after the launcher completes at `bridge.ts:145`. It does not cap later pairing or tool RPCs. The existing read-only reconnect policy can start a fresh connection cycle. Writes retain one call attempt. Explicit `backoffMs` arrays remain an internal test override. Inspection of the CLI parser and constructor found no CLI or client-config option for them.

The existing native readiness timeout still applies when it is earlier than the overall deadline. A synthetic opening attempt at time zero returned `TIMEOUT` at 30 seconds and cleaned up. A final attempt beginning at 94 seconds instead aborted at 95 seconds, leaving only one second of startup budget.

## Independent observable checks

A disposable file, `apps/mcp/test/security-deadline-disposable.test.ts`, contained 17 independent probes. It used a synthetic SID, in-memory streams, mocked credential access, and no-op or timer-controlled launchers. The one real child was a harmless Node process. The production connector's injected `start` function spawned it instead of PowerShell. No school or actual client configuration was involved.

The probes observed these results:

- Both `ENOENT` and `ECONNREFUSED` respected the deadline after a delayed launch. The initial failure took 500 ms, and the launcher took 7,000 ms. Its completion established the deadline at 102,500 ms relative to the call. The last connector start was 101,500 ms. The result remained pending at 102,499 ms and returned `DISCONNECTED` at 102,500 ms. No credential read or later attempt occurred.
- A connector returning a stream at exactly 95,000 ms or at 95,001 ms produced `DISCONNECTED`. Both streams were destroyed without a client write or identity read. These fixtures advanced the wall clock inside the connector to exercise the post-connect guard independently of timer delivery.
- A final relay attempt began at 94,000 ms. The benign Node child was alive before cancellation, verified with `process.kill(pid, 0)`. It was still un-killed at 94,999 ms. At 95,000 ms, the combined signal aborted, the call returned `DISCONNECTED`, all process streams were destroyed, and `kill` ran once. There was no stdin write or identity read. The child emitted `close`, its signal was `SIGTERM`, and `process.kill(pid, 0)` then threw `ESRCH`. Advancing another 40 seconds produced no retry or credential read.
- Synthetic native readiness at both zero and 92,000 ms released a framed request with an in-memory local grant. The fixture returned a valid `DENIED` result. After another 96 seconds, a second request still used the same connection. Only one identity read and one relay start occurred. There were exactly two request writes. The expired startup timer did not kill the accepted session. Explicit client close then destroyed its streams and killed the relay once.
- Errors on stdin, stdout, and stderr cleaned up in both opening and accepted states. Opening failures read no identity and wrote no bytes. Accepted failures rejected the pending request. Every case destroyed all process streams and killed the relay once.
- Client close during the final attempt at 94,500 ms returned `DISCONNECTED`, killed the relay, read no identity, and left no later retry. The earlier 30-second native timeout also cleared the outer deadline timer.
- Default Unix retries retained the start sequence `0, 100, 350, 850, 1850, 3850, 6850` ms. The real Unix bridge tests and built core check also passed. The explicit Windows test override `[0, 96000]` retained its override behavior.

Each independent probe asserted zero remaining fake timers after its operation or explicit close. These assertions cover both the native readiness timer and the new outer timer. They are controlled-clock behavior checks, not measurements of Windows startup or ARM compilation.

The tracked timer fixture replaces `node:timers/promises.setTimeout` with an abort-aware Promise backed by global timers. Its success path removes the abort listener. Its abort path clears the timer. The independent fixture used the same timer mechanism with a separately written implementation. This lets Vitest advance actual backoffs and the deadline together. The tracked 92-second positive control and the independent framed-session control both passed under the default Windows schedule.

## Commands and results

All commands ran in `/Users/vc/.t3/worktrees/vstudy-pro/t3-e52444d7`. The host was Darwin arm64 with Node `v24.19.0` and pnpm `10.28.2`. Every Vitest run used `--pool=forks --maxWorkers=2`. The package test script already includes those flags.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --ignore-scripts` | Passed. The lockfile remained unchanged, and lifecycle scripts did not run. |
| `pnpm --filter @vstudy/mcp test` | Passed after building the CLI and installer. Twelve files and 123 tests passed. One native Windows file with two tests skipped. Those tests are not counted as passed. |
| `pnpm --filter @vstudy/mcp verify:core` | PASS, exit 0. Verified 27 tool schemas, pending-consent pairing, one-shot finish, opaque cursor roundtrip, eight queued reads, an approved synthetic write, restart, disabled access, authenticated doctor probes, and explicit reset with fresh consent. |
| `pnpm --filter @vstudy/mcp exec vitest run test/security-deadline-disposable.test.ts test/windows-pipe.test.ts test/bridge.test.ts --pool=forks --maxWorkers=2 --reporter=verbose` | Final run passed three files and 46 tests, including all 17 independent probes. The first run passed 45 tests before adding the independent 92-second framed-session control. Neither run had a failed assertion. |
| `pnpm --filter @vstudy/mcp typecheck` | Passed, exit 0, against the tracked implementation and tests before the disposable file was added. |
| `pnpm --filter @vstudy/mcp lint` | Passed, exit 0, against the tracked implementation and tests before the disposable file was added. |
| `pnpm --filter @vstudy/desktop exec node /Users/vc/.t3/worktrees/vstudy-pro/t3-e52444d7/apps/desktop/scripts/security-lint.mjs` | Passed, exit 0. Reported three existing allowed `no-open-external-with-dynamic-url` warnings in IPC, SSO protocol, and webview code. No error occurred. |
| `git diff --check 4db6a12` | Passed. |
| `git diff --exit-code 4db6a12`, `git diff --cached --exit-code`, and `git status --porcelain=v1 --untracked-files=all` | All exited 0 with empty output after disposable-test removal and before this report was added. |

The accepted built CLI was `apps/mcp/dist/vstudy-mcp.cjs`, SHA-256 `649f609193ebe5fffb11912b93978531e3bf5e5531ee35bd3a0fa1856911a995`. Its sibling `installer.cjs` had SHA-256 `8d511b061ca20327559807428eebfa6820cbd5c1bcb1fbdf9c6cbffdd94be1d3`.

## Limits and cleanup

The two tests in `windows-pipe-native.test.ts` skipped on macOS. Actual Windows named-pipe startup, PowerShell 5.1, owner and DACL checks, Identification-level behavior, byte forwarding, process termination, and P's ARM cold-host compilation were not run. The Mac child-exit observation proves the connector's cancellation path with a real benign process on this host. It does not prove Windows kernel behavior. Readiness at 92 seconds is a synthetic compatibility control for P's stated 90-second budget.

No Electron, live school, OS credential store, real credential file, actual global-client configuration, other-user login, or external message was used. Parent owns the final Electron and package runs. The full desktop suite, aggregate `security:check`, dependency audit, and final package acceptance were not run here.

The checkout started clean. The temporary test was removed, and the real synthetic child exited before handback. Core acceptance removed its temporary home, bridge state, and helper in its `finally` block. Production source and tracked tests remained unchanged. This report is the only committed change. The final response records the report commit SHA and post-commit worktree status.

Prove It Works led to the built CLI/core run and the child-exit observation. Test Behavior, Not Implementation led to assertions on connector starts, returned errors, stream destruction, request bytes, credential access, and PID existence. Model the Domain kept the probes organized around opening, accepted, and closed relay states. Technical-writing, unslop, and deslop checks apply to this evidence report. Throughput checkpoint is not applicable to this read-only investigation.

All review and verification ran in-thread under the explicit no-children instruction. The how and comment-review child dispatches were skipped under that constraint. No production comment was edited.
