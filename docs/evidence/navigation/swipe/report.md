Goal. Add native-feeling Back and Forward navigation through student page visits in the Electron app.

## Implementation

Inferred from the implementation. `apps/desktop/src/renderer/shell/navigation-history.ts` owns the pure entries-and-index model. `AppShell` owns its current snapshot and exposes `canGoBack`, `canGoForward`, `goBack`, and `goForward` through the existing navigation context. Entries cap at 50, consecutive equal routes deduplicate, new navigation drops forward entries, and history traversal applies an entry without pushing. Welcome is excluded. `connectSchool` and `aiParse` are stripped from history and persisted routes.

Measured by focused tests. Branching, bounds, deduplication, the 50-entry cap, transient flags, axis lock, threshold, reversal, momentum, blocked gestures, indicator states, scroller boundaries, native event filtering, and transition cleanup pass.

Inferred from the patch. Model the Domain shaped the route stack and gesture phase union. Laziness Protocol kept the existing route owner and reused `transitionTo`. Prove It Works shaped the rerunnable Electron test and frame inspection. The implementation remained in-thread because the requested role was the implementation sub-agent. Shared-file writes were surgical, and the Courses and Settings source files were not edited by this task.

## Input evidence

| Input or guard | Evidence and scope |
| --- | --- |
| Two-finger right swipe goes Back, left goes Forward | Measured with real horizontal Playwright wheel events through Home, Library, Courses, History, and an imported document. Physical fingers were not tested. |
| Cmd+[ and Cmd+] | Measured on macOS. |
| Alt+Left and Alt+Right | Measured on macOS through the shared handler. Windows hardware was not tested. |
| Mouse buttons 3 and 4 | Measured with renderer mouse events. Physical side buttons were not tested. |
| browser-backward and browser-forward | Measured by emitting BrowserWindow app-command and delivering real native key input to the focused renderer. Windows OS delivery was not tested. |
| Three-finger system swipe | Measured as ignored by emitting BrowserWindow swipe. Inferred from the design, ignoring it avoids duplicate navigation with wheel gestures. |
| Short gesture, first and last entry, momentum after release | Measured in Electron and focused tests. |
| Dialog and Settings | Measured against the actual Settings dialog in Electron and a dialog in component tests. |
| Welcome and compact sidebar overlay | Inferred from the common overlay guard. No separate Electron interaction check was run. |
| Horizontal scroller | Measured with the actual Due soon list temporarily given horizontal overflow. The concurrent redesign uses a vertical list. Shadow-root scrolling and a scroller edge after small vertical movement pass component tests. |
| Focused input or composer | Measured with a focused textarea and history keyboard shortcuts. The actual chat composer was not separately exercised. |
| Pinch, non-pixel wheel, vertical axis | Measured in component and pure gesture tests. Physical pinch behavior was not tested. |
| Moodle guest pane | Measured with a real isolated WebContentsView. Guest wheel input arrived in the guest and generated no parent wheel events or route changes. A logged-in school pane was not tested. |

Inferred from inspected contracts. This Electron build and the reference checkout use webContents input-event gestureScrollBegin, gestureScrollEnd, and gestureFlingStart. The installed types do not declare BrowserWindow scroll-touch-begin or scroll-touch-end. Two parameterless preload subscriptions validate an empty argument tuple with Zod. No new invoke capability is introduced. Native end or fling releases the gesture; the decay heuristic and idle fallback cover missing or late boundaries.

Measured in the test driver. Each Playwright wheel call emits its own automatic gesture boundaries. The script suppresses those automatic boundaries and emits explicit main-process boundaries around each multi-step drag, retaining the production sender and preload path.

## Motion and performance

Measured in Electron 42.11.16 with Chromium 148.0.7778.280. The actual history-page-in and history-page-out animations both last 240 ms. Back enters from translateX(-32px), and the outgoing page exits to translateX(28px). Inferred from the mirrored CSS, Forward reverses those signs. Reduced motion applies history synchronously with zero View Transition calls.

Measured by visual inspection. The circle peeks in at the content edge, its arrow brightens at the threshold, and it retracts and fades on release. The corrected Back sequence slides in from the left without moving the sidebar. The final files inspected include indicator-early.png, indicator-mid.png, indicator-armed.png, back-01.png, back-03.png, back-05.png, back-08.png, and back-11.png. Twelve transition frames are saved as back-00.png through back-11.png in this directory.

Measured with performance.now around the real passive capture listener in the built renderer. 84 wheel events averaged 0.060 ms, with p95 0.20 ms and maximum 0.30 ms. The 48 events already displaying the live indicator had p95 0.10 ms. Geometry and computed-style reads inside the handler totaled 0.

Measured across five untraced round trips. Each run delivered eight wheel events and returned to the expected route. Per-run p95 handler cost ranged from 0.10 to 0.20 ms. Across 550 frame intervals, the largest whole-interaction gap was 16.6 ms, and the largest gap while dragging was 9.3 ms. No interval exceeded 25 ms in the final run.

Inferred limitation. Clock resolution of roughly 0.1 ms limits precision for these short callbacks. Callback cost excludes later rendering. Earlier runs saw isolated 33 to 34 ms frame gaps, so zero dropped frames on arbitrary hardware is not established. Real trackpad lift timing and Windows precision touchpads remain unverified.

## Verification output

Measured. `pnpm typecheck` passes. `pnpm build` passes. The focused suite passes all 40 tests across five files. `node e2e/swipe-history.mjs` passes all 21 checks with no renderer page errors. `pnpm knip` passes with its existing CSS configuration hint. `git diff --check` passes.

Measured. The requested full Vitest command reports 2 failed, 1679 passed, and 20 skipped tests. Its file totals are 2 failed, 192 passed, and 7 skipped. Courses and Settings tests pass in this final run. The remaining failures are reproduced verbatim below. Their full output is in vitest.txt.

```text
 FAIL  src/main/ipc/moodle.test.ts > registers every Moodle channel behind strict requests and trusted main-frame senders
AssertionError: expected { accounts: [], courses: [], …(5) } to deeply equal { accounts: [], courses: [], …(4) }

- Expected
+ Received

  {
    "accounts": [],
    "courses": [],
    "otherNotifications": [],
+   "pinnedCourseIds": [],
    "summaries": [],
    "unreadNotifications": 0,
    "upcoming": [],
  }

 ❯ src/main/ipc/moodle.test.ts:36:48
     34|     expect(await invoke('moodle:schools',{})).toEqual(expect.arrayCont…
     35|
     36|     expect(await invoke('moodle:overview',{})).toEqual({accounts:[],co…
       |                                                ^
     37|     await expect(invoke('moodle:schools',{}, {sender:{id:2,mainFrame:f…
     38|     await expect(invoke('moodle:overview',{}, {sender,senderFrame:{}})…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/main/mcp/grants.test.ts > rejects symlinked directories, state files, corrupt state, and public state files
Error: Path is a directory: /var/folders/ln/872qnzz118jdpq5_hvhbby5c0000gn/T/vmp-mS4u8z/mcp
 ❯ src/main/mcp/grants.test.ts:58:3
     56|   symlinkSync(external, join(root, 'mcp'));
     57|   expect(() => new GrantStore(root)).toThrow('DENIED');
     58|   rmSync(join(root, 'mcp'));
       |   ^
     59|   mkdirSync(join(root, 'mcp'));
     60|   writeFileSync(join(external, 'state.json'), '{}');

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
```

Inferred from untouched failing files and the existing workspace changes. The grants cleanup failure is the known unrelated failure. The Moodle overview expectation differs because the concurrent Courses work adds pinnedCourseIds. This task did not change either failing test or its implementation.

## Remaining scope and PR notes

Inferred limits. History is in memory and resets when the renderer reloads. Scroll restoration is outside scope. Real trackpad hardware, Windows precision-touchpad input, physical mouse side buttons, and OS-generated Windows app commands remain unverified. The separate guest test establishes event isolation, not authenticated Moodle navigation.

Inferred UI choice. The existing header was retained after screenshot review because its Help and conversation controls occupy the available space. The indicator has no text and is aria-hidden, so no new user-visible strings require translation in en, zh-Hant, or ja.

Measured source inspection. The gesture design and momentum heuristic were informed by T3 Code (MIT), copyright 2026 T3 Tools Inc. The implementation was written for VStudy's route state and strict preload boundary. The heuristic has a short attribution comment, and navigation.LICENSE.txt retains the MIT notice. Reference code was read, never executed. No commit, stash, checkout, reset, or PR was created.
