# Independent MCP security recheck

The goal is to let student-selected global agents read Moodle coursework through VStudy's session. School credentials stay in main. Each write needs exact student consent, and assessment automation remains forbidden.

Reviewed immutable implementation HEAD `b0c6a5d7630ab48866c9e7f91f45a69e50fde8e5`. The principal fixes are `ff6d4f85d332247c983dbc4453412563bf0511d7` and `36a8cbe19e47ee5339a53007c00133969c8f61e9`. Compared with those commits, the reviewed backend implementation and Windows client implementation are unchanged. The later backend change is documentation only.

The supplied briefs, poteto agent instructions, full poteto-mode skill, [original audit](security-audit.md), and [fix report](security-fixes.md) were read. Work stayed in `/Users/vc/.t3/worktrees/vstudy-pro/t3-fd008aec`, on branch `t3/review-mcp-security-fixes` at handback. The checkout started clean. No production source or tracked test was changed. Both disposable test files were removed before writing this report. This report is the only committed change.

**Verdict.** Findings A through D are fixed in the reviewed implementation, supported by source traces and observed synthetic results. No remaining security blocker reproduced in this scope. One low-severity retry-deadline correctness issue remains. Windows kernel acceptance and secondary-user isolation are unverified, not passed. This is a local source and fixture verdict, not final package acceptance.

## Original findings

| Finding | Status | Observed evidence |
| --- | --- | --- |
| A. Credential fragments across excerpt boundaries | Fixed | Both original boundary regressions passed. An independent short-secret probe also covered 300-character metadata caps, converted-file pages, and search. No school request occurred. |
| B. Consent payload differs from the first write | Fixed | First-write and pending-proposal regressions returned `INVALID_ARGUMENT` without a task. An independent remote probe learned a new secret after approval and stopped before assignment saving. |
| C. Assignment requests after grant expiry | Fixed | The real two-second expiry regression passed. An independent clock-controlled probe recorded the complete request sequence and found no request after saving returned across expiry. |
| D. Scheduler-queued mutation after school disconnect | Fixed | The six-slot scheduler regression recorded zero transport dispatches for the queued completion. An independent disconnect-and-restore probe kept the captured client invalid while a fresh client worked. |

### A. Complete-text redaction precedes excerpt boundaries

`apps/desktop/src/main/mcp/backend.ts:42` sanitizes the complete input with `Number.MAX_SAFE_INTEGER`, then applies `McpRedactor.text` with the requested cap. `redaction.ts` replaces known secrets before its final slice. Preparation loads stored token, private-token, and user-private-access-key values at `backend.ts:63`, including for cached reads.

`backend-cached.ts:34` and `backend-cached.ts:60` pass that redacted representation to text pagination. `backend-search.ts:19` redacts title and content before inserting into the transient FTS index, before either SQL excerpt operation. Metadata, forum posts, announcements, page bodies, calendar data, grades, participant names, and planner text use the same context redactor. Final envelope redaction remains in place. Page bindings also hash the redacted contents, so a changed representation invalidates a prior cursor.

The original tests used a synthetic 32-hex token and `WS-Q7a` across the 1,000-character boundary in converted files and module descriptions. Concatenated pages contained `[redacted]`, never the secret, and prefix search returned no hits. The independent probe used `Q7a-N4x` at offset 997, plus section and module names with 298 leading spaces. The resulting metadata contained no `Q7` fragment, joined file pages contained the replacement marker, and `search_content({query:'Q7a'})` returned an empty list. These checks exercise complete fields, not strings already shortened by a test fixture.

### B. Newly known secrets invalidate execution

`engine.ts:59` accepts a write payload only when redaction leaves its serialized value unchanged. The engine checks before admission, after preparation when constructing consent at `engine.ts:233`, and through the live execution callback at `engine.ts:240`. `BackendContext.recheck` invokes that callback. The backend constructs an execution context before a local write, and remote dispatch invokes it again after token loading and queue waits. `runtime.ts:41` forwards both the AbortSignal and authorization callback.

The first-write regression starts with an empty loaded-secret set and a stored short opaque secret. It rejects the request before creating a proposal. The pending-proposal regression discovers the secret through another cached read, then rejects the approved original payload without writing a task. A pending card's displayed text can become redacted as knowledge grows. That card cannot authorize an effect using the original now-sensitive text.

The independent remote probe proposed `My own Q7a-N4x essay.` while a different fake token was stored. After the assignment-status response, it replaced the stored token with `Q7a-N4x`. The next client's `onSecrets` callback learned that value. The result was `INVALID_ARGUMENT`. The only requests were module validation, assignment metadata, and submission status. Neither save nor final submit reached the transport. A positive control with unchanged plain text saved exactly that text, submitted once, and rejected approval-ID replay.

### C. Expiry stops all later assignment requests

The execution callback reauthorizes the grant at each backend check. `backend-writes.ts:89` rechecks immediately after saving. `backend-remote.ts:34` passes a recheck to `MoodleService.mcpClient`. `moodle/client.ts:112` invokes it inside `performCall`, after scheduler waits and immediately before entering the HTTP transport. There is no asynchronous wait between that check and the transport call. The optional language retry also re-enters `performCall`; MCP mutation calls disable that retry.

The existing regression holds the save response until after a real two-second grant deadline and observes `EXPIRED`. The independent probe advances the engine's authorization clock to the grant's exact expiry during the injected save response. Its complete transport sequence was:

```text
core_course_get_course_module
mod_assign_get_assignments
mod_assign_get_submission_status
mod_assign_save_submission
```

The call returned `EXPIRED`. There were no later validation reads or final submission request. Expiry is enforced at boundaries. A request already dispatched can finish; this review does not claim that expiry recalls it or immediately aborts it.

### D. Disconnect invalidates captured clients before asynchronous cleanup

`moodle/service.ts:139` marks the account disconnecting and advances its MCP generation before awaiting token access or pending work. `mcpClient` captures the generation at `service.ts:310`. Its live check rejects service shutdown, disconnect in progress, a different generation, or a missing/disconnected account. `service.ts:319` installs that check at the actual client dispatch boundary.

The existing engine/backend regression fills all six shared scheduler slots after module validation. It queues an approved completion, disconnects the real fixture account, then releases the slots. The HTTP mock receives only the preceding module read. The completion log records `requests:0`.

The independent probe queued a captured client's completion behind six gated jobs. It disconnected the account, restored the same account ID and capabilities with a new fake token, and released the queue. The stale call rejected with `kind:'auth'`, with no HTTP invocation. A newly created client then read an empty fixture calendar successfully. Reconnection therefore does not make the old captured client live again.

## Windows client review

This section separates source properties and Mac-hosted fixtures from Windows execution.

`apps/mcp/src/connection.ts:45` selects `createWindowsPipeConnector()` by default. It checks the local SID-derived namespace and rejects an attested SID mismatch by destroying the returned stream. It does not call bare Node `createConnection` on the Windows branch. Native failure propagates as a fixed error; it does not select Unix, TCP, or an unchecked pipe.

`windows-pipe-script.ts:10` creates one `NamedPipeClientStream` to local server `.` with `ReadWrite | ReadPermissions`, `Asynchronous`, `Identification`, and a non-inheritable handle. It connects, queries security on that stream, then relays on the same stream. There is no verification-then-reconnection step.

At `windows-pipe-script.ts:14`, the script requires the current SID as owner and a protected DACL. It checks the binary descriptor, rather than accepting a filtered list of rules. The DACL must contain exactly two non-callback `CommonAce` entries with no ACE flags:

1. Network SID `S-1-5-2`, `AccessDenied`, exact `FullControl` mask.
2. Current user SID, `AccessAllowed`, exact `FullControl` mask.

Missing, extra, reordered, inherited, callback, foreign-SID, or different-mask entries cannot satisfy those comparisons. Null or unreadable descriptors fail through the fixed-error path. This matches P's supplied owner and protected-DACL contract at source level. P's actual server and private app-state composition are not present here and were not certified.

The helper opens standard input only after all checks at `windows-pipe-script.ts:24`. It writes an ASCII readiness header directly to the output byte stream, then uses `CopyToAsync` in both directions. It does not turn pipe payloads into PowerShell strings. `windows-pipe.ts:61` checks the header as bytes and pushes any coalesced response bytes back before constructing the duplex stream.

`BridgeClient.authenticate` awaits `connect()` before calling `credentials.identity()` at `bridge.ts:78`. Both an existing fixture and the independent default-connector probe observed no identity read and no client write on authentication failure. The default-connector probe mocked process creation, supplied a synthetic current SID, left `authenticatedPipe` unset, delivered a foreign readiness SID, and observed `DENIED`, process cleanup, no fallback, and no launch attempt. No real credential file was opened. This ordering claim concerns the normal stdio connection path. Explicit administrative `doctor` and `reset` can inspect local grant files offline; `doctor.ts` does not send a bearer when its verified wire is unavailable.

The connector destroys all three process streams and kills the relay on readiness failure, timeout, process/stdio errors, cancellation, or duplex destruction. The PowerShell script disposes its pipe in `finally` when either copy task finishes or setup fails. Production `Wire` also closes on readable EOF and destroys the duplex. Existing tests passed fragmented readiness, coalesced binary response bytes including `0xff` and `0x80`, final-response drain, wrong SID, bad or excessive headers, fixed exit mapping, timeout, abort during opening and forwarding, and client closure. Independent probes covered errors on each stdio stream in opening and connected states, plus remote EOF through the actual `Wire` wrapper.

An initial disposable EOF check expected a raw half-open duplex to destroy itself after readable EOF. That is not the production consumer's behavior. The corrected test exercised `Wire`, whose EOF handler closes the duplex and kills the relay, and passed. No production cleanup defect is claimed from the raw-stream experiment.

### Official API compatibility evidence

The following checks used Microsoft documentation and Microsoft Framework reference source on 2026-11-06. They establish API availability and intended semantics, not successful Windows execution.

- Windows PowerShell 5.1 Desktop runs on .NET Framework. The launcher chooses `WindowsPowerShell/v1.0/powershell.exe`, uses no profile or interactive shell, and supplies a constant command encoded as UTF-16LE Base64. Microsoft documents those flags and encoding in [PowerShell editions](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_powershell_editions?view=powershell-7.5) and [powershell.exe](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_powershell_exe?view=powershell-5.1). The [class syntax reference](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_classes?view=powershell-5.1) documents `::new`.
- The six-argument access-rights constructor is documented for .NET Framework. It includes impersonation and inheritability parameters and derives duplex direction from read/write rights. [NamedPipeClientStream constructors](https://learn.microsoft.com/en-us/dotnet/api/system.io.pipes.namedpipeclientstream.-ctor?view=netframework-4.8.1).
- `GetAccessControl()` is a Framework `PipeStream` instance method returning the current stream's `PipeSecurity`. `ReadPermissions` authorizes security-rule reads; `FullControl` is mask `2032031`. [GetAccessControl](https://learn.microsoft.com/en-us/dotnet/api/system.io.pipes.pipestream.getaccesscontrol?view=netframework-4.8.1), [PipeAccessRights](https://learn.microsoft.com/en-us/dotnet/api/system.io.pipes.pipeaccessrights?view=netframework-4.8.1).
- Microsoft Framework reference source retains `Synchronize` when constructing a **FullControl deny**. The broader enum documentation's deny normalization must not be interpreted as removing that bit in this case. P's `PipeAccessRule(FullControl,Deny)` therefore matches the client's exact FullControl comparison at source level. [Framework PipeSecurity.cs, AccessMaskFromRights](https://raw.githubusercontent.com/microsoft/referencesource/main/System.Core/System/IO/Pipes/PipeSecurity.cs).
- Framework supports the binary descriptor constructor and raw common ACE properties used here. These permit checking count, order, flags, qualifier, SID, callback status, and mask. [RawSecurityDescriptor](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.rawsecuritydescriptor?view=netframework-4.8.1), [CommonAce](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.commonace?view=net-10.0). The latter reference lists Framework availability too.
- Identification permits server-side identity and privilege checks without client impersonation. It is the explicitly requested level, not the default constructor's level. [TokenImpersonationLevel](https://learn.microsoft.com/en-us/dotnet/api/system.security.principal.tokenimpersonationlevel?view=netframework-4.8.1).
- The byte-stream and task APIs are Framework APIs. They support the chosen binary relay and completion wait. [Console.OpenStandardOutput](https://learn.microsoft.com/en-us/dotnet/api/system.console.openstandardoutput?view=netframework-4.8.1), [Stream.CopyToAsync](https://learn.microsoft.com/en-us/dotnet/api/system.io.stream.copytoasync?view=netframework-4.8.1), [Task.WaitAny](https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.task.waitany?view=netframework-4.8.1).

## Remaining correctness issue

### R1. Low. The nominal 95-second retry deadline is not a hard deadline

**Location.** `apps/mcp/src/bridge.ts:121`, `bridge.ts:122`, and `bridge.ts:126`, with the per-attempt readiness timer at `apps/mcp/src/windows-pipe.ts:56`.

The loop checks its deadline before sleeping. It can start a connection after that sleep has crossed the deadline. A connection attempt also receives its own 30-second readiness timeout, independent of the remaining overall budget. This affects startup latency, not authentication or write replay. A separate cold-start probe accepted a fixture connection at 92 seconds after launch, so P's stated 90-second cold compilation allowance fits the intended retry window. Actual P compilation was not run.

**Benign reproducer.** In a disposable MCP test, fake the clock at `2026-11-06T01:00:00Z`. Mock `node:timers/promises.setTimeout` with an abort-aware Promise backed by the global `setTimeout`, so Vitest advances both the clock and backoff timers. Construct `BridgeClient` with the default Windows backoffs, a no-op launcher, a synthetic SID, and an `authenticatedPipe` fixture that records `Date.now()` then throws an error with `code:'ENOENT'`. Spy on `Credentials.identity` without supplying a real path or identity. Call `create_task` with an ordinary local task to use the single write attempt. Advance 96,000 ms.

Observed relative connector start times were `0, 2000, 4000, ... 96000`, 49 calls. The result was `DISCONNECTED`, and the identity spy was untouched. The final attempt started one second after the nominal deadline. Source inspection further implies that a slow last helper can outlive that deadline by its remaining backoff and readiness timeout. That longer overrun was not measured on Windows.

If 95 seconds is intended as a strict ceiling, recheck after the wait and bound the last attempt by the remaining deadline. Otherwise document this as a retry window plus an in-progress attempt. No implementation change was made during review.

## Other regression checks

The affected suites and source trace retained these controls:

- The fixed registry requires the right scope and account allowlist before preparation. Search additionally requires `read:files`. Resource reads map to those same scoped tools. Course, file, forum, quiz-owner, planner-relationship, and query/cursor checks reject foreign targets. Opaque engine cursors remain grant-bound, bounded, expiring, and invalid after restart.
- Every write still needs a main-owned, one-shot, 60-second proposal. The agent transport has no approval method. Revocation, grant editing, master-off, socket disconnect, and shutdown cancel operations and pending consent. Execution rechecks ownership. The positive assignment probe confirms the new checks still allow an unchanged authorized write.
- Output retains the untrusted envelope and fixed summary, provenance, inert text, stable references, size limits, and final secret scrub. Raw backend exceptions do not become public messages. Stored app grants contain hashes; synthetic identity files and installer checks use disposable homes.
- Quiz projection excludes questions and answers. The registry exposes no attempt execution or video-progress action. Completion rejects graded, automatic, unsupported, and uncertain activities. Assignment ownership, instance matching, plain-text constraints, statements, team workflows, and uncertain-write rejection remain covered. No academic-integrity bypass reproduced.
- Unix clients still require a private owned 0700 directory and 0600 socket with no symlink traversal. Main checks the accepted socket's kernel UID using the compiled FD3 helper before parsing. Wrong-UID fixtures, missing helpers, framing limits, socket lifecycle, and private-state tests passed. The real built CLI/core run also used that helper on macOS.

## Commands and observed outcomes

Commands ran with working directory `/Users/vc/.t3/worktrees/vstudy-pro/t3-fd008aec`. Host was Darwin arm64, Node `v24.19.0`, pnpm `10.28.2`. All Vitest invocations used a fork pool with two workers. The MCP test script already supplies those flags. The disposable tests used only existing harnesses, temporary SQLite stores, fake secrets, injected HTTP, relay streams, or controlled clocks.

| Command | Observed outcome |
| --- | --- |
| `pnpm install --frozen-lockfile --ignore-scripts` | Passed. Lockfile unchanged; no lifecycle scripts. |
| `node /Users/vc/.t3/worktrees/vstudy-pro/t3-fd008aec/apps/desktop/scripts/generate-locales.mjs` | Passed. Ignored locale registry generated. |
| `pnpm --filter @vstudy/desktop exec vitest run src/main/mcp src/main/ipc/mcp.test.ts src/renderer/settings/agents --pool=forks --maxWorkers=2` | 28 files, 231 tests passed. |
| `pnpm --filter @vstudy/mcp test` | Built CLI and installer. 12 files and 121 tests passed. One native Windows file containing two tests skipped. |
| `pnpm --filter @vstudy/mcp verify:core` | Passed against the freshly built CLI, official SDK, real main engine, native Unix helper, and synthetic backend. Verified 27 schemas, pairing, opaque cursors, eight queued reads, approved write, restart, disabled access, doctor grant checks, and explicit reset with fresh consent. This is not the real Moodle backend or Electron acceptance. |
| `pnpm --filter @vstudy/desktop exec vitest run src/main/mcp/security-recheck-disposable.test.ts src/main/mcp/backend-security.test.ts --pool=forks --maxWorkers=2 --reporter=verbose` | Two files, 11 tests passed. Six existing regressions plus five independent probes described above. |
| `pnpm --filter @vstudy/mcp exec vitest run test/security-recheck-disposable.test.ts --pool=forks --maxWorkers=2 --reporter=verbose` | Final run passed all seven disposable tests, including R1's observed timing and the 92-second cold-start control. |
| `pnpm --filter @vstudy/desktop exec vitest run src/main/moodle/service.test.ts src/main/moodle/client.test.ts src/main/moodle/scheduler.test.ts src/main/cache --pool=forks --maxWorkers=2` | Five files, 72 tests passed. Injected transport and local cache fixtures only. |
| `pnpm --filter @vstudy/mcp typecheck` | Passed. |
| `pnpm --filter @vstudy/desktop typecheck` | Passed. |
| `pnpm --filter @vstudy/mcp lint` | Passed. |
| `pnpm --filter @vstudy/desktop lint` | Exit 0, with three existing `no-open-external-with-dynamic-url` warnings in IPC, SSO protocol, and webview code. |
| `pnpm --filter @vstudy/desktop exec node /Users/vc/.t3/worktrees/vstudy-pro/t3-fd008aec/apps/desktop/scripts/security-lint.mjs` | Passed. |
| `git diff --check b0c6a5d` | Passed before the report. |
| `git status --porcelain=v1 --untracked-files=all`, `git diff --exit-code b0c6a5d`, `git diff --cached --exit-code` | Empty and exit 0 after disposable-test removal, before this report. |

The initial disposable MCP run passed four cases and failed two reviewer assumptions. The EOF test needed the production `Wire` consumer as explained above. Native `node:timers/promises` backoffs did not advance with the fake clock, producing only two attempts; the corrected timer fixture advanced the actual intended wait sequence. Subsequent runs passed six tests, then all seven after the cold-start positive control was added. No product change was used to obtain those passes. Exploratory file searches also encountered absent guessed paths, and some Microsoft reference URLs required a different documented view or source path. Those attempts are not verification evidence.

## Could-not-run gaps and handback

- The two tests in `apps/mcp/test/windows-pipe-native.test.ts` explicitly skipped on macOS. Neither actual owner/DACL acceptance, unsafe-ACL rejection, SID identification, impersonation level, binary forwarding, nor PowerShell 5.1 execution was observed in the Windows kernel. Their source and the seven relay fixtures cannot replace that run. Native malformed-ACL variants beyond the supplied foreign-allow test also remain unexercised.
- No secondary-user login or real cross-user connection ran. Wrong-UID and foreign-SID fixtures are rejection evidence only. Same-user malware isolation is outside the documented threat model.
- P owns the named-pipe server, ACL-backed private app state, and platform composition. This repository's default main platform factory rejects Windows without that supplied adapter. Compatibility here is with P's stated contract, not an integrated Windows package result.
- No Electron, OS Keychain, live school, real credentials, actual global-client installation, actual client-configuration change, real school mutation, or external message was used. Parent owns Electron and final package acceptance. No full desktop build/package or full repository test run was attempted. The relevant security lint ran; aggregate `security:check` and its external dependency-audit step did not run.
- Prompt-injection fixtures establish the envelope, inert projection, and independent authorization. They do not establish that a real model follows the notice. Moodle-version fixtures do not establish live compatibility with every school.

Prove It Works led to the built CLI/core execution. Test Behavior, Not Implementation led to assertions on actual transport requests, task rows, returned bytes, and the production EOF consumer. Model the Domain kept the probes organized around grant, account-generation, and relay lifecycle states. The review ran entirely in-thread because the brief forbade children. The comment-review dispatch was skipped under that same constraint, and production comments were not changed. Deslop and technical-writing checks applied only to this report. Throughput checkpoint is not applicable to a read-only investigation.

The implementation HEAD remained `b0c6a5d7630ab48866c9e7f91f45a69e50fde8e5` throughout verification. Only this evidence document is staged for the review commit. The handback supplies the resulting commit SHA and the post-commit checkout status.
