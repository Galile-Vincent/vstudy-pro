# MCP design

VStudy lets a student's global agent read their Moodle coursework and propose actions through the student's existing app session. Moodle credentials remain in Electron main. The stdio server receives a revocable local grant, never school credentials. Platform-specific launch and client configuration live behind adapters.

## Grounding and openape investigation

Investigated [openape](https://github.com/MO7YW4NG/openape) at commit `40d4e4d1da1f30a1747f4d8d7817978d3e5b0ace`, cloned outside this repository to `/private/tmp/vstudy-mcp-openape`. No source or prose is copied.

Openape offers courses, progress, syllabus, materials, pages, videos, assignments, grades, forums, announcements, calendar export, uploads, and agent skills. Its browser login supports stored OS credentials and persistent browser sessions. The local openape skill warns that course text is untrusted and asks agents to confirm writes. These are useful instructions, but the executable must enforce authorization too.

Observed problems and decisions follow.

| Evidence in openape | Risk or rough edge | VStudy decision |
| --- | --- | --- |
| `src/config.rs:3` fixes the default URL to CYCU | School-specific assumptions do not establish universal compatibility | Reuse canonical school roots, account IDs, discovery, and function capabilities |
| `src/commands/auth.rs:192,196,264,284` prints token prefixes | CLI output enters agent transcripts and logs | Never return any school token, including prefixes |
| `src/auth/token.rs:6,25` serializes the WS token to session metadata | A separate CLI owns another credential lifecycle | Keep school secrets in the existing main-only encrypted store |
| `src/auth/browser.rs:255` exports browser cookies to HTTP requests | More components can handle school credentials | No cookie extraction or webview scraping in MCP |
| `src/commands/videos.rs:439,461` sends full-duration progress and completion | A script can claim the student watched a graded activity | No autoplay, synthetic progress, or graded completion tools |
| `src/commands/quizzes.rs` starts, reads questions, saves answers, and submits attempts | Agent permission instructions do not enforce academic integrity | Quiz metadata, attempts, grades, and deadlines only |
| `src/moodle/seb.rs` computes SEB configuration keys | Assessment restrictions become an automation path | No exam access-rule or SEB automation |
| `src/commands/materials.rs` has bulk completion | A broad operation can mutate many activities | Only a narrowly checked ungraded manual-completion action |

The repository already has account-scoped repositories, response schemas, a scheduler, public-site checks, an authenticated webview, planner approval contracts, and a converter. MCP reuses these services rather than introducing another login or school transport.

## Contract and ownership

`apps/desktop/src/shared/mcp.ts` is the versioned contract. It defines `Scope`, `Grant`, `Proposal`, `ToolResult`, `Capability`, the tool registry, bridge requests, and renderer IPC. Both processes consume it. Zod parses external requests once at each boundary.

- Electron main owns bridge authentication, consent, grants, approval state, redaction, account selection, and tool execution.
- `apps/mcp` owns stdio MCP, the official SDK adapter, resources, prompts, client configuration, and a credential file containing only the local grant.
- The renderer can approve or deny pending requests through validated IPC. No approval RPC exists on the agent bridge.
- The backend prepares a typed call and an exact target. Main participates in the existing exclusive storage gate for preparation and execution, and releases it while awaiting human approval. Execution is a callback retained only in main. Integration added an optional main-only AbortSignal after code review showed that revocation could otherwise leave queued validation requests free to dispatch a later mutation. The engine always supplies it. The backend checks it between steps and passes it through the existing Moodle scheduler and transport. No wire schema changed. Every mutation waits for a one-shot approval with a 60-second expiry. Authorization is checked again after approval.

Two structures were considered. A generic web-service forwarding tool is compact but cannot enforce tool-specific scope, redaction, or academic policy. A fixed registry with a main-owned backend makes the permitted operations enumerable and testable. The fixed registry is the final decision.

## Local transport

macOS and Linux use a Unix socket at `<userData>/mcp/bridge.sock`, with a 0700 directory and 0600 socket. The owner added Windows support during implementation. `shared/mcp-platform.ts` defines the transport and private-state persistence interfaces. Stream P supplies the Windows named-pipe host and ACL-backed app state. The pipe address is `\\.\pipe\vstudy-<SID hash>`, restricted to the current user SID. The current implementation fails closed when that adapter is absent. Unix permissions are never treated as Windows ACL enforcement. Frames are four-byte big-endian lengths followed by UTF-8 JSON-RPC 2.0. Reject frames over 1 MiB, invalid schemas, excessive pending calls, malformed requests, and unknown methods. Connections have bounded idle time. No TCP listener exists.

Node does not expose portable Unix peer credentials. A small bundled native helper receives the accepted socket on file descriptor 3 and uses `getpeereid` on macOS or `SO_PEERCRED` on Linux. Main rejects a connection unless the peer UID equals its own UID. Missing or failed credential verification fails closed. File permissions and bearer authentication remain separate controls. This does not isolate malicious software already running as the student.

Pairing begins on a connection and returns a random short code for display on stderr. The app shows the same code, the claimed client name, requested scopes, and selected accounts. Finish is bound to that connection and delivers one random bearer token once. Only its SHA-256 hash is persisted in the app. The client saves its bearer in a private file. The short code is a comparison aid, not a credential or proof of client identity. Client names are self-reported.

The Windows client authenticates the connected pipe before sending a frame. Review found that a predictable name plus server-side ACLs could still disclose a bearer to a pre-bound counterfeit endpoint. `apps/mcp/src/windows-pipe.ts` now supplies the default connector. A constant PowerShell script opens a .NET Framework handle at Identification impersonation, then checks its owner and exact protected current-SID allow and Network-SID deny DACL. Only then does it consume client stdin and relay bytes on that handle. There is no probe/reconnect or bare Node fallback. Built-in Framework APIs avoid another cold `Add-Type` compilation. Missing enforcement fails closed. The native Windows tests require CI; Mac-hosted fixtures cannot prove kernel behavior.

Stream P retains server and private app-state wiring. Windows retries allow 95 seconds after launch because P's ARM server test needed a 90-second cold compilation budget. Documented client timeout fields use 600 seconds on Windows for startup, pairing, and a tool call; Unix remains 300 seconds. The launcher uses HKCU uninstall metadata for custom paths, the per-user Programs location next, and legacy HKLM metadata last. It never executes a registry command string.

The switch defaults off. No pairing is accepted until the student enables it in Settings > Agents. Grants expire after 30 days and restrict both scopes and account IDs. Newly added accounts are not silently included. Revocation and switching off cancel pending approvals and deny subsequent calls. Closing a window on macOS keeps the bridge alive. An explicit Quit stops it. `--mcp-background` starts without showing the main window. Consent restores the app window.

## Tools and capability detection

All tools take optional `account`, a local account UUID returned by `list_accounts`. With one eligible account it is selected automatically. With multiple accounts an explicit account is required. This deliberate refinement prevents silently using the wrong school's identity. Planner records with no school belong to the local planner. Course-bound records remain restricted to granted accounts.

The stable tool names are defined in the shared registry. They cover accounts, courses, sections, modules, content search, deadlines, calendar, announcements, forums, discussion posts, grades, files and converted text, quiz metadata and attempts, participant summaries, sync, planner, tasks, study plans, reminders, calendar export, manual completion, forum replies, assignment draft saving, and opening a module in the app. No arbitrary WS function, URL fetch, filesystem path, quiz-answer, quiz-submit, or video-progress tool exists.

Capabilities come from cached `core_webservice_get_site_info.functions`. Missing functions produce `UNSUPPORTED` with a next step rather than an empty success. Unknown capabilities fail closed for remote operations. Never-opened courses load sections and files by their account-scoped course ID. News forums provide announcements even when no UI panel has been visited. Cached course content remains readable offline with freshness provenance. Record Moodle 3.x, 4.x, and 5.x response fixtures and test numeric strings and optional fields. This supports sites the app can connect to. It cannot enable a school's disabled mobile service, unavailable API, permission, unsupported activity plugin, private network, or untrusted TLS certificate.

All MCP Moodle requests use a bounded queue with spacing and jitter. Sync has a separate cooldown. MCP never requests autologin keys itself. Opening a module uses the existing in-app webview, which retains the six-minute autologin rule.

## Approvals and academic integrity

Read scopes authorize reads. Default scopes exclude grades and all writes. The student can add grade access explicitly. All writes, including local tasks, exports, and opening a page, require per-call approval. Forum replies are treated as high risk because Moodle immediately publishes a reply and a forum can be assessed. This is stricter than a low-risk draft.

`mark_module_complete` is limited to resource, folder, page, label, or URL modules with manual completion and affirmative evidence that the completion is not grade-linked. Unknown or automatic tracking fails closed. Quizzes, assignments, H5P, video, and unknown activity types are never eligible.

`save_assignment_draft` replaces `submit_assignment`. It saves only the student's own approved plain text as a draft. The app requires a separate ownership acknowledgement. Approval shows the school, course, assignment, exact text, existing attachment names and sizes, and current text hash. Main reads status during preparation, checks that state again before execution, and reads immediately after saving. Any file, other plugin content, or changed text fails closed with a structured error directing the student to Moodle. A successful result says 'Draft saved. Review and submit it yourself in Moodle' and provides an `open_in_app` target. Final submission is always a manual action in Moodle. No tool calls `mod_assign_submit_for_grading`. File-only assignments and unsupported workflows need Moodle. Never accept agent filesystem paths, upload tokens, or draft file IDs. Never retry an uncertain mutation automatically.

A notice does not authorize assessment automation. The app can present quizzes and videos for the student to complete manually. It must not answer or submit quiz attempts, autoplay graded activities, or claim completion on the student's behalf.

## Content and secret boundaries

Every returned data payload is an explicit untrusted-content envelope with school, account, course, module, author, and cache provenance when available. Human summaries are fixed application text. Course text is data, never authority. HTML becomes bounded Markdown or plain text. Remove active elements and images. Rewrite hyperlinks to stable VStudy references. Do not return school URLs, signed file URLs, autologin keys, cookies, WS keys, or raw exception messages.

A regression test found that learning secret values only when creating a live Moodle client left the first cached read dependent on secret-format heuristics. Preparation now loads stored school token values into the main-only redactor before output, including expired sessions. This makes cached reads safe without contacting the school. A failure to obtain the redaction snapshot fails the request without returning cached content.

Pagination bounds arrays and converted document text. The independent audit reproduced token reconstruction across pages, so complete text is now redacted before truncation, pagination, and search indexing or excerpts. Cursors are tied to the tool, account, and query. Final redaction also runs on output, errors, consent payloads, and activity entries. Activity records contain redacted arguments and fixed result codes, retain 30 days locally, and have a hard count limit.

Write payloads must survive redaction unchanged. Exact-payload validation runs after preparation loads secrets, before the proposal, and at execution or dispatch. This rejects first or pending writes whose display would differ from their effect. It deliberately restricts text containing links, markup, or credential-like values. Tests cover full 20,000-character payloads and rejection rather than silent truncation.

The audit also reproduced an assignment mutation after grant expiry and a scheduler-queued completion after school disconnect. Main-only prepared calls now receive a live authorization callback. Backend rechecks and the actual HTTP boundary enforce it after queue waits and between assignment steps. MoodleService captures an account generation and invalidates it before disconnect starts asynchronous work. Old clients cannot dispatch after disconnect, even if they captured a token earlier. The wire contract is unchanged. A request already dispatched to a school cannot be recalled.

Prompt injection can still affect an agent that ignores the envelope. The app's independent scopes and approvals limit the resulting actions. A local grant cannot stop an authorized agent from copying data it legitimately reads.

## Client installation and packaging

The CLI implements install, uninstall, and doctor. Verify configuration locations and schemas using installed clients and official documentation before writing adapters. Install prints the proposed change, supports dry-run, preserves unrelated settings, backs up existing files, and is idempotent. Uninstall removes only VStudy's unchanged entry. Conflicting entries fail safely. Pairing never stores a bearer in MCP config or command arguments.

Ship a Claude Code plugin with MCP configuration, skills, and commands. Ship Codex guidance and skill, Antigravity configuration, and generic Claude Desktop and Cursor entries. Bundle the stdio server to one Node executable script. Package it, the plugins, and the peer helper with the desktop app. Source builds, package scripts, release checks, typecheck, lint, tests, and knip include MCP.

## Verification sequence and throughput checkpoint

The work has five verified units. First commit this design and the common shapes. Then build the security engine, stdio adapter, and UI in separate worktrees. Integrate Moodle operations against the registry. Run the built stdio artifact with the official SDK client against a real Electron process and loopback Moodle fixtures. Finish with a fresh security-only attack review, main integration, full repository checks, and packaging. Website and README edits occur only in the final separate commit after merging main.

Only one Electron instance runs across this stream. Every Vitest invocation uses `--pool=forks --maxWorkers=2`. Each unit records its command and evidence before the next commit. External-client installation acceptance and live-school acceptance are reported separately from fixture tests. No claim that every university or installed client was exercised follows from fixture coverage.

MCP backend, grant persistence, and transport construction are lazy until the student enables access. Construction and readiness failures disable only MCP and log a fixed diagnostic. Settings > Agents shows "Agent access is unavailable on this platform/build". The desktop startup and window creation do not depend on MCP availability. Access must be enabled again after restarting the app.
