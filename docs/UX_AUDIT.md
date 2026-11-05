# Student app UX audit

The goal is a student app that a first-time user can understand without prior Moodle or AI knowledge. This audit checks the merged renderer, fixes navigation and accessibility defects, and records repeatable Electron evidence.

The branch is `t3/ux-polish`. It includes stream J through merge commit `30995d9`, based on `e7f0082`. No UX implementation changes were made in `main/` or `shared/`. The merge brings stream J's generated locale registry and test setup. The new History guidance uses a renderer-owned `ux` namespace with English, Traditional Chinese, Japanese, and pseudo-locale resources.

## Findings

There are **10 UI findings**. There are **0 blockers, 6 major findings, 3 minor findings, and 1 polish finding**. All ten are fixed. Severity reflects the affected workflow, including the requested short-window and expanded-text cases.

| ID | Severity | Student-visible problem | Fix and regression coverage | Screenshot or accessibility evidence | Status |
| --- | --- | --- | --- | --- | --- |
| UX-01 | Major | After Help replays setup, Escape can leave the global History finder open. | The controlled finder handles an unconsumed Escape inside its content. Real Cmd+K and Ctrl+K tests run before and after replay. | [Before](evidence/ux/before-history-escape.png), [after](evidence/ux/after-history-open.png), [keyboard results](evidence/ux/keyboard-results.json). | Fixed |
| UX-02 | Major | Closing a shortcut-opened finder loses the keyboard user's place. | Remember the opening control and restore its focus on dismissal. DOM and Electron tests assert the focused element. | [Focus restored](evidence/ux/after-history-dismissed.png). | Fixed |
| UX-03 | Major | Course-term tabs have `aria-controls` targets that do not exist. Assistive technology cannot associate the selected term with its courses. | Each term has a real tab panel. Tests check every tab's panel and reverse label association. | [Before](evidence/ux/before-courses-en-1200-100.png), [axe finding](evidence/ux/before-findings.json), [after accessible tree](evidence/ux/after-courses-en-1200-100.txt). | Fixed |
| UX-04 | Major | The folder tree can shrink to zero height beneath Settings. Pointer users cannot expand or open folders. | Sidebar sections retain their natural height inside the scrolling content region. Library E2E asserts a visible folder row and exercises pointer navigation. | [Before](evidence/ux/before-library-folders.png), [after](evidence/ux/after-library-folders.png). | Fixed |
| UX-05 | Major | Dismissing History also collapses the course assistant underneath it. | The assistant respects an already-consumed Escape. Electron tests dismiss the finder first, then the assistant, and check focus. | [Before](evidence/ux/before-nested-escape.png), [after](evidence/ux/after-nested-escape.png). | Fixed |
| UX-06 | Major | At minimum height, a long first-time tip consumes almost the whole coursework area. | Tips are keyboard-operable disclosures. They start collapsed in short windows and expanded in taller windows. All instructions remain available. | [Before](evidence/ux/before-expanded-text-course-min.png), [after](evidence/ux/after-course-content-en-XA-720-125.png). | Fixed |
| UX-07 | Minor | Expanded History labels extend beyond the narrow header. | Narrow windows show the search icon with the full accessible name and tooltip. Wider headers constrain visible labels. | [Before](evidence/ux/before-expanded-text-course-min.png), [after](evidence/ux/after-course-content-en-XA-720-125.png). | Fixed |
| UX-08 | Minor | An expanded notification action extends beyond its course panel. | Notification actions can shrink and wrap within their panel. Section headings also wrap. Geometry assertions cover the expanded locale at 125% scale. | [Notification layout](evidence/ux/after-course-active-radix-_r_a_-trigger-notifications-en-XA-720-125.png), [matrix](evidence/ux/after-audit.json). | Fixed |
| UX-09 | Minor | The History lesson says search is limited to the current document, despite the merged global finder. | Teach sidebar History, Cmd/Ctrl+K, content search, scope filters, and Escape in all supported languages. Tests check the translated transcripts. | [English](evidence/ux/after-walkthrough-history-en.png), [Traditional Chinese](evidence/ux/after-walkthrough-history-zh-Hant.png), [Japanese](evidence/ux/after-walkthrough-history-ja.png). | Fixed |
| UX-10 | Polish | Duplicate dialog gaps leave very little onboarding preview visible in short windows. | Remove inherited flex gaps while retaining the component's token-based margins and scrollable body. | [Before](evidence/ux/before-welcome-guide-720.png), [after](evidence/ux/after-welcome-guide-720.png). | Fixed |

## Coverage

The [matrix manifest](evidence/ux/after-audit.json) records 119 screen states, 73 axe checks, and an accessible tree for each capture. Its final run has no renderer page errors, no measured container overflow, no offscreen dialogs, and no axe violations in the checked states. Geometry checks allow two CSS pixels of rounding. This is a coverage matrix, not every combination of every setting.

| Area | Evidence exercised |
| --- | --- |
| Welcome and onboarding | Fresh profiles, all six guide steps, welcome page, leave and resume, sample import, translated journeys, short-window scrolling, and Help replay. |
| Home | Empty and sample states, getting-started checklist, language and scale variants. |
| Library | Empty and populated states, list and grid, folders and nested folders, pins, saved filters, status filters, CJK search, keyboard reorder, multi-select, move, delete and undo, export, and reload. The Library acceptance run captured 101 states. |
| Reader and chat | Real sample Markdown, keyboard selection, selection context, fake-provider answer, conversation reopening, and narrow Document/Chat navigation. |
| History | Empty and populated search, CJK text, safe highlighting, filters, rename, pin, archive/delete undo, keyboard results, message jumps, scoped conversations, global shortcuts, nested Escape, and focus return. |
| Courses | Empty state, current/upcoming/past/all terms, long course and deadline titles, all six course tabs, module sheet, announcements, assistant, expired account, failed load, and failed sync with retained courses. |
| Connect | Real bundled school directory, multilingual and country search, no-results URL entry, keyboard selection, fixture site discovery, password and browser-sign-in plans, multiple schools, maintenance, QR fallback, and Escape. |
| Planner | Empty state, Today and seven-day view, quick-add task, exam scope, proposal approval, calendar export, material approval, persistence, and course-agent task provenance. |
| Moodle pane | Real native pane with a loopback Moodle fixture, shared account cookies, back navigation, controlled popup, module focus return, expand, zoom, theme propagation, certificate error, expired session, and imported attachment. |
| Settings | General, Appearance, Providers, Usage, Storage, and Privacy. Four theme packs in both schemes. Offline conversion mode, Keychain-denied recovery and session-only key, typed-delete guard, backup, integrity, cache cleanup, restore, and restart. |
| Help | All five lessons, captions, recorded examples, shortcuts, setup replay, reduced-motion transcript, and translated History instructions. |

The window matrix uses native sizes of **720×480**, **1200×800**, and **1600×1000**. The title bar leaves a slightly smaller renderer viewport, recorded in each manifest entry. Languages are **en**, **zh-Hant**, **ja**, and **en-XA**. The small-window matrix includes **125% UI scale and compact density**. Default and wide cases include **100% scale**. Ocean, Grove, Ember, and Iris are checked in light and dark schemes. Reduced motion is active during the matrix. Existing caption tests also cover paused and resumed playback.

Keyboard evidence covers guide dismissal, Cmd/Ctrl+K, focus containment and restoration, nested dialogs, school selection, reader selection, history navigation, and Library operations. Accessible trees verify labels and structure. They do not replace listening to the app with macOS VoiceOver.

## Reproduce

Run Electron scripts serially from `apps/desktop`. Each script owns an isolated profile and closes its Electron instance in `finally`.

```sh
pnpm build
node e2e/ux-keyboard.mjs
node e2e/ux-audit.mjs
node e2e/library.mjs
node e2e/chat-history.mjs
node e2e/storage.mjs
node e2e/privacy-settings.mjs
node e2e/schools-registry.mjs
node e2e/moodle-webview.mjs
node e2e/planner.mjs
VSTUDY_FIRST_RUN_CASE=en:sample node e2e/first-time-user.mjs
VSTUDY_FIRST_RUN_CASE=zh-Hant:sample node e2e/first-time-user.mjs
VSTUDY_FIRST_RUN_CASE=ja:sample node e2e/first-time-user.mjs
```

`ux-audit.mjs` uses a local Vite renderer inside the real Electron application so it can activate the actual pseudo-locale module. It uses the real preload, settings, library, and sample importer. School replies are deterministic main-process fixtures. Other acceptance scripts use the production build. The Moodle pane test has its own loopback server. No university password, live AI provider, or production school data is used.

The first Storage and document-scoped History attempts exposed a test timing fault. In pinned Playwright 1.56, an async `waitForFunction` predicate is immediately truthy as a Promise. The affected tests now use an explicit awaited IPC poll. The subsequent tests pass after checking actual document readiness. The Privacy test now resets guide progress between cases and checks CLI opt-in through the current setup flow.

## Stream J integration

`main` was merged before final verification. The generated shared locale registry remains generated. No shared locale catalog or `i18n.ts` was hand-edited for this stream.

The five temporary knip file waivers were checked for consumers and removed with their dead renderer components. The vendor manifest and three obsolete patch files were updated with the deletion. The files were `tool-approval-questions.tsx`, `tool-fallback-parts.tsx`, `alert-dialog.tsx`, `context-menu.tsx`, and `scroll-area.tsx`.

Final post-merge checks all pass. These commands run from the repository root without setting `NODE_OPTIONS`.

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm typecheck` | Pass. Generated locale registry and TypeScript checks. | [Log](evidence/ux/post-merge-typecheck.txt). |
| `pnpm lint` | Pass. | [Log](evidence/ux/post-merge-lint.txt). |
| `pnpm knip` | Pass. No unused file, dependency, unlisted dependency, or binary findings. One CSS configuration hint remains. | [Log](evidence/ux/post-merge-knip.txt). |
| `pnpm test --pool=forks --maxWorkers=2` | Pass. 118 files passed, 5 skipped. 936 tests passed, 14 skipped. Theme contrast checks pass. | [Log](evidence/ux/post-merge-tests.txt). |
| `pnpm vendor:check` | Pass. 55 vendor sources and 1 application file match their reviewed hashes. | [Log](evidence/ux/post-merge-vendor.txt). |
| `node apps/desktop/scripts/security-audit.mjs` | Pass. No unreviewed advisories. Existing accepted dependency advisories remain. | [Log](evidence/ux/post-merge-security.txt). |

The post-merge production build passes. The rebuilt Electron app also passes finder replay, focus return, nested Escape, stale-course recovery, and offline-mode persistence. See the [build log](evidence/ux/post-merge-build.txt) and [Electron results](evidence/ux/post-merge-keyboard.txt). All Electron instances launched by this audit are closed.

## Limits and remaining release work

- Live school authentication and live AI responses remain unverified in this pass. Fixtures cover their UI transitions and failure states.
- Native VoiceOver speech, macOS Keychain approval dialogs, and a complete manual keyboard-only traversal of every control remain release checks. Accessible snapshots and automated keyboard tests cover the flows listed above.
- Cold-start performance, maximum-size document first paint, and a sustained animation-jank measurement were not benchmarked. No startup-time or frame-rate claim is made here.
- Signed and notarized packaging was not produced by this UX stream.
- The pre-merge security aggregate stopped at advisory `1244623`. The retained log records that result. The post-merge security result is recorded separately; inherited advisory acceptances do not mean dependencies are vulnerability-free.

Fix Root Causes shaped the sidebar sizing fix and the readiness-poll correction. Model the Domain shaped the shared course-term registry and panel relationship. Prove It Works shaped the rerunnable Electron matrix and the before/after evidence. This implementation delegate performed the work in-thread and opened no PR.
