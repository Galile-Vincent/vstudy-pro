# App tab review fix round

The goal is Safari-style multi-tab support in VStudy Pro, an Electron and React app in apps/desktop. Users should keep courses, Moodle homework pages, documents, and AI chats open together, switch without losing their place, and retain bounded memory with a clear UI.

This is one implementation fix round on the completed three-stage branch. The fixes retain per-tab RouteHistory, the keyed native pool, strict IPC schemas, trusted-sender checks, and ownership keys built in main. This round remains incomplete because the redundant local chat runtime in finding 16b remains open. The swipe-history verification also fails at its native app-command check on both attempts.

## Findings

Paths below are relative to apps/desktop/src. Tests are in the corresponding module's .test.ts or .test.tsx unless named otherwise. The before runs restore production files from ab3e3f28 while retaining new tests, then restore the fixes. before-final.log records 26 failing assertions and 104 passing assertions. before-idle.log separately proves the idle-clock regression, with one failing assertion. final-focused.log records all 130 tests passing.

| Finding | Verdict and code evidence | Regression evidence | Failed before fix |
| --- | --- | --- | --- |
| 1 | Fixed. main/moodle/webview.ts:114 compares account and requested URL before reusing a resource. Checkpoints also require matching identity at line 117. | `replaces a tab when its requested Moodle target changes`; native-ui.log tests real renderer history navigation in the same tab. | Yes. |
| 2 | Fixed. main/moodle/webview.ts:270 consumes documentId on delivery. Its in-memory checkpoint retains completed-import state and load at line 182 suppresses replay. Explicit Reload or Reconnect remains an explicit request to import again. | `delivers an imported document once across reopening`; `does not replay an app file import after discard`; native UI Back assertion remains on Moodle. | Yes. |
| 3 | Fixed with a conservative policy. main/native-dirty.ts:2 names the ten-minute protection interval. Both native managers use it. Hosted committed navigation clears dirty state. shared/web-chat.ts admits a resource-limit state, and renderer/web-chat/index.tsx renders the existing resource-limit message. | Four `protects draft edits` cases cover paste, cut, Backspace, Delete and expiry; `returns a resource-limit state when every live draft is protected`. | Yes. |
| 4 | Fixed. main/web-chat/views.ts:44 loads the safe checkpoint URL when ensure encounters an errored pane. | `retries a failed hosted page on ensure`. | Yes. |
| 5 | Fixed. renderer/shell/tab-strip.tsx:28 keys polling by tab membership; line 35 checks cancellation between awaits. Shell's duplicate sync effect was removed. Polling remains authoritative rather than read-only. | `does not send a stale destructive chat sync after awaiting Moodle`; native UI rapidly opens and closes Home tabs and retains the hosted WebContents ID. | Yes. |
| 6 | Fixed. main/web-chat/views.ts:77 only forwards shortcuts from the primary view. | `does not forward app tab shortcuts from an OAuth child`. | Yes. |
| 7 | Fixed. main/navigation-input.ts uses BracketLeft and BracketRight codes for shifted tab cycling. | Two `forwards shifted bracket` cases use realistic key `}` and `{` values. | Yes. |
| 8 | Fixed. main/web-chat/views.ts:119 touches the pool when a visible pane becomes hidden. | `starts idle time when a used chat is hidden` uses a controlled pool clock and a twenty-minute active interval. | Yes, in before-idle.log. |
| 9 | Fixed. main/web-chat/views.ts:148 deletes provider checkpoints and broadcasts a provider-only event. Preload validates the enum. renderer/shell/index.tsx resets matching presentations; HostedChat clears its initial restore URL before reopening. | `drops cleared provider checkpoints and broadcasts a renderer reset`. This checks main's reset notification and subsequent home URL; renderer handlers also passed typecheck and the broad suite. | Yes. |
| 10 | Fixed. main/moodle/webview.ts:210 keeps the full committed URL in memory while state exposes its redacted copy. main/moodle/webview-policy.ts refuses tokenpluginfile.php path credentials. | `reloads the private committed URL while exposing only its public copy`; `refuses tokenpluginfile paths containing embedded credentials`. | Yes. |
| 11 | Fixed. renderer/shell/history-swipe-navigation.tsx:10 is the shared predicate used by both native renderers. It covers tab menus, popovers, sidebar overlays and dialogs. Moodle observes the sidebar and visibility attributes too. | native-overlay.test.tsx covers menus, popovers, sidebar and hidden ancestors; native UI asserts picker and responsive sidebar actually hide the view. | Yes. |
| 12 | Fixed. main/moodle/webview.ts:131 installs one owner cleanup that survives resource discard. closeOwner at line 312 clears checkpoints, errors and generations. closeResource at line 319 stops keepalive when the last account view closes. Ensure restarts it. Hosted dispose also handles owners with only checkpoints. | `keeps owner cleanup after discard until the owner is destroyed`; `stops account keepalive ...`; `removes owner listeners on dispose after every pane was discarded`. | Yes. |
| 13 | Resolved using the review's last-polled-value option. main/moodle/webview.ts:248 saves the last completed poll and removes the dead asynchronous sample immediately before close. | native-tabs-fixture.mjs scrolls to 800, completes a poll, then scrolls to 1200 before discard and expects restoration to 800. measurement.log passes. This deliberately documents bounded scroll loss. | No. This removes ineffective work and documents existing best-effort behavior. |
| 14 | Fixed. main/native-tab-pool.ts:39 catches destroyed-WebContents process ID lookups at every metric evaluation lookup. | `tolerates a process destroyed between metric ticks`. | Yes. |
| 15 | Fixed. main at 47b6af89 called guard on a login redirect from keepalive, which silently retried auth once. main/moodle/webview.ts:228 restores one forced account auth attempt and a second probe before broadcasting expiry. Existing auth budgets still apply. | `silently reauthenticates after a failed keepalive probe`. | Yes. |
| 16 | 16a is not reproduced. `offers one retry control for a resource-limited pane` passes on ab3e3f28. renderer/courses/webview-pane.tsx:72 returns before assigning an ID on resource-limit, so later polling/layout cannot set failed for that admission. No Retry change was retained. 16b is confirmed and deferred. renderer/chat.tsx:145 unconditionally creates a local runtime even when session.runtime exists at line 146. | The Retry regression test passes on old and new code. Removing the extra runtime requires splitting standalone and host-backed rendering while preserving the many standalone Chat tests. That component refactor was not made in this round. | No for 16a. No new runtime regression test for deferred 16b. |
| 17 | Fixed. renderer/shell/index.tsx:122 checks the cap before capture or transient-route changes, returns false, and emits local limit feedback. TabStrip opens its existing limit picker. | `shows the existing limit message for attempts outside the picker`; existing reducer cap tests remain green. | Yes for feedback. The no-capture guard was checked in code rather than a dedicated shell test. |
| 18 | Fixed. renderer/shell/tab-state.ts:62 retries storage once without inactive drafts and document anchors. It preserves the active tab and does not mutate in-memory state. docs/SECURITY.md documents plaintext localStorage. | `retries quota failures without inactive drafts and anchors`. | Yes. |

## Dirty policy and scroll decision

`NATIVE_DRAFT_PROTECTION_MS = 10 * 60_000` bounds protection since the last edit-like key. Paste, cut, Backspace, Delete, and unmodified printable keys renew protection. Committed main-frame navigation clears it. The input event does not identify the DOM target, so printable keys, including Space-to-scroll, remain conservatively protected. There is no injected guest DOM inspection. Active views remain protected by the pool independently of this timeout. A background unsent draft can be discarded after the timeout; this is the explicit bounded policy selected in this round.

Scroll restoration uses the most recent completed visible-tab poll. It does not promise the final scroll coordinate at destruction. The fixture now changes scroll after that poll and asserts the documented checkpoint rather than claiming a successful final sample.

## Renderer and IPC coverage

`node e2e/app-tabs-native-ui.mjs` runs the real built renderer against the local Moodle fixture with the real strict request/response schemas and sender checks. It does not replace sync with a no-op. Its checks cover same-tab X-to-Y history navigation, picker and responsive sidebar hiding, Back after import, and a hosted pane surviving rapid tab creation and closure. The hosted check verifies WebContents identity, not successful remote authentication.

`VSTUDY_MUTATE_NATIVE_UI=1 node e2e/app-tabs-native-ui.mjs` changes the expected target to id=999. native-ui-mutation.log records exit 1 at `same tab displays its new target`. The unmutated run passes. native-picker.png records the DOM picker while the native view is hidden.

## Verification

All Vitest commands used `--pool=forks --maxWorkers=2` and `NODE_OPTIONS=--no-experimental-webstorage`. Our Electron scripts ran sequentially. Another worktree had an Electron accessibility run during early verification; its processes were left untouched. selection-chat.mjs was skipped as requested.

| Command | Result |
| --- | --- |
| pnpm typecheck | Pass. |
| pnpm lint | Pass. |
| Full renderer/shared/main Vitest run | Pass. 298 files passed, 7 skipped; 2679 tests passed, 20 skipped. |
| Focused final regressions | Pass. 9 files, 130 tests. |
| pnpm build | Pass with the existing large-chunk advisory. |
| node e2e/moodle-webview.mjs | Pass. |
| node e2e/app-tabs.mjs | Pass. |
| node e2e/app-tabs-native-ui.mjs | Pass, including hosted sync race. |
| node e2e/swipe-history.mjs | Fail twice at line 117, native app-command Back. Keyboard, mouse-button, overlay and early swipe checks passed before the timeout. Focus contention is a hypothesis, not a proven cause. |
| node e2e/a11y-regressions.mjs | Pass. 144 audits, no failures. |
| node e2e/i18n.mjs | Pass. |
| node e2e/history-startup-regressions.mjs | Pass. |
| node e2e/chat-history.mjs | Pass. |
| node e2e/chat-controls.mjs | Pass. |
| node scripts/measure-native-tabs.mjs 5 | Pass. Full restart restored five headers and one live view. Twenty allocation/discard cycles completed. This is a synthetic memory sanity check, not a speedup or leak-freedom claim. |
| pnpm security:static at repository root | Pass with three existing dynamic-external-URL warnings. |

The first broad suite encountered an Electron binary installation race and failed to import one suite. Dependencies were installed in this worktree, and subsequent broad runs passed. The first sidebar fixture attempted a viewport that did not meet the app's overlay-width rule; it now uses the app's real zoom and responsive behavior. These failed attempts were not counted as passes. The Vitest run emits a fixture MaxListenersExceededWarning; the run still exits zero.

No real school SSO, live hosted-provider authentication, physical trackpad, Windows/Linux input, or manual screen-reader session was verified. The final patch has no independent review verdict. This implementation sub-agent did not spawn reviewers or open a PR.

Model the Domain shaped the shared dirty timestamp policy and owner cleanup registry. Fix Root Causes moved identity checks to pane admission and removed duplicate sync ownership. Both leaf skills were read. Deslop review removed temporary code and retained the project's existing patterns.

## Git

The worktree started from main at 47b6af89. `git switch -c t3/app-tabs-fixes` and the required fast-forward to t3/app-tabs-restore at ab3e3f28 both succeeded.

Branch is `t3/app-tabs-fixes`. Implementation HEAD is `d94d5c6624410c37c8daf1112da619723f1da0fd` before this evidence commit. The final evidence commit's exact HEAD is in the final handoff because a commit cannot contain its own hash. Lefthook typecheck, lint-staged, and commitlint passed without bypasses. Nothing was pushed. No commands wrote to /Users/vc/.t3/projects/vstudy-pro.

Dispatch ledger. All work stayed in-thread because the brief assigns the implementation sub-agent role. Finding 16b and the failing native app-command verification require follow-up.

## Output tails

typecheck

```text

> @vstudy/desktop@0.3.0 typecheck /Users/vc/.t3/worktrees/vstudy-pro/t3-1625213d/apps/desktop
> node scripts/generate-locales.mjs && tsc --noEmit

Locale registry ready at /Users/vc/.t3/worktrees/vstudy-pro/t3-1625213d/apps/desktop/src/shared/locales.generated.ts (28 namespaces).
```

lint

```text

> @vstudy/desktop@0.3.0 lint /Users/vc/.t3/worktrees/vstudy-pro/t3-1625213d/apps/desktop
> eslint .

```

tests

```text
quotes: 0.58 ms

 Test Files  298 passed | 7 skipped (305)
      Tests  2679 passed | 20 skipped (2699)
   Start at  20:19:59
   Duration  76.02s (transform 2.85s, setup 0ms, import 24.53s, tests 86.64s, environment 13.97s)

```

final-focused

```text
(Use `node --trace-warnings ...` to show where the warning was created)

 Test Files  9 passed (9)
      Tests  130 passed (130)
   Start at  20:20:56
   Duration  2.76s (transform 630ms, setup 0ms, import 1.60s, tests 2.25s, environment 692ms)

```

build

```text
../../out/renderer/assets/index-D2VSeejR.js                         2,516.75 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 2.65s
```

native-ui

```text
PASS real renderer and strict IPC target replacement, picker/sidebar visibility, import Back, hosted sync race
```

native-ui-mutation

```text
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v26.9.0
```

swipe-history

```text
Call log:
[2m  - waiting for locator('.app-shell[data-view=library]') to be visible[22m

    at waitView (/Users/vc/.t3/worktrees/vstudy-pro/t3-1625213d/apps/desktop/e2e/swipe-history.mjs:67:74)
    at /Users/vc/.t3/worktrees/vstudy-pro/t3-1625213d/apps/desktop/e2e/swipe-history.mjs:117:130 {
  name: 'TimeoutError'
}
```

swipe-history-retry

```text
Call log:
[2m  - waiting for locator('.app-shell[data-view=library]') to be visible[22m

    at waitView (/Users/vc/.t3/worktrees/vstudy-pro/t3-1625213d/apps/desktop/e2e/swipe-history.mjs:67:74)
    at /Users/vc/.t3/worktrees/vstudy-pro/t3-1625213d/apps/desktop/e2e/swipe-history.mjs:117:130 {
  name: 'TimeoutError'
}
```

security

```text
  14:59  warning  Electron recommendation 15 (Do not use shell.openExternal with untrusted content) requires shell.openExternal URLs to be explicit literals with allowlisted protocols  electron-security/no-open-external-with-dynamic-url

/Users/vc/.t3/worktrees/vstudy-pro/t3-1625213d/apps/desktop/src/main/moodle/webview.ts
  308:89  warning  Electron recommendation 15 (Do not use shell.openExternal with untrusted content) requires shell.openExternal URLs to be explicit literals with allowlisted protocols  electron-security/no-open-external-with-dynamic-url

✖ 3 problems (0 errors, 3 warnings)

```

moodle-webview

```text
PASS. The school page keeps its own colors and receives no injected app theme. Native content screenshots are separate from Chromium toolbar screenshots.
PASS. Closing destroys the view. Reopening reuses the account cookie and does not request another autologin key.
PASS. Another account partition has no school cookie. Simulated Chromium certificate failure displays a non-bypassable error.
PASS. pluginfile.md is streamed through the real DocumentService, SQLite, and reader without saving to Downloads.
PASS. Login redirect triggers one session recovery attempt. The six-minute cooldown prevents a second key request and displays Reconnect timing.
```

app-tabs

```text
PASS three tabs, workspace strip visible, click and keyboard switching, one panel
PASS middle click and Cmd/Ctrl+W close with neighbor selection and restored reader mode
PASS keyboard and pointer reorder, restart restores order and active tab, only active view mounted
PASS five native tabs stay within four views, retain scroll, protect imports, and disconnect
```

a11y-regressions

```text
{"audits":144,"failures":[]}
```

i18n

```text
en: live language switch, chat/picker/settings, 720/900/1200 light/dark passed
zh-Hant: live language switch, chat/picker/settings, 720/900/1200 light/dark passed
ja: live language switch, chat/picker/settings, 720/900/1200 light/dark passed
Screenshots: /var/folders/m_/hlq7_f2j6wn88q4c28hvjl1m0000gn/T/vstudy-i18n
```

history-startup-regressions

```text
PASS Electron History filtering, empty results, pagination focus/scroll, silent refresh and render-failure retry.
PASS Electron initial reload and close settles startup, confirms restore and reopens on activate.
```

chat-history

```text
PASS History: real general chat, CJK search, safe text, rename, pin, archive/delete undo, keyboard navigation, message jump, Cmd/Ctrl+K, en/zh-Hant/ja
```

chat-controls

```text
PASS chat controls: IME, options, copy, regenerate usage, error/retry, dark mode
```

measurement

```text
  "importProtected": true,
  "disconnected": true,
  "fullRestartRestoredTabs": 5,
  "fullRestartLiveViews": 1
}
```
