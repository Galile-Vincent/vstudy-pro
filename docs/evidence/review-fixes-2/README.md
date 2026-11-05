# History and startup regression fixes

The goal is a production-quality student app that survives History filtering and interrupted initial loading. Both verified regressions are fixed on `t3/review-fixes-2`.

The branch started at `cb781d2`, which already includes the review-fix merge `8e78ed6` and the later onboarding merge. `git merge main` reported `Already up to date.` All work stayed in this worktree.

## History rows and recoverable rendering

The result data changes during render. Assistant-ui adopts its thread IDs in an effect. Its previous IDs can therefore have no matching hit in the new result set. That is a valid transition. The row now skips an absent hit before reading its fields. Existing IDs keep their DOM nodes, so pagination does not reset focus or scroll.

`619d009` adds the failing tests. `2bc006c` fixes the lookup and adds renderer recovery. Each of the full History view, scoped History search, and Courses planner owns a retry boundary. Retry remounts the failed content while shell navigation stays available. The only new recovery data is the boundary's local failed state. IPC and database shapes are unchanged.

The new `common:surface_render_error` key has English, Traditional Chinese, and Japanese translations. The existing localized title and Retry label are reused. Tests inject a render failure in every protected view in each language, then retry successfully.

The filter tests failed before the fix with this output, preserved in [history-before.txt](history-before.txt).

```text
Tests  2 failed | 6 passed (8)
TypeError: Cannot read properties of undefined (reading 'courseTitle')
```

The focused History, recovery, and planner run passed after the fix, as recorded in [history-after.txt](history-after.txt).

```text
Test Files  3 passed (3)
Tests  15 passed (15)
```

## Interrupted initial navigation

The real `createWindow` path previously waited only for a successful replacement load or a non-abort failure. Closing the window after a reload cancellation left that promise pending forever. Restore confirmation and activate registration remained unreachable. A non-abort failure also retained its failed-load listener.

`49c7a94` adds the failing startup tests. `f259009` settles the wait on window closure or webContents destruction, keeps waiting through a reload cancellation, and rejects genuine main-frame navigation failures. Every terminal path removes the temporary load and closure listeners. Activate registration now precedes initial window loading. Closing the first window intentionally allows restore confirmation to continue.

The tests import `main/index.ts` and execute startup and its real `createWindow` function with Electron event doubles. They do not duplicate the loading implementation in a test helper.

[startup-before.txt](startup-before.txt) contains the failure.

```text
Tests  3 failed | 1 passed (4)
AssertionError: expected "vi.fn()" to be called once, but got 0 times
```

[startup-after.txt](startup-after.txt) contains the passing run.

```text
Test Files  1 passed (1)
Tests  4 passed (4)
```

## Commands and results

Commands ran from the worktree root unless a different directory is shown. Vitest used the fork pool with at most two workers. The full suite ran once.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed. |
| `pnpm --filter @vstudy/desktop exec vitest run src/renderer/history/history.test.tsx --pool=forks --maxWorkers=2` | Reproduced both filter crashes before the fix. |
| `pnpm --filter @vstudy/desktop exec vitest run src/renderer/components/surface-error-boundary.test.tsx --pool=forks --maxWorkers=2` | Reproduced an uncontained render failure before the boundaries. |
| `pnpm --filter @vstudy/desktop exec vitest run src/renderer/history/history.test.tsx src/renderer/components/surface-error-boundary.test.tsx src/renderer/courses/planner.test.tsx --pool=forks --maxWorkers=2` | Passed all 15 tests after the fix. |
| `pnpm --filter @vstudy/desktop exec vitest run src/main/index.test.ts --pool=forks --maxWorkers=2` | Failed before the fix, then passed all four tests. |
| `pnpm typecheck` | Passed. See [typecheck.txt](typecheck.txt). |
| `pnpm lint` | Passed after correcting browser-global references in the new E2E script. See [lint.txt](lint.txt). |
| `pnpm knip` | Passed with one existing CSS configuration hint. See [knip.txt](knip.txt). |
| `pnpm security:static` | Passed with no unreviewed advisories and three existing dynamic-URL warnings. See [security-static.txt](security-static.txt). |
| `pnpm test --pool=forks --maxWorkers=2` | Passed. 989 tests passed and 14 skipped. 130 files passed and five skipped. Includes contrast checks. See [full-tests.txt](full-tests.txt). |
| `pnpm build` | Passed. See [build.txt](build.txt). |
| `node e2e/history-startup-regressions.mjs` from `apps/desktop` | Both regressions reproduced in Electron before the fix. Both passed afterward. See [electron-before.txt](electron-before.txt) and [electron-after.txt](electron-after.txt). |
| `git diff main --check` | Passed. |

## Electron evidence

The script launches isolated Electron instances sequentially. Each closes before the next opens. No Electron process remains after verification.

History checks replace a populated result set, filter it to empty, load more in the compact finder, preserve the original focused DOM node and a real scroll offset, and refresh without a search announcement. An injected date-formatting exception displays the recovery message. Retry restores the results without a page error.

The startup check holds the initial HTTP response open, reloads to start a second navigation, and closes the window before either response completes. The app confirms startup by removing a temporary restore-confirmation witness. It retains its activate handler and opens a replacement window. [startup-state.json](startup-state.json) records two requests, zero windows after closure, one activate handler, restore confirmation, and successful reopening.

Screenshots are [filtered results](history-filter.png), [empty results](history-empty.png), [pagination](history-pagination.png), and [render recovery](history-recovery.png). The [accessible snapshot](history-snapshot.txt) records the recovered History view.

## Scope and handoff

Shared edits are limited to one additive key in each `shared/locales/{en,zh-Hant,ja}/common.json`. History and planner exports now wrap their content in `SurfaceErrorBoundary`. The startup helper's documentation now describes navigation settlement accurately.

No schema or persistence format changed. No PR was opened or merged. Independent review belongs to the parent task. The full suite retains its 14 existing skips. This is a focused Electron check, not a run of every E2E script.

Fix Root Causes led to handling the valid stale-ID transition and completing the window wait. Model the Domain kept recovery state inside each boundary. Prove It Works required failing tests and actual Electron evidence. Design, implementation, and checks ran in-thread because this task is already an implementation sub-agent assignment.
