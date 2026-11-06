# MCP integration verification

The goal is to let global agents read any Moodle school connected to VStudy and propose exact student-approved actions through the app's session. School credentials stay in main. This report separates fixture acceptance, installed client parsing, and platform gaps.

## Reviewed implementation and decisions

The implementation is integrated on `t3/mcp`. Main was merged at `087318b`, `b0c6a5d`, `4db6a12`, `e8945e1` and `22712b3`. The last three include butterfly branding from `0d990b2`, guided AI CLI setup from `f1fcac3` and native-helper preparation fixes through `9fa6d44`. README picture lockups, website branding, app icons and CLI setup are preserved alongside MCP resources and the assisted per-user Windows installer.

The first audit reviewed `c451cac` and found four failures. Commit `ff6d4f8` fixes them, and `36a8cbe` supplies the production Windows client. The independent recheck confirmed A-D fixed at `b0c6a5d`. A narrow review then verified the deadline fix `9e7cb80` at `4db6a12`.

Final MCP product commit `95168df` includes versioned NSIS discovery and its configured uninstaller-icon layout. The discovery review reproduced the icon-only custom-path gap, and the final independent 102-case replay confirmed its fix with no remaining scoped defect. Merge `e8945e1` preserves MCP and C's root UI/IPC composition, NSIS settings and native terminal resources. Commit `95a4205` supplies the new typed CLI inventory response in the existing App test fixture. The final commit changes only documentation and guide records.

The final package contains that code and the butterfly brand. Official SDK/Electron acceptance passed all five groups using its actual CLI and native verifier. Separate packaged-binary fuse probes also passed. All owned Electron processes exited.

The [design](../../MCP_DESIGN.md) records the openape investigation, fixed shared shapes, academic policy, account selection, per-call approvals, private transport, and platform boundaries. Openape was inspected at `40d4e4d1da1f30a1747f4d8d7817978d3e5b0ace`; no code was copied.

Integration found and fixed missing execution cancellation, URI redaction that broke stable references, first cached reads that lacked known-secret redaction, and ambiguous course-panel cache state. Assignment submission accepts the student's own plain text with a separate in-app acknowledgement. File submission is deferred. Payloads altered by redaction are rejected rather than silently changed.

## Commands and results

| Command | Result on this Mac |
| --- | --- |
| `pnpm typecheck` | Passed MCP, desktop, and website; Astro reported no errors or warnings. |
| `pnpm security:check` | Passed 130 MCP tests with two native Windows skips and 1,377 desktop tests with 14 skips after the final main merge. Lint and static checks passed against the accepted advisory baseline. |
| `pnpm knip` | Passed; one existing CSS configuration hint remains. |
| `pnpm build` | Passed, including MCP bundle and native Unix verifier before Electron. |
| `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package` | Passed; built the local ad-hoc-signed arm64 app and `VStudy-Pro-0.2.2-arm64.dmg`. No Developer ID or notarization claim. |
| `pnpm --filter @vstudy/mcp verify:core` | Passed freshly built CLI, official SDK, main engine, native UID helper, and synthetic backend. |
| `pnpm --filter @vstudy/mcp verify` | Passed CLI, installer, ACL bundle, and all five client asset packages. Native plugin CLI copies match. |
| `pnpm --filter @vstudy/mcp verify:package` | Passed actual app resources and executable Unix helper outside ASAR. |
| `pnpm --filter @vstudy/mcp verify:clients` | Passed available installed client readers in isolated homes; no conversation started. |
| `claude plugin validate --strict apps/mcp/plugins/claude` | Passed; marketplace license/icon/install-advice metadata remains outside publication scope. |
| `agy plugin validate --strict apps/mcp/plugins/agy` | Passed with a generic-icon note. |
| Packaged CLI and helper through `apps/desktop/e2e/mcp.mjs` | Passed official SDK input/output schemas, real product IPC/services, consent UI, and loopback Moodle requests. |
| `pnpm --filter @vstudy/website build` and `verify:static` | Passed 52 pages and 2,661 generated links. The three MCP routes have correct article languages and all 27 English tool names; getting-started remains the default guide. |
| `node scripts/check-readme-links.mjs` | Passed 152 local Markdown links across the three READMEs and docs index. |
| Desktop `pnpm package:verify` | Passed actual packaged binary RunAsNode and inspector probes. Neither probe enabled Node execution or an inspector listener. |

Every Vitest invocation used `--pool=forks --maxWorkers=2`. One initial manual SDK test command passed these flags twice and was rejected before tests ran; the corrected package script passed with its built-in limits. Inventory was checked before source and packaged runs, and all owned instances closed afterward. Another stream launched an Electron during the first post-fix fuse stage despite the clear initial inventory and slot notice. No foreign process was killed. The final fuse-only rerun passed after a fresh clear inventory; inventory was clear again afterward. All own processes exited, and the GUI slot was released.

The first post-C run found four App fixture failures because the mocked `ai-cli:list` response was not an array, plus ten native PTY failures. Commit `95a4205` fixes the mock without changing product behavior. The fresh local `node-pty@1.1.0` prebuilt `spawn-helper` had mode 0644; a normal filtered rebuild retained it. Preparing it with `npm_config_build_from_source=true pnpm --filter @vstudy/desktop rebuild node-pty` supplied a working executable helper. All 23 affected tests and the subsequent full suite passed. The observation was relayed to the coordinator. Main then added confined install/build/runtime helper preparation in `bc183bb` and `9fa6d44`; merge `22712b3` includes those fixes. No extra MCP workaround remains.

The first post-C acceptance recipe stopped before launching Electron because the new OpenPGP dependency imports the unprefixed `module` builtin. The fixture now externalizes all Node builtin names and the native `node-pty` dependency, matching the app's native-module boundary. Commit `6702d16` changes only the acceptance build, with no product or packaged artifact change. All five acceptance groups passed afterward against the final packaged CLI and helper.

## Security behavior exercised

| Property | Evidence |
| --- | --- |
| Default-off, socket-bound pairing, independent grants and selected accounts | `engine.test.ts`, real-socket `bridge.test.ts`, and Electron pairing with one of two accounts selected. |
| Scope and account isolation, including files, search, planner references and cursors | `engine.test.ts`, backend cache/remote tests, authenticated pagination tests, and actual SDK denials. |
| Every write requires exact one-shot consent; no approval RPC on the bridge | `approvals.test.ts`, `main/ipc/mcp.test.ts`, and deferred planner writes in Electron. |
| Revoke/off/edit/disconnect/expiry stop queued or pending effects | Approval, limits, runtime, and backend cancellation tests, including live expiry during assignment saving and a school disconnect while a completion waits behind all six scheduler slots. Already-dispatched writes remain uncertain. |
| School secrets and URLs do not enter results, consent or retained activity | `redaction.test.ts`, `backend-redaction.test.ts`, URI tests, and packaged SDK canary checks. The first cached read includes expired-session and other-account secret canaries. The audit regressions also check complete redaction before file/module pagination and search excerpts, plus first and pending approval payloads when new secrets become known. |
| Hostile page, announcement and forum text stays untrusted data | Real MoodleClient fixture POSTs return malicious instructions; results retain the untrusted notice, create no proposals or submissions, and remove active markup and protected data. |
| Academic guardrail | Completion/write tests reject quiz, assignment, video, H5P, automatic or unknown graded completion. Quiz info exposes metadata and attempt state only. Electron blocks quiz completion. |
| Private Unix transport and bounded protocol | Real FD-3 native UID helper, wrong-UID rejection, permissions, symlinks, stale locks, malformed UTF-8, 1 MiB frame bound, concurrency, timeouts and restart tests. |
| No cross-account or arbitrary-path file access | Ready converted documents must be linked to an accessible module in the selected account. `read_file` takes a local file UUID, never an agent path. |
| School credentials remain outside the stdio package | Package boundary tests prohibit school-network and credential-store imports; all school POSTs originate in main through its existing client. |
| Windows client fails closed | The default production connector verifies the owner and exact protected DACL on its retained handle at Identification impersonation. Portable tests cover byte withholding, malformed attestations, final response draining, fixed errors, timeout, cancellation, cleanup, and startup beyond 90 seconds. Two kernel tests skip on Mac and require Windows CI. |

Tests establish these observed behaviors, not absence of vulnerabilities. The [first audit](security-audit.md) remains a historical record of four failures. [Security fixes](security-fixes.md) maps each to its regression. The [independent recheck](security-recheck.md) confirmed A-D fixed and reproduced no security blocker. Its low deadline issue is fixed, and the [narrow deadline review](security-deadline-recheck.md) passed with 17 independent probes, including real relay-process exit and timer cleanup. One initial review request was content-flagged without a verdict; the fresh replacement ran on the requested model and priority. The [installer-discovery review](windows-discovery-recheck.md) found a pre-existing P2 icon-layout mismatch. Commit `95168df` handles the exact NSIS icon filename and validates the neighboring executable; the [configured-icon recheck](windows-icon-discovery-recheck.md) passed 102 synthetic checks, the 130-test package suite and the actual built CLI/core fixture. Native Windows remains unverified.

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
| Packaged and standalone MCP CLI | `b0da74f4bc2642490ca08d9f1e503c5171437405e0788dfc827c9265981a2802` |
| Installer bundle | `9555dc4afb6bc3b6ecc0b5602b91357a4a9aa5900214e257b394cf3d93219b30` |
| Windows ACL bundle | `b1e0ab7ccdb2e6d68d997a9f9350aefd6c816857c3a7c7abecccf7ce0c2e169f` |
| Packaged native Unix verifier | `947d9293aa62c6ca03979e9dbb44fd2b4e732c98d415d12599a013f697118ae5` |

Acceptance used `VSTUDY_MCP_TEST_BIN` and `VSTUDY_MCP_PEER_HELPER` pointing into the actual built app's `Contents/Resources`. The Electron fixture bootstraps the real product IPC, backend, store, preload and renderer with a loopback school transport. The separate fuse probes launch the actual packaged Electron binary. This is not live-school acceptance.

The [delegation ledger](delegation.md) records all worker models, results, integration commits, and source threads.

## Platform handoff and limits

Framing is four unsigned big-endian bytes containing the UTF-8 JSON body length, followed by that many bytes. Zero is invalid. Maximum body size is **1,048,576 bytes**, excluding the header. UTF-8 is strict and JSON-RPC is 2.0. The [main subsystem contract](../../../apps/desktop/src/main/mcp/README.md) names the transport, state and lifecycle seams.

Windows uses `%APPDATA%\@vstudy\desktop` and `\\.\pipe\vstudy-<32-hex SID hash>`. Stream M supplies the production PowerShell/.NET client by default through `createWindowsPipeConnector`. It verifies the connected handle before reading a bearer, uses Identification impersonation, and retains the same handle. It uses built-in Framework APIs without client-side C# compilation. Stream P supplies the current-user-DACL server, app-state persistence and desktop wiring. The CLI allows 95 seconds after launch for P's 90-second ARM cold host budget; documented client timeout fields use 600 seconds on Windows. Full Windows operation still requires P's server integration. The launcher accepts the bare product name and the actual NSIS product-plus-version DisplayName, including prerelease/build versions. For the configured `uninstallerIcon.ico` DisplayIcon it validates the neighboring `VStudy Pro.exe`. It chooses HKCU uninstall metadata for custom paths, then `%LOCALAPPDATA%\Programs\VStudy Pro\VStudy Pro.exe`, then legacy HKLM metadata. It uses native argv with only `--mcp-background` and never interprets a registry command. No native Windows install, launch, ACL, pipe or secondary-user acceptance was performed on this Mac.

Unix-only fixture suites skip on Windows. Portable framing, engine, SID, configuration and Windows connection fixtures still run. Windows installer tests verify ACLs instead of mode bits. Native Windows CI must validate the remaining implementation. A malicious process already running as the same OS user is outside this isolation boundary.

The guided AI CLI setup API is available after merging Stream C. The optional Agents-wizard link remains deferred to avoid extending the reviewed consent and modal flow in this final pass. Its integration API is `openAiCliSetup(provider?: 'claude' | 'codex' | 'agy')` from `renderer/ai-cli/entry.ts`; file-only discovery uses `desktop.invoke('ai-cli:list', {})`. The existing sidebar and provider setup entry points remain available. No placeholder adapter was added.

P also owns the post-landing optional `McpTransport.closed: Promise<void>` lifecycle seam. Its runtime wiring will invalidate an unexpectedly closed host, disable access, report failure and permit a deliberate restart. This does not change the fixed frame format.

No live-school matrix was executed. Moodle 3.x, 4.x and 5.x fixtures use official response structures with synthetic values. Disabled services, school permissions, unsupported plugins, private networks and untrusted TLS remain connection limits. File-only assignments and unsupported submission statements/team workflows require Moodle. No MCP Inspector is installed offline; the official SDK Ajv validator checks schemas. No plugin marketplace publication is claimed.
