# App tab fixes, final planned fix round

The goal is Safari-style multi-tab support for VStudy Pro, an Electron and React app in apps/desktop. Courses, Moodle homework pages, documents, and AI chats must stay open together. Switching must preserve each tab's place, use bounded memory, and remain smooth and clear.

This round fixes the verified second-review findings while retaining per-tab RouteHistory, the keyed native pool, strict IPC, trusted-sender checks, main-owned resource keys, and URL redaction. No changes were made to the fourteen findings the reviewers had already cleared. Nothing was pushed.

## Finding results

Paths in this table are relative to apps/desktop/src unless stated otherwise. Every behavioral fix has a regression that was run against e33fa3cd and failed. Baseline runs temporarily restored only production modules and retained the new tests. Production modules were restored immediately after each run.

| Finding | Verdict and code evidence | Regression evidence | Failed before |
| --- | --- | --- | --- |
| A | Fixed. main/moodle/webview.ts:124 requires matching account and requested URL before accepting a renderer checkpoint. renderer/courses/webview-pane.tsx reads current presentation for each open and checks its target identity. The e2e handler now forwards checkpoint data and calls assertTab for owned pane operations. | `ignores a renderer checkpoint for another requested target`; native UI directly sends stale X while requesting Y and checks the loaded URL. | Yes, before.log. Checkpoint mutation also fails the native assertion. |
| B | Fixed. main/moodle/webview.ts:125 retains pending delivery, including across discard. state and actions peek. Only `ack-document` at line 295 clears delivery. The active renderer records the import before acknowledging it. A late poll rejected after teardown never acknowledges it. | `retains import delivery across reads and actions until acknowledged`; updated reopening test explicitly acknowledges. | Yes, before.log. The old Copy action consumes the pending ID. |
| C | Fixed. shared/app-tabs.ts:14 validates importedDocumentId on the history entry. renderer/shell/tab-state.ts records it without replacing history. Main reconstructs completed file state from that marker. | `persists completed Moodle imports on their history entry across restart and Back`; `does not reimport a restored completed file target`; strict persisted-schema test. Native UI reloads persisted history after clearing main resources, then goes Back. | Yes, before.log, before-extra.log, and before-schema.log. |
| D | Fixed. renderer/courses/webview-pane.tsx renders the translated imported-file card and Open document control. main/moodle/webview.ts:287 requires a committed document and excludes file targets from native visibility. | Renderer imported-card test; `never reveals a native view before a document has committed`; native UI checks restart Back, forced native discard, reopen, hidden native view, and the Open document action. | Yes, before-card.log and before-blank.log. |
| E | Fixed. main/moodle/webview.ts:214 resets dirty protection only for document replacement. The in-page event passes false. | `keeps dirty protection through same-document navigation`; native UI emits in-page navigation after input, then attempts discard. | Yes, before.log. Dirty-reset mutation fails the native assertion. |
| F | Fixed. main/moodle/webview.ts:110 registers owner teardown before writing generations or attempting pool admission. closeOwner clears the generation and removes handlers. | `cleans owner handlers after failed admission`. | Yes, before-extra.log. |
| G | Fixed. main/moodle/webview.ts:255 retains private target separately in the main-only checkpoint and reopens from it. IPC and persisted URLs remain redacted. | `restores the private URL after discard`, with sesskey and returnurl parameters. | Yes, before.log. |
| H | Fixed. renderer/shell/history-swipe-navigation.tsx:13 requires a nonzero client rectangle for menu, listbox, dialog, and popover overlays. | Three negative native-overlay tests cover persistent unlaid-out listbox, display:none, and zero-size content. Positive tests supply real-sized jsdom rectangles. The existing swipe dialog fixture now also supplies a rectangle. | Yes, all three negatives fail in before.log. |
| I | Fixed. main/web-chat/views.ts:169 registers trusted owners during tab membership sync. Clear therefore reaches restored windows before they activate a hosted pane. The provider continues through the existing validated enum. | `notifies a synced window that never activated a hosted pane when clearing`. | Yes, before-extra.log. |
| J | Not a bug. renderer/shell/index.tsx:233 unconditionally mounts TabStrip. tab-strip.tsx:29 runs membership sync before rendering, and line 90 only changes CSS when one tab remains. No conditional unmount exists. | Code inspection; existing real tab-close and rapid hosted-tab switching e2e passes. | Not applicable. No code change. |
| K | Corrected the claim in this report and removed the redundant window.window in the measurement fixture. e2e/native-tabs-fixture.mjs already asserts the accepted last-polled value, 800, after the page moves to an unpolled 1200. Its assertion message already says last polled. | app-tabs and measurement run that assertion successfully. This checks last-polled restoration. It does not guard the asynchronous capture race. window.window is window, so removing it has no behavioral regression to reproduce. | Not applicable to the wording and redundant property cleanup. |

L remains accepted. Printable keys and Space in non-editable content can conservatively protect a native page for the bounded ten-minute dirty interval.

## Import delivery and persistence shape

The strict tabRouteSchema has optional importedDocumentId, validated by documentIdSchema. The marker lives on the Moodle history entry alongside its account and target. It survives navigation to the document because changing presentation does not replace history. A reducer action records the marker on the current Moodle entry, and AppShell attempts an immediate validated save before delivery acknowledgement.

The strict Moodle open request accepts optional importedDocumentId. WebviewState exposes importedDocumentId as the completed-file card target and documentId as pending automatic delivery. Reads and actions leave pending delivery intact. The new ack-document enum action clears only pending delivery. Existing main IPC handlers validate the strict request, trusted app frame, owner, tab ID, and pane ID. Resource keys remain built from sender.id and tabId in main. Remote content receives no new bridge.

Renderer checkpoints now contain accountId, requestedUrl, url, zoom, and scrollTop. Moodle presentation stores optional requestedUrl so a navigated page can restore its current URL while still proving which requested target it belongs to. Both URLs are redacted by strict shared schemas. Main compares identity before applying a checkpoint. Its private discard checkpoint additionally retains the unredacted target in memory only.

An imported file restored with its marker never automatically reimports. The renderer shows "This file was imported" and an Open document control. The native view stays hidden because no document has committed. Explicit Reload remains an explicit request to import again.

## Verification

| Command, from apps/desktop unless noted | Result |
| --- | --- |
| pnpm typecheck | Pass. |
| pnpm lint | Pass. |
| NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run src/renderer src/shared src/main --pool=forks --maxWorkers=2 | Pass, 299 files and 2693 tests. Existing 7 files and 20 tests skipped. |
| Final focused main regression run after the committed-document visibility guard | Pass, 36 tests. |
| Final focused renderer, shared schema, reducer, and Moodle run | Pass, 54 tests. |
| pnpm build | Pass, including final rebuild. Existing large-chunk advisory. |
| node e2e/moodle-webview.mjs | Pass, including rerun after the visibility guard. |
| node e2e/app-tabs.mjs | Pass. |
| node e2e/app-tabs-native-ui.mjs | Pass, including final rerun. |
| node e2e/a11y-regressions.mjs | Pass, 144 audits with no failures. |
| node e2e/i18n.mjs | Pass for en, zh-Hant, and ja. |
| node e2e/history-startup-regressions.mjs | Pass. |
| node e2e/chat-history.mjs | Pass. |
| node e2e/chat-controls.mjs | Pass. |
| node scripts/measure-native-tabs.mjs 5 | Pass. Restored five tabs with one live native view after full process restart. |
| node e2e/swipe-history.mjs | Fail once at native shell WebContents focus precondition. Same known environment failure. No attempted production fix or retry. |
| pnpm security:static, repo root | Pass with three existing dynamic-URL warnings and zero errors. |
| Checkpoint and dirty-reset native UI mutations | Both fail at their intended assertions. Source restored afterward. |
| Normal implementation commit hooks | Pass. Lefthook typecheck-fast, staged ESLint, and commitlint were not bypassed. |

The full suite passed before the final committed-document visibility guard. That guard then passed the focused main suite, final build, Moodle artifact run, and native UI artifact run. Other artifact checks were not repeated because their behavior does not depend on that guard. The final source simplification after these runs only removes redundant identity conditions on an already-filtered checkpoint and formats owner registration. Commit hooks checked the final source.

The measurement is one synthetic pool/restoration run, not a speedup or leak-freedom claim. It verifies the four-view cap, actual scroll restoration, protected imports, disconnect, and process-restart restoration. Host load was approximately 3 on 12 cores before this run. The script samples process working sets and does not establish a production memory distribution.

## Setup failures and limits

The clean worktree already had branch t3/app-tabs-fixes-3 at main, so creating it again was unnecessary. The required fast-forward to t3/app-tabs-fixes-2 succeeded at e33fa3cd. No merge conflict occurred.

Dependencies were absent. The first attempted baseline test reported that vitest was missing. pnpm install --frozen-lockfile completed, then the baseline tests ran and failed as intended. The first full suite encountered an Electron binary installation race and a jsdom dialog fixture without layout. Electron installation completed, the fixture gained a visible rectangle, and the rerun passed. No Electron startup flake needed a retry.

During authoring, native UI fixture attempts failed because pagehide overwrote the injected restart state, then because a synthetic render-process-gone event omitted Electron's details argument. The fixture now blocks the stale pagehide write and emits the full event arguments. Those were harness fixes. The final unmutated native UI runs passed. Native UI mutation failures are retained in their own logs.

One Electron e2e ran at a time. Vitest always used forks and maxWorkers=2. Existing tracked screenshots and reports produced by other suites were restored to avoid rewriting prior evidence. The new native-picker capture and native pool result are in this directory.

School SSO, live hosted-provider authentication, physical trackpad input, and Windows/Linux input were not verified. selection-chat.mjs remains excluded as requested because of its known main failure. The known swipe-history native-focus failure remains unverified in this unattended session. This report does not claim native app-command Back is broken or fixed.

No independent reviewer was spawned in this implementation sub-agent turn, and no PR was opened. No command targeted /Users/vc/.t3/projects/vstudy-pro. Model the Domain shaped the choice to put completion on the history entry and distinguish completion from pending delivery. Deslop kept the change within existing managers, reducer, and shared schemas, with no narrating comments.

Dispatch ledger. All implementation and artifact verification stayed in-thread because this task assigns the implementation sub-agent role.

## Git

Branch is t3/app-tabs-fixes-3. Implementation HEAD is 9d38e6b13592b0526a1ae2f83d563a95e1920a05. The report and logs are committed separately. The final evidence commit's exact SHA is in the final handoff because a commit cannot contain its own hash.

## Output tails

### before

```text
       |                                                                                                                                                         ^
     12| });
     13|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/8]⎯


 Test Files  2 failed (2)
      Tests  8 failed | 32 passed (40)
   Start at  20:42:08
   Duration  4.57s (transform 236ms, setup 0ms, import 376ms, tests 4.29s, environment 297ms)

```

### before-extra

```text
 ❯ src/renderer/shell/tab-state.ts:45:19
 ❯ tabReducer src/renderer/shell/tab-state.ts:38:50
 ❯ src/renderer/shell/tab-state.test.ts:65:8

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/8]⎯


 Test Files  3 failed (3)
      Tests  8 failed | 47 passed (55)
   Start at  20:44:05
   Duration  4.56s (transform 265ms, setup 0ms, import 408ms, tests 4.32s, environment 0ms)

```

### before-card

```text
 ❯ ../../node_modules/.pnpm/@testing-library+dom@10.4.2/node_modules/@testing-library/dom/dist/query-helpers.js:86:33
 ❯ src/renderer/courses/webview-pane.test.tsx:85:31


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
   Start at  20:46:49
   Duration  2.08s (transform 239ms, setup 0ms, import 584ms, tests 1.17s, environment 274ms)

```

### before-schema

```text

 ❯ src/shared/app-tabs.test.ts:34:50


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
   Start at  20:49:24
   Duration  105ms (transform 38ms, setup 0ms, import 52ms, tests 5ms, environment 0ms)

```

### before-blank

```text
       |                                     ^
    368| });
    369|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 35 skipped (36)
   Start at  20:52:37
   Duration  427ms (transform 217ms, setup 0ms, import 308ms, tests 61ms, environment 0ms)

```

### mutation-checkpoint

```text
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

electronApplication.evaluate: Error: Stale renderer checkpoint replaced requested target
    at eval (eval at evaluate (:290:30), <anonymous>:7:66)
    at async <anonymous>:316:30
    at /Users/vc/.t3/worktrees/vstudy-pro/t3-48d6ea52/apps/desktop/e2e/moodle-webview.mjs:126:15

Node.js v26.9.0

Mutation exit 1
```

### mutation-dirty

```text
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

electronApplication.evaluate: Error: Same-document navigation lost draft protection
    at eval (eval at evaluate (:290:30), <anonymous>:11:86)
    at async <anonymous>:316:30
    at /Users/vc/.t3/worktrees/vstudy-pro/t3-48d6ea52/apps/desktop/e2e/moodle-webview.mjs:126:15

Node.js v26.9.0

Mutation exit 1
```

### typecheck

```text

> @vstudy/desktop@0.3.0 typecheck /Users/vc/.t3/worktrees/vstudy-pro/t3-48d6ea52/apps/desktop
> node scripts/generate-locales.mjs && tsc --noEmit

Locale registry ready at /Users/vc/.t3/worktrees/vstudy-pro/t3-48d6ea52/apps/desktop/src/shared/locales.generated.ts (28 namespaces).
```

### lint

```text

> @vstudy/desktop@0.3.0 lint /Users/vc/.t3/worktrees/vstudy-pro/t3-48d6ea52/apps/desktop
> eslint .

```

### tests-final

```text
base64: 0.09 ms
identifier: 0.14 ms
dotted: 0.15 ms
quotes: 0.63 ms
(node:58608) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 will-download listeners added to [EventEmitter]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
(Use `node --trace-warnings ...` to show where the warning was created)

 Test Files  299 passed | 7 skipped (306)
      Tests  2693 passed | 20 skipped (2713)
   Start at  20:51:23
   Duration  77.49s (transform 3.23s, setup 0ms, import 27.97s, tests 94.05s, environment 16.91s)

```

### final-main

```text

 RUN  v4.1.12 /Users/vc/.t3/worktrees/vstudy-pro/t3-48d6ea52/apps/desktop


 Test Files  1 passed (1)
      Tests  36 passed (36)
   Start at  20:52:53
   Duration  2.74s (transform 192ms, setup 0ms, import 276ms, tests 2.42s, environment 0ms)

```

### final-focused

```text

 RUN  v4.1.12 /Users/vc/.t3/worktrees/vstudy-pro/t3-48d6ea52/apps/desktop


 Test Files  4 passed (4)
      Tests  54 passed (54)
   Start at  20:50:05
   Duration  2.64s (transform 387ms, setup 0ms, import 844ms, tests 2.52s, environment 262ms)

```

### build-final

```text
../../out/renderer/assets/gml-DZNfK0kX.js                              62.37 kB
../../out/renderer/assets/isbl-Bqh-08st.js                             72.60 kB
../../out/renderer/assets/mathematica-v2UNGWw6.js                     124.82 kB
../../out/renderer/assets/math-plugins-BozazKdw.js                    276.12 kB
../../out/renderer/assets/terminal-1IJmGVea.js                        333.59 kB
../../out/renderer/assets/index-MEbwuZhH.js                         2,518.45 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 2.59s
```

### moodle-webview-final

```text
PASS. Real WebContentsView autologin POST established an HttpOnly cookie. Remote content has no Node, preload, or desktop bridge.
PASS. Back navigation works. Same-school window.open reuses the controlled view without another window.
PASS. An external page prompts for native confirmation with a redacted link. Cancel leaves it inside the current school page. Copied links omit session credentials.
PASS. The module sheet renders sanitized content before View original page. Closing the native tab returns to the course tab.
PASS. The school page keeps its own colors and receives no injected app theme. Native content screenshots are separate from Chromium toolbar screenshots.
PASS. Closing destroys the view. Reopening reuses the account cookie and does not request another autologin key.
PASS. Another account partition has no school cookie. Simulated Chromium certificate failure displays a non-bypassable error.
PASS. pluginfile.md is streamed through the real DocumentService, SQLite, and reader without saving to Downloads.
PASS. Login redirect triggers one session recovery attempt. The six-minute cooldown prevents a second key request and displays Reconnect timing.
```

### app-tabs

```text
PASS three tabs, workspace strip visible, click and keyboard switching, one panel
PASS middle click and Cmd/Ctrl+W close with neighbor selection and restored reader mode
PASS keyboard and pointer reorder, restart restores order and active tab, only active view mounted
PASS five native tabs stay within four views, retain scroll, protect imports, and disconnect
```

### native-ui-final

```text
PASS real renderer and strict IPC target replacement, picker/sidebar visibility, import Back, hosted sync race
```

### a11y-regressions

```text
{"audits":144,"failures":[]}
```

### i18n

```text
en: live language switch, chat/picker/settings, 720/900/1200 light/dark passed
zh-Hant: live language switch, chat/picker/settings, 720/900/1200 light/dark passed
ja: live language switch, chat/picker/settings, 720/900/1200 light/dark passed
Screenshots: /var/folders/m_/hlq7_f2j6wn88q4c28hvjl1m0000gn/T/vstudy-i18n
```

### history-startup-regressions

```text
PASS Electron History filtering, empty results, pagination focus/scroll, silent refresh and render-failure retry.
PASS Electron initial reload and close settles startup, confirms restore and reopens on activate.
```

### chat-history

```text
PASS History: real general chat, CJK search, safe text, rename, pin, archive/delete undo, keyboard navigation, message jump, Cmd/Ctrl+K, en/zh-Hant/ja
```

### chat-controls

```text
PASS chat controls: IME, options, copy, regenerate usage, error/retry, dark mode
```

### measurement

```text
    },
    {
      "cycle": 20,
      "liveViews": 3,
      "rendererWorkingSetKiB": 585456
    }
  ],
  "importProtected": true,
  "disconnected": true,
  "fullRestartRestoredTabs": 5,
  "fullRestartLiveViews": 1
}
```

### swipe-history

```text
PASS platform history shortcuts navigate
PASS Alt+Left and Alt+Right route through the same actions
PASS mouse buttons 3 and 4 navigate
AssertionError [ERR_ASSERTION]: native shell WebContents acquired focus before app-command
    at file:///Users/vc/.t3/worktrees/vstudy-pro/t3-48d6ea52/apps/desktop/e2e/swipe-history.mjs:118:12 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}
```

### security

```text

/Users/vc/.t3/worktrees/vstudy-pro/t3-48d6ea52/apps/desktop/src/main/ipc/index.ts
  92:190  warning  Electron recommendation 15 (Do not use shell.openExternal with untrusted content) requires shell.openExternal URLs to be explicit literals with allowlisted protocols  electron-security/no-open-external-with-dynamic-url

/Users/vc/.t3/worktrees/vstudy-pro/t3-48d6ea52/apps/desktop/src/main/moodle/sso-protocol.ts
  14:59  warning  Electron recommendation 15 (Do not use shell.openExternal with untrusted content) requires shell.openExternal URLs to be explicit literals with allowlisted protocols  electron-security/no-open-external-with-dynamic-url

/Users/vc/.t3/worktrees/vstudy-pro/t3-48d6ea52/apps/desktop/src/main/moodle/webview.ts
  308:89  warning  Electron recommendation 15 (Do not use shell.openExternal with untrusted content) requires shell.openExternal URLs to be explicit literals with allowlisted protocols  electron-security/no-open-external-with-dynamic-url

✖ 3 problems (0 errors, 3 warnings)

```

### implementation-commit

```text
✓ lint-staged (0.70 seconds)
✓ typecheck (6.44 seconds)
[38;2;56;56;56m╭──────────────────────────────────────╮[m
[38;2;56;56;56m│[m lefthook  v2.2.2   hook:  [1mcommit-msg[m [38;2;56;56;56m│[m
[38;2;56;56;56m╰──────────────────────────────────────╯[m
┃  conventional ❯

[38;2;56;56;56m  ────────────────────────────────────[m
summary: (done in 0.59 seconds)
✓ conventional (0.59 seconds)
[t3/app-tabs-fixes-3 9d38e6b1] fix(tabs): preserve import delivery and native restore identity
 21 files changed, 179 insertions(+), 54 deletions(-)
```
