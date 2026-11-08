# App tab fixes, round 4

The goal is to prepare VStudy Pro in apps/desktop for shipping Safari-style multi-tab support. The owner authorized merge and release. This implementation sub-agent fixes the remaining third-review findings before that handoff. Nothing was pushed or released.

The change retains per-tab RouteHistory, the keyed native pool, strict IPC and trusted senders, main-owned resource keys, redacted IPC and persisted URLs, and private real URLs in memory.

## Finding results

Paths below are relative to apps/desktop/src unless stated otherwise. All eight supplied findings were verified. The brief calls this four bugs but lists eight items. All eight are addressed.

| Finding | Result and code evidence | Regression | Failed before |
| --- | --- | --- | --- |
| 1 | Fixed. main/moodle/webview.ts:126 drops renderer checkpoint.url entirely. Only matching account and requested identity restore zoom and scroll. Line 133 retains the real requested URL unless restoring a main-owned private checkpoint. | Two main tests assert the actual loadURL argument for matching requestedUrl with a different URL, and a target containing sesskey and returnurl. Existing private-discard restoration remains covered. | Yes. Both fail in before.log. |
| 2 | Fixed. renderer/shell/tab-state.ts:42 only marks file targets. shell/index.tsx:197 applies the same guard. main/moodle/webview.ts:100 drops supplied page markers and line 127 drops restored page markers. courses/webview-pane.tsx:120 restricts the card to file targets. | Reducer, main, and renderer page-card regressions. | Yes. before.log and before-page-card.log. |
| 3 | Fixed. main/moodle/webview.ts:58 permits disconnected account lookup only for a completed file. Line 183 returns ready before account status or auth.ensure. Existing completed file opens also skip ensure. Keepalive excludes local imported-file cards. | Disconnected account opens directly in ready state with the document ID and no auth.ensure call. | Yes. before.log throws session-expired in account(). |
| 4 | Fixed. shell/index.tsx:197 returns saveTabs success. courses/webview-pane.tsx:63 only acknowledges after success. It still navigates to the document after a failed save, leaving delivery pending. | Real AppShell plus MoodleWebviewPane integration uses failing Storage.setItem and asserts navigation without ack. A successful control checks persistence and ack. | Yes. before-import-corrected.log fails the failed-storage case. |
| 5 | Fixed. shell/index.tsx:197 compares the expected Moodle account and target against the current history entry before recording. | Moves to another file entry, then submits the old entry's completion and asserts false with no new marker. | Yes. before-import-corrected.log. |
| 6 | Fixed. main/moodle/webview.ts:302 uses load-failed before any document has committed. The existing error UI provides Reload. | Stop before commit returns error, then Reload invokes loadURL again. | Yes. before.log returns ready instead of a recoverable error. |
| 7 | Fixed. shell/tab-strip.tsx:34 and :36 handle each sync rejection independently, preserving the stale-effect guard between calls. | Rejected Moodle sync still sends hosted-chat sync. Existing stale membership race test passes. | Yes. before.log shows hosted sync was skipped. |
| 8 | Fixed. e2e/moodle-webview.mjs:138 seeds only an unmarked file route, runs the production renderer and strict IPC import, asserts persistence and ack, fully restarts Electron, goes Back, and checks the card and unchanged file-request count. | e2e/app-tabs-native-ui.mjs runs the whole import-to-restart chain. | Mutation removes the production recordMoodleImport call while keeping ack enabled. mutation-record-import-ack.log fails at the real marker assertion. |

The initial regression run had ten failures. One successful-storage control initially lacked scrollTop in its fixture, so its presentation could not be persisted. That fixture was corrected. The corrected baseline run has two intended failures and one passing control. The new page-card regression was also run separately against the old renderer. Baseline production files were restored immediately afterward. Both mutation variants were restored before final verification.

## Implementation choices

The data shape remains a Moodle history entry with an optional completed document ID. Pending delivery is separate main state. recordMoodleImport now returns a persistence result and accepts the originating route. No IPC field or schema was added.

Model the Domain shaped the choice to keep completion on file history entries and pending delivery in main. Deslop kept the fixes in the existing manager, reducer, and renderer callback. There are no new narrating comments or production abstractions.

The throughput checkpoint was to reproduce with small unit and renderer tests first, then run one built Electron fixture at a time. Dependency installation and static checks ran independently. This sub-agent performed its own implementation and checks. No further agent or independent review was started, and no PR was opened.

## Verification

| Check | Result |
| --- | --- |
| pnpm typecheck | Pass. typecheck-final.log. |
| pnpm lint | Pass. lint-final.log. |
| Full renderer, shared, main Vitest suite with forks and maxWorkers=2 | Pass on retry. 300 files, 2705 tests. Existing 7 files and 20 tests skipped. tests-final.log. |
| Final focused regressions | Pass. 5 files, 63 tests. focused-final.log. |
| pnpm build | Pass. build-final.log. Existing large-chunk advisory. |
| node e2e/moodle-webview.mjs | Pass. moodle-webview.log. |
| node e2e/app-tabs.mjs | Pass. app-tabs-final.log. |
| node e2e/app-tabs-native-ui.mjs | Pass, including real import and full restart. app-tabs-native-ui-final.log. |
| node e2e/a11y-regressions.mjs | Pass on retry. 144 audits, zero failures. a11y-regressions-retry.log. |
| node e2e/i18n.mjs | Pass for en, zh-Hant, ja. i18n-final.log. |
| node e2e/history-startup-regressions.mjs | Pass. history-startup-regressions-final.log. |
| node e2e/chat-history.mjs | Pass. chat-history-final.log. |
| node e2e/chat-controls.mjs | Pass. chat-controls-final.log. |
| node scripts/measure-native-tabs.mjs 5 | Pass. measurement.log. Five restored tabs, one live view after restart, pool capacity and protected import assertions pass. |
| pnpm security:static from repository root | Pass. Zero errors, three existing warnings. security.log. |
| Production marker-call mutation | Fails as intended at marker persistence assertion. mutation-record-import-ack.log. |
| Normal commit hooks | Pass. typecheck-fast, staged ESLint, commitlint. commit.log. |
| swipe-history.mjs and selection-chat.mjs | Skipped as requested. |

The full suite passed before the final narrowing of the local-card keepalive exclusion and a test-mock typing cleanup. The final focused tests, typecheck, lint, implementation commit hooks, and final build then passed. The native measurement builds the changed main manager directly from final source. No broad suite was repeated after those focused checks.

## Limits and setup

The requested branch already existed and was checked out at main. Creating it reported that it already existed. The required fast-forward merge to t3/app-tabs-fixes-3 succeeded at ac646123. Dependencies were absent, so pnpm install --frozen-lockfile ran.

The first full suite hit an Electron binary installation race and failed one test file. The rerun passed. The first accessibility run failed with ERR_FILE_NOT_FOUND while a rebuild replaced the output files. This was verification interference caused by this run, and its log is retained. No Electron startup flake required a retry.

swipe-history.mjs and selection-chat.mjs were skipped as requested. Live school SSO, real hosted-provider authentication, physical trackpad input, and Windows/Linux behavior remain unverified. The native measurement is one synthetic pool and restoration run. It is not a speedup or production memory claim. Host load before the run was 3.42 on 12 cores. Its assertions check work happened, native-view capacity, last-polled scroll restoration, protected imports, disconnect, and restart restoration.

No command targeted /Users/vc/.t3/projects/vstudy-pro. Prior suites' tracked screenshots and reports are restored before handoff. New round-4 logs and the native-picker capture are retained here.

## Git

Branch is t3/app-tabs-fixes-4. Implementation HEAD is 072ccbb61a0798e232e1ff4347a8e1e0f8ee7ee9. The final evidence commit follows it. Its exact HEAD is in the final handoff because a commit cannot embed its own SHA.

Dispatch ledger. Implementation and verification ran in-thread because the user assigned the implementation sub-agent role. Independent merge and release decisions remain with the parent agent.

## Output tails

### before.log

```text
       |                         ^
     33| });
     34|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/10]⎯


 Test Files  4 failed (4)
      Tests  10 failed | 45 passed (55)
   Start at  21:23:13
   Duration  2.96s (transform 355ms, setup 0ms, import 772ms, tests 2.76s, environment 407ms)

```

### before-import-corrected.log

```text
       |                ^
     47| });
     48|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
   Start at  21:24:57
   Duration  731ms (transform 215ms, setup 0ms, import 392ms, tests 95ms, environment 188ms)

```

### before-page-card.log

```text

 ❯ src/renderer/courses/webview-pane.test.tsx:92:96


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
   Start at  21:25:44
   Duration  1.24s (transform 365ms, setup 0ms, import 768ms, tests 213ms, environment 197ms)

```

### mutation-record-import-ack.log

```text

AssertionError [ERR_ASSERTION]: production renderer persisted the real file import marker
    at file:///Users/vc/.t3/worktrees/vstudy-pro/t3-8cc1b9af/apps/desktop/e2e/moodle-webview.mjs:147:12 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: undefined,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v26.9.0
```

### typecheck-final.log

```text

> @vstudy/desktop@0.3.0 typecheck /Users/vc/.t3/worktrees/vstudy-pro/t3-8cc1b9af/apps/desktop
> node scripts/generate-locales.mjs && tsc --noEmit

Locale registry ready at /Users/vc/.t3/worktrees/vstudy-pro/t3-8cc1b9af/apps/desktop/src/shared/locales.generated.ts (28 namespaces).
```

### lint-final.log

```text

> @vstudy/desktop@0.3.0 lint /Users/vc/.t3/worktrees/vstudy-pro/t3-8cc1b9af/apps/desktop
> eslint .

```

### tests-final.log

```text
base64: 0.09 ms
identifier: 0.15 ms
dotted: 0.16 ms
quotes: 0.60 ms
(node:94431) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 will-download listeners added to [EventEmitter]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
(Use `node --trace-warnings ...` to show where the warning was created)

 Test Files  300 passed | 7 skipped (307)
      Tests  2705 passed | 20 skipped (2725)
   Start at  21:27:07
   Duration  75.74s (transform 2.86s, setup 0ms, import 28.18s, tests 89.41s, environment 17.69s)

```

### focused-final.log

```text

 RUN  v4.1.12 /Users/vc/.t3/worktrees/vstudy-pro/t3-8cc1b9af/apps/desktop


 Test Files  5 passed (5)
      Tests  63 passed (63)
   Start at  21:28:20
   Duration  2.94s (transform 511ms, setup 0ms, import 1.32s, tests 2.97s, environment 592ms)

```

### build-final.log

```text
../../out/renderer/assets/gml-DhYNaX7S.js                              62.37 kB
../../out/renderer/assets/isbl-BH-z8dn-.js                             72.60 kB
../../out/renderer/assets/mathematica-DCm13nQf.js                     124.82 kB
../../out/renderer/assets/math-plugins-DrT7lC8E.js                    276.12 kB
../../out/renderer/assets/terminal-RJMQdaPi.js                        333.59 kB
../../out/renderer/assets/index-C9NkbhBF.js                         2,518.80 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 3.16s
```

### moodle-webview.log

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

### app-tabs-final.log

```text
PASS three tabs, workspace strip visible, click and keyboard switching, one panel
PASS middle click and Cmd/Ctrl+W close with neighbor selection and restored reader mode
PASS keyboard and pointer reorder, restart restores order and active tab, only active view mounted
PASS five native tabs stay within four views, retain scroll, protect imports, and disconnect
```

### app-tabs-native-ui-final.log

```text
PASS real renderer and strict IPC target replacement, picker/sidebar visibility, import Back, hosted sync race
```

### a11y-regressions-final.log

```text
    triggerUncaughtException(
    ^

page.reload: net::ERR_FILE_NOT_FOUND
Call log:
[2m  - waiting for navigation until "load"[22m

    at /Users/vc/.t3/worktrees/vstudy-pro/t3-8cc1b9af/apps/desktop/e2e/a11y-regressions.mjs:23:432 {
  name: 'Error'
}

Node.js v26.9.0
```

### i18n-final.log

```text
en: live language switch, chat/picker/settings, 720/900/1200 light/dark passed
zh-Hant: live language switch, chat/picker/settings, 720/900/1200 light/dark passed
ja: live language switch, chat/picker/settings, 720/900/1200 light/dark passed
Screenshots: /var/folders/m_/hlq7_f2j6wn88q4c28hvjl1m0000gn/T/vstudy-i18n
```

### history-startup-regressions-final.log

```text
PASS Electron History filtering, empty results, pagination focus/scroll, silent refresh and render-failure retry.
PASS Electron initial reload and close settles startup, confirms restore and reopens on activate.
```

### chat-history-final.log

```text
PASS History: real general chat, CJK search, safe text, rename, pin, archive/delete undo, keyboard navigation, message jump, Cmd/Ctrl+K, en/zh-Hant/ja
```

### chat-controls-final.log

```text
PASS chat controls: IME, options, copy, regenerate usage, error/retry, dark mode
```

### measurement.log

```text
    },
    {
      "cycle": 20,
      "liveViews": 3,
      "rendererWorkingSetKiB": 579088
    }
  ],
  "importProtected": true,
  "disconnected": true,
  "fullRestartRestoredTabs": 5,
  "fullRestartLiveViews": 1
}
```

### security.log

```text

/Users/vc/.t3/worktrees/vstudy-pro/t3-8cc1b9af/apps/desktop/src/main/ipc/index.ts
  92:190  warning  Electron recommendation 15 (Do not use shell.openExternal with untrusted content) requires shell.openExternal URLs to be explicit literals with allowlisted protocols  electron-security/no-open-external-with-dynamic-url

/Users/vc/.t3/worktrees/vstudy-pro/t3-8cc1b9af/apps/desktop/src/main/moodle/sso-protocol.ts
  14:59  warning  Electron recommendation 15 (Do not use shell.openExternal with untrusted content) requires shell.openExternal URLs to be explicit literals with allowlisted protocols  electron-security/no-open-external-with-dynamic-url

/Users/vc/.t3/worktrees/vstudy-pro/t3-8cc1b9af/apps/desktop/src/main/moodle/webview.ts
  315:89  warning  Electron recommendation 15 (Do not use shell.openExternal with untrusted content) requires shell.openExternal URLs to be explicit literals with allowlisted protocols  electron-security/no-open-external-with-dynamic-url

✖ 3 problems (0 errors, 3 warnings)

```

### commit.log

```text
✓ typecheck (7.46 seconds)
[38;2;56;56;56m╭──────────────────────────────────────╮[m
[38;2;56;56;56m│[m lefthook  v2.2.2   hook:  [1mcommit-msg[m [38;2;56;56;56m│[m
[38;2;56;56;56m╰──────────────────────────────────────╯[m
┃  conventional ❯ 

[38;2;56;56;56m  ────────────────────────────────────[m
summary: (done in 0.63 seconds)
✓ conventional (0.63 seconds)
[t3/app-tabs-fixes-4 072ccbb6] fix(tabs): preserve targets and persist completed file imports
 11 files changed, 133 insertions(+), 24 deletions(-)
 create mode 100644 apps/desktop/src/renderer/shell/import-delivery.test.tsx
```

### a11y-regressions-retry.log

```text
{"audits":144,"failures":[]}

```
