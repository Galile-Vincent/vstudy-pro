# MCP integration verification

The goal is to let global agents read any Moodle school connected to VStudy and propose exact student-approved actions through the app's session. School credentials stay in main. This report separates fixture acceptance, installed client parsing, and platform gaps.

## Reviewed implementation and decisions

The implementation was integrated on `t3/mcp`. Main was merged at `087318b`; the later pre-package merge check reported already up to date. Product code was frozen for the independent security audit at `c451cac`. A later recipe-only change, `d05a8c5`, lets acceptance select the packaged native verifier.

The [design](../../MCP_DESIGN.md) records the openape investigation, fixed shared shapes, academic policy, account selection, per-call approvals, private transport, and platform boundaries. Openape was inspected at `40d4e4d1da1f30a1747f4d8d7817978d3e5b0ace`; no code was copied.

Integration found and fixed missing execution cancellation, URI redaction that broke stable references, first cached reads that lacked known-secret redaction, and ambiguous course-panel cache state. Assignment submission accepts the student's own plain text with a separate in-app acknowledgement. File submission is deferred. Payloads altered by redaction are rejected rather than silently changed.

## Commands and results

| Command | Result on this Mac |
| --- | --- |
| `pnpm typecheck` | Passed MCP, desktop, and website; Astro reported no errors or warnings. |
| `pnpm security:check` | Passed 108 MCP tests and 1,252 desktop tests, with 14 desktop skips. Lint and static checks passed against the accepted advisory baseline. |
| `pnpm knip` | Passed; one existing CSS configuration hint remains. |
| `pnpm build` | Passed, including MCP bundle and native Unix verifier before Electron. |
| `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package` | Passed; built the local ad-hoc-signed arm64 app and `VStudy-Pro-0.2.2-arm64.dmg`. No Developer ID or notarization claim. |
| `pnpm --filter @vstudy/mcp verify` | Passed CLI, installer, ACL bundle, and all five client asset packages. Native plugin CLI copies match. |
| `pnpm --filter @vstudy/mcp verify:package` | Passed actual app resources and executable Unix helper outside ASAR. |
| `pnpm --filter @vstudy/mcp verify:clients` | Passed available installed client readers in isolated homes; no conversation started. |
| `claude plugin validate --strict apps/mcp/plugins/claude` | Passed; marketplace license/icon/install-advice metadata remains outside publication scope. |
| `agy plugin validate --strict apps/mcp/plugins/agy` | Passed with a generic-icon note. |
| Packaged CLI and helper through `apps/desktop/e2e/mcp.mjs` | Passed official SDK input/output schemas, real product IPC/services, consent UI, and loopback Moodle requests. |
| Desktop `pnpm package:verify` | Passed actual packaged binary RunAsNode and inspector probes. Neither probe enabled Node execution or an inspector listener. |

Every Vitest invocation used `--pool=forks --maxWorkers=2`. One initial manual SDK test command passed these flags twice and was rejected before tests ran; the corrected package script passed with its built-in limits. One Electron ran at a time. Inventory was checked before both source and packaged runs, and all owned instances closed afterward.

## Security behavior exercised

| Property | Evidence |
| --- | --- |
| Default-off, socket-bound pairing, independent grants and selected accounts | `engine.test.ts`, real-socket `bridge.test.ts`, and Electron pairing with one of two accounts selected. |
| Scope and account isolation, including files, search, planner references and cursors | `engine.test.ts`, backend cache/remote tests, authenticated pagination tests, and actual SDK denials. |
| Every write requires exact one-shot consent; no approval RPC on the bridge | `approvals.test.ts`, `main/ipc/mcp.test.ts`, and deferred planner writes in Electron. |
| Revoke/off/edit/disconnect/expiry stop queued or pending effects | Approval, limits, runtime, and backend cancellation tests, including abort between assignment save and submit. Already-dispatched writes remain uncertain. |
| School secrets and URLs do not enter results, consent or retained activity | `redaction.test.ts`, `backend-redaction.test.ts`, URI tests, and packaged SDK canary checks. The first cached read includes expired-session and other-account secret canaries. |
| Hostile page, announcement and forum text stays untrusted data | Real MoodleClient fixture POSTs return malicious instructions; results retain the untrusted notice, create no proposals or submissions, and remove active markup and protected data. |
| Academic guardrail | Completion/write tests reject quiz, assignment, video, H5P, automatic or unknown graded completion. Quiz info exposes metadata and attempt state only. Electron blocks quiz completion. |
| Private Unix transport and bounded protocol | Real FD-3 native UID helper, wrong-UID rejection, permissions, symlinks, stale locks, malformed UTF-8, 1 MiB frame bound, concurrency, timeouts and restart tests. |
| No cross-account or arbitrary-path file access | Ready converted documents must be linked to an accessible module in the selected account. `read_file` takes a local file UUID, never an agent path. |
| School credentials remain outside the stdio package | Package boundary tests prohibit school-network and credential-store imports; all school POSTs originate in main through its existing client. |
| Windows fails closed | Connection fixtures reject missing authentication and foreign server SIDs before bearer reads or frame writes. Actual Windows ACL and peer acceptance remain unverified. |

Tests establish these observed behaviors, not absence of vulnerabilities. The independent security audit result is recorded separately when complete.

## Actual client verification

| Client | Observed verification |
| --- | --- |
| Claude Code 2.1.318 | Native config reader accepted an installed entry in a disposable HOME; strict plugin validation passed. |
| Codex 0.167.0 | Native `mcp get vstudy --json` accepted the generated entry in a disposable HOME. Earlier child evidence also covered 0.166.0 `mcp add`. |
| Antigravity 1.4.12 | Native MCP manager accepted an isolated entry; strict plugin validation passed. |
| Claude Desktop | Not installed or detected at checked locations. Official documented format and isolated installer tests only. |
| Cursor | Not installed or detected at checked locations. Official documented format and isolated installer tests only. |

Actual global configs were not changed. Claude and Codex configs parsed without exposing contents. The existing agy file did not parse and was left untouched. No live AI conversation or real university was used. The official SDK acceptance client used the Codex identity label; this does not establish a live Codex-model conversation.

## Packaged artifacts

| Artifact | SHA-256 |
| --- | --- |
| Packaged and standalone MCP CLI | `1e248f4fbafc4013fe7534e20546e46ec76a3b61bddaedc4757567e18aecf902` |
| Installer bundle | `36b4ec776c7bda2d501d408dc5e7cbc0b5bd1a9b66b4c3dc35cddfe1cf60430b` |
| Windows ACL bundle | `b1e0ab7ccdb2e6d68d997a9f9350aefd6c816857c3a7c7abecccf7ce0c2e169f` |
| Packaged native Unix verifier | `cf4ae28c7d38b75ea6742163a6869f03cbab874eb34679600224ae5f7deca282` |

Acceptance used `VSTUDY_MCP_TEST_BIN` and `VSTUDY_MCP_PEER_HELPER` pointing into the actual built app's `Contents/Resources`. The Electron fixture bootstraps the real product IPC, backend, store, preload and renderer with a loopback school transport. The separate fuse probes launch the actual packaged Electron binary. This is not live-school acceptance.

## Platform handoff and limits

Framing is four unsigned big-endian bytes containing the UTF-8 JSON body length, followed by that many bytes. Zero is invalid. Maximum body size is **1,048,576 bytes**, excluding the header. UTF-8 is strict and JSON-RPC is 2.0. The [main subsystem contract](../../../apps/desktop/src/main/mcp/README.md) names the transport, state and lifecycle seams.

Windows uses `%APPDATA%\@vstudy\desktop` and `\\.\pipe\vstudy-<32-hex SID hash>`. Stream P must supply the current-user-DACL host, private state persistence and same-handle authenticated client connector. Default Windows CLI remains unavailable until wired. The launcher chooses HKCU uninstall metadata, then `%LOCALAPPDATA%\Programs\VStudy Pro\VStudy Pro.exe`, then legacy HKLM metadata. It uses native argv with only `--mcp-background` and never interprets a registry command. No native Windows install, launch, ACL, pipe or secondary-user acceptance was performed on this Mac.

Unix-only fixture suites skip on Windows. Portable framing, engine, SID, configuration and Windows connection fixtures still run. Windows installer tests verify ACLs instead of mode bits. Native Windows CI must validate the remaining implementation. A malicious process already running as the same OS user is outside this isolation boundary.

No live-school matrix was executed. Moodle 3.x, 4.x and 5.x fixtures use official response structures with synthetic values. Disabled services, school permissions, unsupported plugins, private networks and untrusted TLS remain connection limits. File-only assignments and unsupported submission statements/team workflows require Moodle. No MCP Inspector is installed offline; the official SDK Ajv validator checks schemas. No plugin marketplace publication is claimed.
