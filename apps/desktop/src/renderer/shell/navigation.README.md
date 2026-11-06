# Visit history

`navigation-history.ts` models up to 50 visits with an entries array and an index. `AppShell` owns the snapshot and applies routes. `navigate` pushes a visit, deduplicates the current entry, and discards a forward branch. `goBack` and `goForward` move the index without pushing. `useNavigate` and `useOptionalNavigation` expose those actions and the availability flags.

Entries preserve document, conversation, message, course, library query, and title values. Entries and the persisted current route omit `aiParse` and `connectSchool`. Welcome stays outside history. The visit stack lasts for one renderer session. Scroll restoration is outside this change.

## Inputs

| Input | Back | Forward |
| --- | --- | --- |
| Two-finger horizontal swipe | Right, negative wheel delta | Left, positive wheel delta |
| macOS keyboard | Cmd+[ | Cmd+] |
| Windows and Linux keyboard | Alt+Left | Alt+Right |
| Mouse side button | Button 3 | Button 4 |
| Native app command | browser-backward | browser-forward |

Alt+Left and Alt+Right also work on macOS. App commands become those key events in the owning renderer and share its text-field and overlay guards. Commands are ignored while a guest has focus. The BrowserWindow three-finger `swipe` event is deliberately unhandled to avoid a second navigation for a gesture already represented by wheel input.

The window's own `webContents` forwards `input-event` gestureScrollBegin, gestureScrollEnd, and gestureFlingStart through two parameterless preload subscriptions. This Electron version and the reference checkout use those input events, rather than BrowserWindow scroll-touch-begin and scroll-touch-end. Preload validates an empty argument tuple with Zod and returns an unsubscribe function. No invoke handler or renderer-controlled native action is added.

Native end or fling releases the gesture. The decay heuristic also recognizes a momentum tail when native boundaries arrive late or are unavailable. Without native boundaries, 150 ms without wheel input releases the gesture, and a 180 ms gap starts a new gesture. After release, momentum is ignored. History actions have a 300 ms guard against duplicate commits.

## Blocked gestures

The gesture locks its axis after 8 px of total movement and requires 120 px of horizontal travel at release. A reversal subtracts from the distance. A short swipe retracts the indicator.

The following inputs cannot start history navigation.

- A vertical or tied axis, a pinch with Ctrl, or a non-pixel wheel event.
- A dialog, alert dialog, Settings, welcome, or an open compact sidebar overlay.
- A focused text field or composer when the gesture starts inside it. History keyboard shortcuts also leave text fields alone.
- A horizontal scroller in the composed event path that still has room in the requested direction. This includes shadow-root scrollers, tables, code blocks, and reader panels. Once blocked, the entire gesture stays blocked, even at the scroller's edge.
- A direction without a history entry. The indicator remains hidden.

Moodle uses a separate `WebContentsView` without the application preload. Its wheel events stay in its own contents. The app does not receive those events or take over the pane's scrolling. The Electron test verifies that separation with an isolated native guest view, without a school login.

## Motion and rendering

`HistorySwipeNavigation` mounts once in the shell content, outside dialogs. Its wheel listener uses capture and passive mode. Scroll geometry is cached outside the wheel handler. Pointer movement, content mutations, resize, and scroll events refresh the cache. Only transform and opacity change during indicator movement, through one pending animation frame. Wheel input does not update React state.

The content-edge circle follows drag progress and brightens its arrow at the threshold. Release retracts it with a 180 ms ease-out. History commits call `transitionTo` with a direction. The View Transitions API slides the new page in 32 px from that direction and moves the old page 28 px the other way while fading it. Both animations last 240 ms. Sidebar and header snapshots keep their existing transition names. Reduced motion applies history synchronously without starting a View Transition and disables indicator animation.

The existing header stays unchanged. Its help and conversation controls already occupy the available space. The indicator has no text and is hidden from assistive technology, so this change adds no user-visible strings to translate.

## Verification

Run these commands from `apps/desktop`.

```sh
pnpm typecheck
pnpm build
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run src/renderer src/shared src/main --pool=forks --maxWorkers=2
node e2e/swipe-history.mjs
```

Run `pnpm knip` from the repository root.

The Electron script launches the built app with an isolated scratch profile. It drives real `page.mouse.wheel` events. Chromium creates a new begin and end for each automation call, so the script replaces only those automatic boundaries with explicit main-process input events around each multi-step drag. The production main-process sender and preload remain in the path.

The current Courses redesign has a vertical Due soon list. If that list has no horizontal overflow, the script temporarily gives that existing list horizontal overflow and confirms its scroll position changes without navigation. This does not test a native horizontal Due soon layout that no longer exists.

Evidence goes to `docs/evidence/navigation/swipe` at the repository root. `results.json` contains checks, Electron and Chromium versions, wheel timings, frame gaps, and native guest results. `back-00.png` through `back-11.png` capture release and the transition. The early, mid, and armed indicator screenshots capture drag progress. `indicator-armed.png` and `settled-library.png` show the endpoints. Timing wraps the actual passive window listener in the built renderer with `performance.now`. Five separate round trips also sample animation frames without screencast capture. These measurements cover software injection, not physical trackpad behavior or Windows precision-touchpad behavior.

## Attribution

The gesture design and momentum decay heuristic were informed by T3 Code, MIT licensed, copyright 2026 T3 Tools Inc. The implementation here uses VStudy's route state and typed preload contracts. No reference code was executed. See `navigation.LICENSE.txt` for the MIT notice.
