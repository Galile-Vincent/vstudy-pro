# MCP design

VStudy lets a student's global agent read their Moodle coursework and propose actions through the student's existing app session. Moodle credentials remain in Electron main. The stdio server receives a revocable local grant, never school credentials.

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
- The backend prepares a typed call and an exact target. Execution is a callback retained only in main. Every mutation waits for a one-shot approval with a 60-second expiry. Authorization is checked again after approval.

Two structures were considered. A generic web-service forwarding tool is compact but cannot enforce tool-specific scope, redaction, or academic policy. A fixed registry with a main-owned backend makes the permitted operations enumerable and testable. The fixed registry is the final decision.

## Local transport

Use a Unix socket at `<userData>/mcp/bridge.sock`, with a 0700 directory and 0600 socket. Frames are four-byte big-endian lengths followed by UTF-8 JSON-RPC 2.0. Reject frames over 1 MiB, invalid schemas, excessive pending calls, malformed requests, and unknown methods. Connections have bounded idle time. No TCP listener exists.

Node does not expose portable Unix peer credentials. A small bundled native helper receives the accepted socket on file descriptor 3 and uses `getpeereid` on macOS or `SO_PEERCRED` on Linux. Main rejects a connection unless the peer UID equals its own UID. Missing or failed credential verification fails closed. File permissions and bearer authentication remain separate controls. This does not isolate malicious software already running as the student.

Pairing begins on a connection and returns a random short code for display on stderr. The app shows the same code, the claimed client name, requested scopes, and selected accounts. Finish is bound to that connection and delivers one random bearer token once. Only its SHA-256 hash is persisted in the app. The client saves its bearer in a private file. The short code is a comparison aid, not a credential or proof of client identity. Client names are self-reported.

The switch defaults off. No pairing is accepted until the student enables it in Settings > Agents. Grants expire after 30 days and restrict both scopes and account IDs. Newly added accounts are not silently included. Revocation and switching off cancel pending approvals and deny subsequent calls. Closing a window on macOS keeps the bridge alive. An explicit Quit stops it. `--mcp-background` starts without showing the main window. Consent restores the app window.

## Tools and capability detection

All tools take optional `account`, a local account UUID returned by `list_accounts`. With one eligible account it is selected automatically. With multiple accounts an explicit account is required. This deliberate refinement prevents silently using the wrong school's identity. Planner records with no school belong to the local planner. Course-bound records remain restricted to granted accounts.

The stable tool names are defined in the shared registry. They cover accounts, courses, sections, modules, content search, deadlines, calendar, announcements, forums, discussion posts, grades, files and converted text, quiz metadata and attempts, participant summaries, sync, planner, tasks, study plans, reminders, calendar export, manual completion, forum replies, assignment submission, and opening a module in the app. No arbitrary WS function, URL fetch, filesystem path, quiz-answer, quiz-submit, or video-progress tool exists.

Capabilities come from cached `core_webservice_get_site_info.functions`. Missing functions produce `UNSUPPORTED` with a next step rather than an empty success. Unknown capabilities fail closed for remote operations. Cached course content remains readable offline with freshness provenance. Record Moodle 3.x, 4.x, and 5.x response fixtures and test numeric strings and optional fields. This supports sites the app can connect to. It cannot enable a school's disabled mobile service, unavailable API, permission, unsupported activity plugin, private network, or untrusted TLS certificate.

All MCP Moodle requests use a bounded queue with spacing and jitter. Sync has a separate cooldown. MCP never requests autologin keys itself. Opening a module uses the existing in-app webview, which retains the six-minute autologin rule.

## Approvals and academic integrity

Read scopes authorize reads. Default scopes exclude grades and all writes. The student can add grade access explicitly. All writes, including local tasks, exports, and opening a page, require per-call approval. Forum replies are treated as high risk because Moodle immediately publishes a reply and a forum can be assessed. This is stricter than a low-risk draft.

`mark_module_complete` is limited to resource, folder, page, label, or URL modules with manual completion and affirmative evidence that the completion is not grade-linked. Unknown or automatic tracking fails closed. Quizzes, assignments, H5P, video, and unknown activity types are never eligible.

Assignment submission requires the student's own text or an app-owned file selected for the exact pending proposal in the app. Never accept arbitrary agent filesystem paths, upload tokens, or draft file IDs. The approval shows school, course, assignment, exact text or selected file, and the irreversible effect. Moodle save and final submit are separate steps under that same single approval. If site rules require an unsupported statement or workflow, return a structured error and direct the student to Moodle. Never retry an uncertain remote mutation automatically.

A notice does not authorize assessment automation. The app can present quizzes and videos for the student to complete manually. It must not answer or submit quiz attempts, autoplay graded activities, or claim completion on the student's behalf.

## Content and secret boundaries

Every returned data payload is an explicit untrusted-content envelope with school, account, course, module, author, and cache provenance when available. Human summaries are fixed application text. Course text is data, never authority. HTML becomes bounded Markdown or plain text. Remove active elements and images. Rewrite hyperlinks to stable VStudy references. Do not return school URLs, signed file URLs, autologin keys, cookies, WS keys, or raw exception messages.

Pagination bounds arrays and converted document text. Cursors are validated and tied to the tool, account, and query. Redaction runs on tool output, errors, consent payloads, and activity entries. Activity records contain redacted arguments and fixed result codes, retain 30 days locally, and have a hard count limit. A bounded record cannot become a second course-content archive.

Prompt injection can still affect an agent that ignores the envelope. The app's independent scopes and approvals limit the resulting actions. A local grant cannot stop an authorized agent from copying data it legitimately reads.

## Client installation and packaging

The CLI implements install, uninstall, and doctor. Verify configuration locations and schemas using installed clients and official documentation before writing adapters. Install prints the proposed change, supports dry-run, preserves unrelated settings, backs up existing files, and is idempotent. Uninstall removes only VStudy's unchanged entry. Conflicting entries fail safely. Pairing never stores a bearer in MCP config or command arguments.

Ship a Claude Code plugin with MCP configuration, skills, and commands. Ship Codex guidance and skill, Antigravity configuration, and generic Claude Desktop and Cursor entries. Bundle the stdio server to one Node executable script. Package it, the plugins, and the peer helper with the desktop app. Source builds, package scripts, release checks, typecheck, lint, tests, and knip include MCP.

## Verification sequence and throughput checkpoint

The work has five verified units. First commit this design and the common shapes. Then build the security engine, stdio adapter, and UI in separate worktrees. Integrate Moodle operations against the registry. Run the built stdio artifact with the official SDK client against a real Electron process and loopback Moodle fixtures. Finish with a fresh security-only attack review, main integration, full repository checks, and packaging. Website and README edits occur only in the final separate commit after merging main.

Only one Electron instance runs across this stream. Every Vitest invocation uses `--pool=forks --maxWorkers=2`. Each unit records its command and evidence before the next commit. External-client installation acceptance and live-school acceptance are reported separately from fixture tests. No claim that every university or installed client was exercised follows from fixture coverage.
