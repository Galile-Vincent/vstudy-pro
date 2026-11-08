# App tab fixes, second round

The goal is Safari-style multi-tab support in VStudy Pro, an Electron and React app in apps/desktop. Users must be able to keep courses, homework, documents and AI chats open together without a Back navigation regression. This round also removes the redundant local runtime from hosted Chat.

Finding 16b is fixed. The Back failure is reproduced on both the original tab branch and the review-fix branch. It is not evidence of a regression in the review fixes. Native focus never becomes available during these runs. Swipe-history remains FAIL, and this round does not establish a green native app-command end-to-end result. Do not treat it as release clearance.

## Baseline comparison

Both commits were built locally with pnpm build before their two sequential, unmodified swipe-history runs. One Electron process ran at a time.

| Commit | Build | Swipe run 1 | Swipe run 2 |
| --- | --- | --- | --- |
| ab3e3f28, detached | Pass | Fail at line 117, native app-command Back | Fail at line 117, native app-command Back |
| 993e0eed, t3/app-tabs-fixes-2 before changes | Pass | Fail at line 117, native app-command Back | Fail at line 117, native app-command Back |
| e388f40a, final implementation | Pass | Fail at native focus assertion | Fail at native focus assertion |

Each run passed the preceding keyboard, mouse-button, Settings overlay, editable and early swipe checks. The failure already exists on ab3e3f28, so reverting review-fix hunks cannot bisect its introduction. d94d5c66 is the code commit and 993e0eed adds evidence. No hunk revert was justified after the baseline falsified the fix-round regression premise.

Logs are restore-build.log, restore-swipe-1.log, restore-swipe-2.log, fixes-build.log, fixes-swipe-1.log and fixes-swipe-2.log in this directory.

## Traced cause and scope

apps/desktop/src/main/navigation-input.ts:10 receives app-command. Line 11 returns when the owner WebContents is not focused. Otherwise lines 14 and 15 inject Alt+Left or Alt+Right. The renderer keyboard handler in src/renderer/shell/history-swipe-navigation.tsx forwards that to shell goHistory at src/renderer/shell/index.tsx:147. Its line 148 guards the 300 ms interval, overlays and available history.

There is no preload app-command subscription on this path. Preload's onTrackpadScrollBegin and onTrackpadScrollEnd subscriptions serve the separate trackpad boundary path.

The real-run trace records native window focus false, native contents focus false, DOM focus true, active element shell-content and zero queried overlays. No renderer keydown followed the app-command. Therefore the first observed rejection is main/navigation-input.ts:11, before the renderer overlay and 300 ms guards. The shared predicate and native shortcut forwarding are not implicated by these observations. focus-trace.txt records the compact trace.

The previous report's focus explanation is now supported for this run by native focus measurements. Why this macOS desktop session refuses activation is not established. A system inspection showed SecurityAgent owning secure input, which is an observation, not proof that it caused the failure. This report does not claim production Back is broken or fixed.

The harness previously accepted document.hasFocus as proof of native focus. e2e/swipe-history.mjs:116 now waits up to five seconds for the actual WebContents focus precondition. It fails with an explicit native-focus assertion instead of a misleading route timeout. Explicit app.show, window.show and regular activation policy experiments also failed to acquire native focus and were removed. The real handler and its guest-focus guard remain unchanged. No focus stub or skipped assertion was introduced. Two consecutive green swipe runs were not achieved.

## Hosted Chat runtime fix

On 993e0eed, renderer/chat.tsx:145 called useLocalRuntime unconditionally and line 146 preferred session.runtime. Hosted loading and ready states both created the unused runtime.

renderer/chat.tsx:174 selects a standalone child only for standalone sessions. The child at line 178 owns useLocalRuntime. Hosted sessions wait for the host runtime and render with that runtime. Runtime-dependent prompt and draft effects live in ChatRuntimeEffects at line 183 so hooks do not become conditional. Existing adapter, history, model controls and session disposal ownership remain in place.

chat-hosted-runtime.test.tsx checks that hosted loading and ready states never call useLocalRuntime, and that the hosted runtime receives the prompt. On the old Chat implementation it fails with Number of calls 2 at the first no-call assertion. runtime-before.log records the failure. chat-tests.log records 11 passing Chat test files and 43 passing tests after the fix. The test was committed before the production change.

## Verification

| Command | Result |
| --- | --- |
| `pnpm typecheck` | Pass. |
| `pnpm lint` | Pass. |
| `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run src/renderer src/shared src/main --pool=forks --maxWorkers=2` | Pass, 299 files and 2680 tests, 7 files and 20 tests skipped. |
| `pnpm build` | Pass. |
| `node e2e/swipe-history.mjs` | FAIL twice, native WebContents focus precondition. |
| `node e2e/app-tabs.mjs` | Pass. |
| `node e2e/app-tabs-native-ui.mjs` | Pass. |
| `node e2e/moodle-webview.mjs` | Pass. |
| `node e2e/a11y-regressions.mjs` | Pass. |
| `node e2e/i18n.mjs` | Pass. |
| `node e2e/history-startup-regressions.mjs` | Pass. |
| `node e2e/chat-history.mjs` | Pass. |
| `node e2e/chat-controls.mjs` | Pass. |
| `node scripts/measure-native-tabs.mjs 5` | Pass. |

The build emits the existing large-chunk advisory. Vitest emits the fixture MaxListenersExceededWarning but exits zero. The measurement is a synthetic pool and restoration sanity check, not a speedup or leak-freedom claim. It restored five tabs with one live view.

## Limits and workflow

The worktree started on main at 47b6af89. The requested new branch and fast-forward succeeded. Dependencies were absent, so the first build failed before testing. pnpm install --frozen-lockfile completed and the baseline build then passed. That failed setup attempt is not a swipe result. Electron downloaded its binary on first launch and did not require a startup retry.

An orphan Electron from another worktree had PPID 1 and had been alive for 48 minutes with no runner. It was terminated before the first baseline. No other Electron ran concurrently with these scripts. No writes targeted /Users/vc/.t3/projects/vstudy-pro, and nothing was pushed.

selection-chat.mjs was excluded as requested because of its known main delete-Undo bug. School SSO, live provider authentication, physical trackpad input and Windows/Linux input were not verified. No independent reviewer ran in this implementation sub-agent turn. No PR was opened.

Fix Root Causes shaped the decision to measure native focus before changing renderer guards. Model the Domain shaped the two runtime ownership modes and standalone child. Both leaf skills were read. Deslop checks retained the small component split and removed temporary instrumentation and unsuccessful activation workarounds.

Dispatch ledger. All work stayed in-thread because the user assigned the implementation sub-agent role.

## Git

Branch is t3/app-tabs-fixes-2. Implementation HEAD is e388f40a2f0843a63bcf1b75188ea14924c1645f. The failing regression test commit is cffc12f3. The report and logs are committed separately after verification. The evidence commit's final HEAD is in the final handoff because a commit cannot contain its own hash. Lefthook and commitlint ran without bypasses.

## Output tails

### restore-swipe-1

```text
PASS focused composer or text field blocks swipes begun inside it and history keys
PASS platform history shortcuts navigate
PASS Alt+Left and Alt+Right route through the same actions
PASS mouse buttons 3 and 4 navigate
locator.waitFor: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('.app-shell[data-view=library]') to be visible[22m

    at waitView (/Users/vc/.t3/worktrees/vstudy-pro/t3-ed8723be/apps/desktop/e2e/swipe-history.mjs:67:74)
    at /Users/vc/.t3/worktrees/vstudy-pro/t3-ed8723be/apps/desktop/e2e/swipe-history.mjs:117:130 {
  name: 'TimeoutError'
}
```

### restore-swipe-2

```text
PASS focused composer or text field blocks swipes begun inside it and history keys
PASS platform history shortcuts navigate
PASS Alt+Left and Alt+Right route through the same actions
PASS mouse buttons 3 and 4 navigate
locator.waitFor: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('.app-shell[data-view=library]') to be visible[22m

    at waitView (/Users/vc/.t3/worktrees/vstudy-pro/t3-ed8723be/apps/desktop/e2e/swipe-history.mjs:67:74)
    at /Users/vc/.t3/worktrees/vstudy-pro/t3-ed8723be/apps/desktop/e2e/swipe-history.mjs:117:130 {
  name: 'TimeoutError'
}
```

### fixes-swipe-1

```text
PASS focused composer or text field blocks swipes begun inside it and history keys
PASS platform history shortcuts navigate
PASS Alt+Left and Alt+Right route through the same actions
PASS mouse buttons 3 and 4 navigate
locator.waitFor: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('.app-shell[data-view=library]') to be visible[22m

    at waitView (/Users/vc/.t3/worktrees/vstudy-pro/t3-ed8723be/apps/desktop/e2e/swipe-history.mjs:67:74)
    at /Users/vc/.t3/worktrees/vstudy-pro/t3-ed8723be/apps/desktop/e2e/swipe-history.mjs:117:130 {
  name: 'TimeoutError'
}
```

### fixes-swipe-2

```text
PASS focused composer or text field blocks swipes begun inside it and history keys
PASS platform history shortcuts navigate
PASS Alt+Left and Alt+Right route through the same actions
PASS mouse buttons 3 and 4 navigate
locator.waitFor: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('.app-shell[data-view=library]') to be visible[22m

    at waitView (/Users/vc/.t3/worktrees/vstudy-pro/t3-ed8723be/apps/desktop/e2e/swipe-history.mjs:67:74)
    at /Users/vc/.t3/worktrees/vstudy-pro/t3-ed8723be/apps/desktop/e2e/swipe-history.mjs:117:130 {
  name: 'TimeoutError'
}
```

### runtime-before

```text
       |                                 ^
     27|     state.runtime={thread:{append:state.append,composer:{setText:vi.fn…
     28|     await act(()=>root.render(<Chat {...props} promptRequest={{id:2,te…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  20:29:30
   Duration  1.17s (transform 315ms, setup 0ms, import 802ms, tests 8ms, environment 304ms)

```

### chat-tests

```text

 RUN  v4.1.12 /Users/vc/.t3/worktrees/vstudy-pro/t3-ed8723be/apps/desktop


 Test Files  11 passed (11)
      Tests  43 passed (43)
   Start at  20:29:43
   Duration  4.30s (transform 720ms, setup 0ms, import 4.44s, tests 1.46s, environment 2.03s)

```

### typecheck

```text

> @vstudy/desktop@0.3.0 typecheck /Users/vc/.t3/worktrees/vstudy-pro/t3-ed8723be/apps/desktop
> node scripts/generate-locales.mjs && tsc --noEmit

Locale registry ready at /Users/vc/.t3/worktrees/vstudy-pro/t3-ed8723be/apps/desktop/src/shared/locales.generated.ts (28 namespaces).
```

### lint

```text

> @vstudy/desktop@0.3.0 lint /Users/vc/.t3/worktrees/vstudy-pro/t3-ed8723be/apps/desktop
> eslint .

```

### tests

```text
base64: 0.10 ms
identifier: 0.14 ms
dotted: 0.15 ms
quotes: 0.61 ms
(node:39680) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 will-download listeners added to [EventEmitter]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
(Use `node --trace-warnings ...` to show where the warning was created)

 Test Files  299 passed | 7 skipped (306)
      Tests  2680 passed | 20 skipped (2700)
   Start at  20:33:05
   Duration  68.74s (transform 2.96s, setup 0ms, import 25.19s, tests 82.48s, environment 15.16s)

```

### build

```text
../../out/renderer/assets/gml-Do07sftj.js                              62.37 kB
../../out/renderer/assets/isbl-DishWMRa.js                             72.60 kB
../../out/renderer/assets/mathematica-VkJVzkzR.js                     124.82 kB
../../out/renderer/assets/math-plugins-CKGkS14I.js                    276.12 kB
../../out/renderer/assets/terminal-ri9cvvWn.js                        333.59 kB
../../out/renderer/assets/index-DDZpM2yD.js                         2,516.98 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 2.69s
```

### swipe-history

```text
PASS platform history shortcuts navigate
PASS Alt+Left and Alt+Right route through the same actions
PASS mouse buttons 3 and 4 navigate
AssertionError [ERR_ASSERTION]: native shell WebContents acquired focus before app-command
    at file:///Users/vc/.t3/worktrees/vstudy-pro/t3-ed8723be/apps/desktop/e2e/swipe-history.mjs:118:12 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}
```

### app-tabs

```text
PASS three tabs, workspace strip visible, click and keyboard switching, one panel
PASS middle click and Cmd/Ctrl+W close with neighbor selection and restored reader mode
PASS keyboard and pointer reorder, restart restores order and active tab, only active view mounted
PASS five native tabs stay within four views, retain scroll, protect imports, and disconnect
```

### app-tabs-native-ui

```text
PASS real renderer and strict IPC target replacement, picker/sidebar visibility, import Back, hosted sync race
```

### moodle-webview

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
      "rendererWorkingSetKiB": 582912
    }
  ],
  "importProtected": true,
  "disconnected": true,
  "fullRestartRestoredTabs": 5,
  "fullRestartLiveViews": 1
}
```


### swipe-history-repeat

```text
PASS real Settings dialog blocks navigation
PASS focused composer or text field blocks swipes begun inside it and history keys
PASS platform history shortcuts navigate
PASS Alt+Left and Alt+Right route through the same actions
PASS mouse buttons 3 and 4 navigate
AssertionError [ERR_ASSERTION]: native shell WebContents acquired focus before app-command
    at file:///Users/vc/.t3/worktrees/vstudy-pro/t3-ed8723be/apps/desktop/e2e/swipe-history.mjs:118:12 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}
```
