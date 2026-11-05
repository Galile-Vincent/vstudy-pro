# First-time student test

The goal is an app a student can learn and use alone. This test checked where a first-time student loses their way, then fixed the confirmed blockers and major friction.

The fixture journeys pass. Production acceptance remains open for live school/AI access and PDF setup on a clean Mac without a supported runtime.

## Method and limits

The tester simulated three personas on macOS in real Electron at 1200 by 768. Each initial session had a new `--user-data-dir`, no saved AI key, and no enabled command-line AI tool. Only one test Electron ran at a time. This was a deliberately naive inspection, not a study with recruited students.

Before those sessions, the tester read the shared brief, agent instructions, launch metadata, and the existing loopback server setup. The tester did not read app source, product documentation, or e2e task steps to learn the interface. Source inspection and automated regression work began after the initial observations. The [observation log](evidence/novice/observations.md) records expectations, hesitation, confusing text, and the boundary between those phases.

Renderer screenshots initially omitted a pending native download sheet. A native accessibility check corrected the apparent frozen-import diagnosis. The waits before that correction do not measure conversion performance. Choosing Offline mode declined the download, made the PDF show a recoverable failure, and allowed the sample to finish. Accepting the revised sheet later produced a readable and selectable PDF.

Production discovery deliberately rejects loopback and non-public school URLs. No security rule was weakened to make a test pass. The initial school connection attempt therefore failed. The later school UI rechecks use the existing `first-time-user.mjs` main-process fixture with `student` / `example-only`. The existing loopback `moodle-webview.mjs` separately verifies the authenticated Moodle content view. These are complementary fixture checks, not proof of a real university login.

The answer rechecks explicitly use the local fake adapter after the no-key checks. They verify question submission, selected text, persistence, and history retrieval. They do not verify AI answer quality or a paid account. Installed command-line tools existed on this Mac but stayed disabled. Empty-provider unit coverage also checks the no-tool case.

## Persona results

The tables distinguish initial friction from successful rechecks. Seconds come from automated action-to-visible-result intervals in [recheck-results.json](evidence/novice/recheck-results.json). They exclude human reading time, screenshot writing, and relaunch time. School times marked with an asterisk cover the whole fixture first-task sequence, including onboarding and deadlines, rather than an isolated action. Unmeasured tasks have no invented time-to-success. Raw snapshots accompany the PNG files.

### Persona 1. Traditional Chinese, new to Moodle apps and AI

| Task | Result | Seconds | Evidence |
| --- | --- | --- | --- |
| a. Find and connect school | Fail initially; success with school UI fixture | 1.49* | [Screenshot](evidence/novice/p1-recheck-school-picker.png) |
| b. Due this week | Blocked initially; success with school UI fixture | 1.49* | [Screenshot](evidence/novice/p1-recheck-school-due.png) |
| c. Make and approve a study plan | Success with local planner. Live conversational plan unverified. | 5.96 to draft | [Screenshot](evidence/novice/p1-before-16-plan-approved.png) |
| d. Open teacher content | Blocked initially; shared loopback content fixture passed. | Not timed | [Screenshot](evidence/novice/moodle-teacher-page.png) |
| e. Theme and language | Success | 0.29 | [Screenshot](evidence/novice/p1-recheck-theme-and-language.png) |
| f. Find an old conversation | No chat initially; success after fixture answer | 1.01 | [Screenshot](evidence/novice/p1-recheck-find-old-conversation.png) |
| g. PDF and selected-passage question | Struggle initially; PDF selection and fixture answer succeed | 10.89 PDF + 0.45 answer | [Screenshot](evidence/novice/p1-recheck-pdf-selection.png); [Screenshot](evidence/novice/p1-recheck-fixture-answer.png) |
| h. Recover from mistakes or unavailable access | Success through no-key fallback. Shared denied-permission and session-recovery fixtures passed. | 0.10 to fallback | [Screenshot](evidence/novice/p1-recheck-no-key-fallback.png); [Denied permission](evidence/novice/keychain-denied.png) |

### Persona 2. English, familiar with ChatGPT

| Task | Result | Seconds | Evidence |
| --- | --- | --- | --- |
| a. Find and connect school | Fail initially; success with school UI fixture | 1.79* | [Screenshot](evidence/novice/p2-recheck-school-picker.png) |
| b. Due this week | Blocked initially; success with school UI fixture | 1.79* | [Screenshot](evidence/novice/p2-recheck-school-due.png) |
| c. Make and approve a study plan | Success with local planner. Live conversational plan unverified. | 11.96 | [Screenshot](evidence/novice/p2-before-08-plan-draft.png) |
| d. Open teacher content | Blocked initially; shared loopback content fixture passed. | Not timed | [Screenshot](evidence/novice/moodle-teacher-page.png) |
| e. Theme and language | Success | 0.29 | [Screenshot](evidence/novice/p2-recheck-theme-and-language.png) |
| f. Find an old conversation | No chat initially; success after fixture answer | 1.01 | [Screenshot](evidence/novice/p2-recheck-find-old-conversation.png) |
| g. PDF and selected-passage question | Struggle initially; PDF selection and fixture answer succeed | 5.36 PDF + 0.39 answer | [Screenshot](evidence/novice/p2-recheck-pdf-selection.png); [Screenshot](evidence/novice/p2-recheck-fixture-answer.png) |
| h. Recover from mistakes or unavailable access | Success through no-key fallback. Shared denied-permission and session-recovery fixtures passed. | 0.07 to fallback | [Screenshot](evidence/novice/p2-recheck-no-key-fallback.png); [Denied permission](evidence/novice/keychain-denied.png) |

### Persona 3. PDF reading without a school

| Task | Result | Seconds | Evidence |
| --- | --- | --- | --- |
| a. Find and connect school | Not attempted. Persona stays unconnected. | 0 | [Screenshot](evidence/novice/p3-before-06-no-school.png) |
| b. Due this week | No school data, as expected. | 0 | [Screenshot](evidence/novice/p3-before-06-no-school.png) |
| c. Make and approve a study plan | Success with local planner. Live conversational plan unverified. | Not timed | [Screenshot](evidence/novice/p3-before-07-plan-approved.png) |
| d. Open teacher content | Not attempted. No connected school. | 0 | [Screenshot](evidence/novice/p3-before-06-no-school.png) |
| e. Theme and language | Success | 0.28 | [Screenshot](evidence/novice/p3-recheck-theme-and-language.png) |
| f. Find an old conversation | No chat initially; success after fixture answer | 1.02 | [Screenshot](evidence/novice/p3-recheck-find-old-conversation.png) |
| g. PDF and selected-passage question | Struggle initially; PDF selection and fixture answer succeed | 5.37 PDF + 0.39 answer | [Screenshot](evidence/novice/p3-recheck-pdf-selection.png); [Screenshot](evidence/novice/p3-recheck-fixture-answer.png) |
| h. Recover from mistakes or unavailable access | Success through no-key fallback. Shared denied-permission and session-recovery fixtures passed. | 0.09 to fallback | [Screenshot](evidence/novice/p3-recheck-no-key-fallback.png); [Denied permission](evidence/novice/keychain-denied.png) |


## Friction ranked by severity

| Severity | What the student encountered | Change and evidence |
| --- | --- | --- |
| Major | Disabled chat and an empty model menu gave no next step. Selecting a passage still could not produce a question. | Added an explanation of what works without AI and a setup action in document chat, unavailable conversations, the model controls, and the course assistant. [Before](evidence/novice/p3-before-12-selected-no-answer.png), [after](evidence/novice/p3-recheck-reading-without-ai.png). |
| Major | Reopening after an import inside the workspace returned to the previous document. The persisted route still named that document. This was found during the source-informed restart recheck. | Update the route when importing or deleting the active document. The regression restarts Electron and requires the imported PDF before sending its selected text. [PDF selection](evidence/novice/p1-recheck-pdf-selection.png), [answer after restart](evidence/novice/p1-recheck-fixture-answer.png). |
| Major | Settings opened with “Providers”, structured tables, API fields, local endpoints, and command-line tools. No complete path helped a student without access. | Renamed the tab to AI services, added access and test instructions, explained separate API billing and denied Mac permissions, and supplied a copyable teacher/IT request. Local services and Terminal tools start collapsed. [Before](evidence/novice/p2-before-12-providers.png), [after](evidence/novice/p2-recheck-no-key-fallback.png). |
| Moderate | The native download prompt described locked packages and a converter without first explaining the reading task. | Explain PDF/Office reading tools, local document handling, download origins, the text-only alternative, and where to retry. [Before](evidence/novice/p3-before-native-consent.jpg), [after](evidence/novice/p1-after-native-consent.jpg). |
| Moderate | A working temporary key still appeared as “No key saved”. This was confirmed in the source-informed recovery check. | Show that the key is available for the current session. A component regression covers the status; the existing Keychain test verifies rejection, retry, and non-persisted session use. [Denied permission](evidence/novice/keychain-denied.png). |
| Moderate | “Markdown · markitdown” exposed a parser name, and a correct sample still suggested incomplete conversion. | Show “Ready to read”. Native Markdown and text no longer get the incomplete-conversion prompt. [Before](evidence/novice/p3-before-11-sample-ready-no-ai.png), [after](evidence/novice/p3-recheck-reading-without-ai.png). |
| Moderate | AI usage showed tokens without explaining the unit to a first-time AI user. | Define tokens, input, output, and estimated cost in Usage and the conversation-usage tooltip. [Explanation](evidence/novice/p2-recheck-understand-ai-usage.png). |

The course assistant also stops offering its initial question before a conversation exists. Previously that control could accept a click without producing a conversation. The existing course-agent fixture still verifies proposal approval and persisted agent provenance.

## Confusing text observed

- “找不到模型。” and “No models found.” gave no recovery action.
- “供應商” and “Providers” assumed the student knew how AI services are configured.
- “唯讀結構化表格（僅限 API 服務供應商）” appeared before basic AI access instructions.
- “Resolved executable” and the default `http://localhost:11434/v1` belonged to an advanced workflow.
- “Download the document converter?” and “locked packages” described implementation before purpose.
- “Markdown · markitdown” exposed the conversion library.
- “Preparing text reader…” was misleading in renderer-only evidence while the native sheet waited. The native choice itself was functioning.

## AI access acceptance

A student without a key can read the sample, organise files, view coursework after connecting a school, and approve local study plans. PDF/Office reading needs the separate local reading tools. The setup screen explains that AI answers require access to a service, and that a ChatGPT or Claude chat subscription does not supply API credit.

The visible path is Set up AI help, choose school-approved access, Get a key, use or save the code, Test connection, close Settings, select a model, select a passage, and ask. The fallback is a copyable request to the teacher or IT team and Continue without AI. No command-line installation is required for that fallback. The guide warns against pasting a school password and describes the context sent to AI.

The no-account fallback passed for all three personas. A working external AI answer remains unverified because this test used no real AI credentials. The fake answer is labelled as fixture evidence throughout this report.

## Commands and results

Run the commands from the repository root unless a directory is specified.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed. The new worktree initially had no dependencies. |
| `pnpm build` | Passed against the final renderer. Existing bundle-size and mixed-import warnings remain. |
| `pnpm typecheck` | Passed. |
| `pnpm lint` | Passed as part of the security check. |
| `pnpm test --pool=forks --maxWorkers=2` | 942 passed, 14 skipped across 124 files. The security check repeats this suite. |
| `pnpm security:check` | Passed with the repository's reviewed advisory allowlist and three existing dynamic-URL lint warnings. No security settings or IPC schemas changed. |
| `node e2e/novice-ai-setup.mjs` in `apps/desktop` | All three persona cases passed. Supply `VSTUDY_CONVERTER_VENV` with an installed locked environment for PDF checks. Without it, the script reports that PDF task as skipped. |
| `VSTUDY_FIRST_RUN_CASE=zh-Hant:school node e2e/first-time-user.mjs` | Passed the school UI fixture. |
| `VSTUDY_FIRST_RUN_CASE=en:school node e2e/first-time-user.mjs` | Passed the school UI fixture. |
| `node e2e/moodle-webview.mjs` | Passed the loopback authenticated content, certificate-error, account-isolation, download, and expired-session checks. |
| `VSTUDY_SSO_HARNESS=1 node e2e/moodle-sso-flow.mjs` | Passed isolated TLS school-login callbacks and load-failure retry. The loopback exception exists only in the temporary test bundle. |
| `node e2e/moodle-agent.mjs` | Passed real Electron with the fake adapter, proposal approval, saved provenance, and linked-document chat. |
| `node e2e/privacy-settings.mjs` | Passed 36 language/theme/width checks, no enabled CLI tools, and simulated Keychain rejection followed by temporary-key recovery. |

The [command logs](evidence/novice/commands) and [raw recheck results](evidence/novice/recheck-results.json) preserve the outcomes. The privacy fixture used a simulated Keychain refusal, not an actual refusal by macOS. It reported no accessibility violations in its checked screens.

## Remaining acceptance gaps

- Real school authentication and live AI answers still need permitted accounts. A natural-language request for a study plan was not verified against a live model. Local plan approval and a fixture course-agent action both passed.
- The initial loopback school-login failure is a test-fixture compatibility limit. The production public-HTTPS checks remain intact.
- A first-run installer still needs a supported Python or uv installation on this Mac. The revised prompt explains the download, but this task did not add a bundled runtime.
- A student who declines reading-tool downloads cannot read a PDF until they later permit setup. The sample and plain text remain available.
- The global Converting / Failed sidebar count can remain stale until its next library refresh even after a document finishes. The document's status and content update correctly.
- These are simulated personas. Human comprehension, VoiceOver use, live-school variants, signing, and notarization were not acceptance-tested here.

## Handoff

The branch is `t3/novice-test`. New presentation modules are `ai-setup.tsx`, `ai-setup.css`, and their component tests. The new regression script is `e2e/novice-ai-setup.mjs`. Shared edits are the three `settings.json` catalogs and the new `novice.json` namespace in English, Traditional Chinese, and Japanese. There are no schema, database, main-process, preload, or permission changes.

Model the Domain kept this change in presentation data and callbacks. Fix Root Causes changed the saved route when the active document changes. Prove It Works required native-dialog inspection and real Electron reruns instead of treating the renderer snapshot as the complete app.

Nested delegation was not used because this task explicitly assigned the tester sub-agent role. Independent review belongs to the parent workflow; no PR was opened.
