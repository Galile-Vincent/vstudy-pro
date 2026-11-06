# Independent MCP security audit

The goal is to let global agents use VStudy's Moodle sign-in while school credentials stay in main, every action needs exact human consent, and assessment automation remains forbidden.

Reviewed implementation SHA `c451cacab667cc9fa4d875bd68023b15ed01f0f1`. The local `main` base and merge base were `b02238b379befa1011ff2928c4233d5ed3a1e1fb`. The review checkout was `/Users/vc/.t3/worktrees/vstudy-pro/t3-1a1a7cd0`, on `t3/moodle-mcp-security-review`. It started clean. Product files and existing tests remain unchanged. This report is the only committed addition.

**Verdict.** Four security failures reproduced. This is not a clean security verdict. No academic-integrity bypass reproduced within the checked tool registry and fixtures.

## Verified findings

### A. High. Text pagination exposes complete stored credentials in fragments

**Location.** `apps/desktop/src/main/mcp/backend-cached.ts:60`, `apps/desktop/src/main/mcp/backend-page.ts:68`, and `apps/desktop/src/main/mcp/engine.ts:245`.

**Prerequisites.** A paired agent has `read:files`. A granted, converted course file contains a stored school credential as plain text near a page boundary. The probe deliberately seeds that condition with a fake 32-hex token. This does not demonstrate reading a token directly from the secret store without matching course content.

**Probe and result.** Store fake token `0123456789abcdeffedcba9876543210`. Link a ready course document whose Markdown is `' '.repeat(984) + token + ' end'`. Call `read_file({fileId,limit:1})`, then repeat with its returned cursor. The first result ends with `0123456789abcdef`. The second starts with `fedcba9876543210`. Concatenation reconstructs the complete stored token. Both calls succeed without a school request, even though preparation has loaded the token into the redactor.

The backend slices the original text before the final redactor sees it. Neither 16-character fragment matches the known whole secret or the 32-hex heuristic. Redact complete text before pagination and other excerpt boundaries, and paginate that redacted representation.

### B. Medium. The first write can execute text different from its consent payload

**Location.** `apps/desktop/src/main/mcp/engine.ts:183` and `apps/desktop/src/main/mcp/engine.ts:228`, with secret loading at `apps/desktop/src/main/mcp/backend.ts:62`.

**Prerequisites.** A valid write grant, human approval, and a stored secret not recognized by format heuristics. The backend's secret set has not loaded that value yet. Short opaque secrets are accepted by `apps/desktop/src/main/moodle/auth.ts:8`. The probe does not establish this condition for a conventional 32-hex Moodle token, which the heuristic already rejects.

**Probe and result.** Before any read, store fake secret `WS-Q7a` and propose `create_task` with title `Study WS-Q7a`. The initial exact-payload check passes with an empty secret snapshot. Preparation loads the secret. Consent now contains title `Study [redacted]`. Approve that proposal. The call succeeds and SQLite contains `Study WS-Q7a`. Repeating the same request after the snapshot is warm returns `INVALID_ARGUMENT`.

The engine never repeats its unchanged-payload check after preparation. Recheck against the loaded secrets before consent and preserve that exact relationship through execution. The observed sink was a local task. The common engine ordering also applies to remote writes, but remote publication of this canary was not probed.

### C. Medium. Grant expiry does not stop later assignment mutations

**Location.** `apps/desktop/src/main/mcp/engine.ts:208` and `apps/desktop/src/main/mcp/engine.ts:234`, and `apps/desktop/src/main/mcp/backend-writes.ts:93`.

**Prerequisites.** A high-risk grant close to expiry, an eligible text assignment, and approval while the grant is valid. Expiry occurs during an earlier school request in the same action.

**Probe and result.** Set the grant expiry two seconds ahead. Approve an assignment submission. Hold the fake `mod_assign_save_submission` response until 25 ms after expiry, using real elapsed time. After expiry, the backend sends fresh module, assignment, and status reads, followed by `mod_assign_submit_for_grading`. Only after that submission does the engine return `EXPIRED`.

The operation timer covers 120 seconds, not the grant deadline. Backend rechecks inspect the account and AbortSignal, not grant expiry. Bind operation cancellation to expiry and enforce authorization before each later remote dispatch. This finding concerns a new mutation sent after expiry, not an already-dispatched mutation finishing late.

### D. Medium. School disconnect does not cancel a mutation queued in the shared scheduler

**Location.** `apps/desktop/src/main/moodle/service.ts:309` and `apps/desktop/src/main/mcp/backend-remote.ts:34`. The queued dispatch enters `apps/desktop/src/main/moodle/client.ts:109`, then `apps/desktop/src/main/moodle/client.ts:114`.

**Prerequisites.** An approved Moodle write waits behind work in the six-slot service scheduler. The student disconnects that school before the queued request starts. The agent connection and grant remain open.

**Probe and result.** Approve `mark_module_complete` for the eligible ungraded fixture resource. After its module validation, hold all six scheduler slots with disposable gated jobs. Wait until the completion mutation is queued. Call the real `MoodleService.disconnect(accountA)` and verify the account is absent. Release the jobs. The injected transport receives `core_completion_update_activity_completion_status_manually` after disconnect, with `signal.aborted === false`. The call later returns `NOT_FOUND`.

`mcpClient` captures the school token before the scheduler wait. The service has no account-generation check at actual dispatch and disconnect does not abort these MCP clients. Fence queued requests with the current account generation or account cancellation signal at dispatch. Grant revoke and agent-socket disconnect have separate cancellation paths and are not the failing path in this probe.

## Attacks and observed controls

The source review covered the full `main...c451cac` implementation change, including main MCP, IPC and lifecycle composition, MoodleService additions, renderer consent and settings, stdio source, installer and plugin assets, native helper, and build and release wiring. The two supplied briefs, both MCP documents, and all three fixed contracts were read. Scope remained security only.

The controlled attacks exercised these properties.

- Foreign course and file IDs, converted documents, planner relationships, search, resource-to-tool mapping, and forged or cross-tool cursors. Independent control E denied the attempted escapes against the real backend. Existing suites also exercised mixed-account plans, extra search scope, cross-grant cursors, and current ownership rechecks.
- Missing approval, one-shot replay, 60-second expiry, grant expiry, revoke, grant edits, master-off, disconnect, queued work, and cancellation between assignment save and submit. Existing suites passed their rejection cases. Probes B, C, and D found the narrower failures above.
- Malicious page, announcement, forum, and converted-document instructions and active markup. Independent control F retained the untrusted envelope and inert instruction text, removed active HTML, remote links, and the known canary, and produced no proposal. This does not test whether a real model obeys the envelope.
- Arbitrary WS functions, URLs, paths, and quiz execution. Strict registry and argument tests rejected these. Completion tests rejected graded, automatic, missing-evidence, quiz, assignment, video, H5P, and unknown kinds. Assignment tests rejected unsupported statements, team workflows, foreign instances, and uncertain retries.
- Credential, exception, log, configuration, and backup paths. Tests checked first cached reads, expired sessions, fixed errors, bearer-free output and grant hashes, private client files, private backups, entry-only diffs, symlinks, duplicate keys, and installer conflicts. Source inspection confirmed the portable backup allowlist excludes MCP state and client credentials. Findings A and B limit the redaction guarantee.
- Real same-UID Unix sockets and the compiled FD3 helper. Independent control G reached the engine with the native verifier, received `UNPAIRED` for an unknown bearer, and had an approval RPC rejected by socket closure. Existing tests checked 0700/0600 modes, malformed frames, bounds, missing helpers, restart, and simulated wrong UID.
- Windows default and interface boundaries. Portable tests verified `UNSUPPORTED` without the authenticated connector, no bare Node connection, SID namespace checks, and stream destruction on a mismatched attested SID. These are Mac-hosted fixtures, not native SID authentication or ACL acceptance.

## Commands and evidence

Host was macOS arm64 with Node `v24.19.0` and pnpm `10.28.2`. All school responses were injected fixtures. No real school, user client configuration, real secret, external message, or Electron process was used. No children were started. Throughput checkpoint was not applicable to this read-only investigation.

Evidence directory is `/private/tmp/vstudy-mcp-security-c451cac.9mIuSC`.

| Command from checkout root | Observed result | Evidence file |
| --- | --- | --- |
| `pnpm install --frozen-lockfile --ignore-scripts` | Dependencies installed in this checkout | No product diff |
| `node apps/desktop/scripts/generate-locales.mjs` | Generated ignored locale registry | No tracked change |
| `pnpm --filter @vstudy/desktop exec vitest run src/main/mcp src/main/ipc/mcp.test.ts src/renderer/settings/agents --pool=forks --maxWorkers=2` | 27 files, 225 tests passed | `desktop-tests.log` |
| `pnpm --filter @vstudy/mcp exec vitest run --pool=forks --maxWorkers=2` | 11 files, 108 tests passed, including bundled stdio and isolated installer homes | `mcp-tests.log` |
| `pnpm --filter @vstudy/mcp verify:core` | Real core engine, native helper, bundled CLI, and official SDK fixture passed | `core-sdk.log` |
| `pnpm --filter @vstudy/desktop exec vitest run src/main/mcp/security-audit-disposable.test.ts --pool=forks --maxWorkers=2 --reporter=verbose --silent=false` | Four exploit probes and three negative controls passed their assertions | `probes.log` |
| `git diff --check main...c451cac` | Passed | No whitespace errors |
| `git status --porcelain`, `git diff --exit-code`, `git diff --cached --exit-code` after probe removal | Empty and successful | Product checkout clean before adding this report |

The runnable disposable test is preserved in that evidence directory. To reproduce, copy it to `apps/desktop/src/main/mcp/security-audit-disposable.test.ts`, run the exact probe command above at the reviewed SHA, then remove that temporary copy. It imports the existing fake backend harness and native socket fixture. No implementation or existing test needs editing.

Initial setup attempts failed because the locale registry was absent and because the MCP test script already supplied the pool flags. The recorded successful commands above corrected those invocation issues. Probe development also corrected an incorrectly counted fake token and a numeric-string fixture ID. Final probe assertions all passed. Passing rejection tests do not establish absence of vulnerabilities.

## Conditional concerns

No additional actionable conditional vulnerability is claimed beyond the explicit prerequisites of A through D. The Windows connector's truthful SID attestation and retained authenticated handle remain interface trust assumptions. Malicious same-user software can read that user's bearer files or modify processes, as the documented threat model acknowledges.

## Could-not-run gaps

- Native Windows host, same-handle server-SID verification, Identification impersonation, ACL execution, and packaging acceptance were not run. Stream P's actual host is outside this source.
- No secondary-user credentials were available. Simulated wrong-UID tests are not real secondary-user login acceptance. The native unpaired-socket control did not test memory or private-file isolation from the same UID.
- No Electron, OS Keychain, live-school, or real global-agent conversation acceptance ran. The owner retains packaged-from-source CLI and Electron acceptance. Source and fixture checks do not certify every school or client.
- Already-dispatched Moodle effects cannot be recalled. The findings distinguish those effects from later requests sent after expiry or school disconnect. No real Moodle mutation was performed, so a school's final acceptance of the observed requests remains untested.

Boundary Discipline directed the trace to parsing and actual remote dispatch. Prove It Works required executable probes through the real engine, backend, scheduler, and native socket helper. All work ran in-thread because the review brief forbade children.
