# Document delete and Undo fix

The goal is to fix VStudy Pro's pre-existing document delete and Undo bug before shipping the Electron and React desktop app. `e2e/selection-chat.mjs` must pass, and Undo must restore the deleted document into the active tab.

## Root cause and storage

Verified on tab feature tip `ac646123`. In that revision, `apps/desktop/src/renderer/workspace/index.tsx:66` stores Undo in local React state. Lines 167 through 183 soft-delete, navigate to the next document, then store a restoration callback on the old Workspace. `apps/desktop/src/renderer/app.tsx:61` keys Workspace by document ID. Navigation therefore discards the notice and callback. The active tab also keys Views at `app.tsx:46`, so pending Undo must survive tab remounts too.

Deletion is already soft. `src/shared/library.ts:54` and `:55` define the IPC contract. `src/main/ipc/library.ts:51` and `:52` call the existing softDelete and restore operations. `src/main/services/library.ts:166` sets deletedAt, and `:167` restores it within a 30-second window. The document service resumes conversion after restoration. No trash system or main-process changes are needed.

## Design

`src/renderer/workspace/document-undo.ts:4` defines one pending record containing the deleted document ID and translated notice. Its module lifetime exceeds both keyed React boundaries. `useSyncExternalStore` subscribes the active reader. The store retains at most one record, replaces the prior timer on a new deletion, and clears after 30 seconds. Unmounting or subscribing never restarts that timer.

`src/renderer/workspace/index.tsx:170` stores the record immediately after soft deletion succeeds, before fetching the remaining list or navigating. The currently mounted reader renders the notice, restores through the existing IPC, refreshes its documents, and navigates to the restored ID through its current tab navigation at `:182`. The record contains no callback that writes to an unmounted Workspace. Dismissal and successful Undo clear it.

A shell context was considered. It would require a provider and changes to existing direct Workspace tests. The module store implements the requested lifetime with one small abstraction and no shell changes. Workspace keys, tab histories, and presentation restoration remain intact.

The Model the Domain principle led to a typed record instead of retained component callbacks. Fix Root Causes led to changing ownership rather than removing the Workspace key. Prove It Works required baseline and post-fix Electron runs.

## Regression proof

The new keyed test was committed before the implementation in `df472bc0`. It deletes one of two documents, changes the document key, changes the tab key, then clicks Undo and checks restoration and the active route. Against the old implementation it failed while the four existing tests passed. [regression-before.log](./regression-before.log) records the missing Undo button and the `1 failed | 4 passed` summary.

The unchanged baseline E2E failed after successful deletion with this output from [selection-before.log](./selection-before.log).

```text
locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Undo', exact: true })

    at .../apps/desktop/e2e/selection-chat.mjs:248:67
```

The timeout test also remounts at 15 seconds and verifies that Undo remains at 29,999 ms and disappears at 30,000 ms. Existing tests cover restoration IPC, native-confirm avoidance, focus, and reader controls.

The first full Vitest run had one focus assertion failure with 2,694 passing tests. The preceding test returned before its restoration animation frame ran, allowing it to focus the next test's reader after that test focused Undo. The preceding test now waits for its promised reader focus before cleanup. [tests-first.log](./tests-first.log) preserves that failure. The focused run passed five tests before this test synchronization change.

## Verification

Commands run from `apps/desktop` unless stated otherwise. Dependencies were installed with `pnpm install --frozen-lockfile` at the worktree root. The initial build could not resolve dependencies before installation. The subsequent baseline build succeeded. Electron runs are sequential, and no other agent's process was stopped. No startup-flake retry was required. The later hidden-field failure and concurrent-process pause are recorded below.

The implementation checkpoint was one store, reader wiring, a failing keyed regression, and expiry coverage. The implementation is committed in `409394ecb18b96ce10be2e3f2b67ead2b4e20b82`. Both the failing-test commit and fix commit passed lefthook and commitlint. No PR or push is authorized for this assignment.

All implementation work ran in-thread because this task is an implementation sub-agent assignment. No child agents, PRs, pushes, or writes to the project checkout were made. The protected Moodle and tab-state files were not edited. The checkout is `t3/fix-delete-undo`, fast-forwarded from main to `t3/app-tabs-fixes-3` at `ac646123` before implementation.

The final full Vitest rerun passed with `299 passed | 7 skipped` files and `2695 passed | 20 skipped` tests. The tests emitted existing MaxListenersExceededWarning output. The production build emitted the bundle-size warning. Neither produced a nonzero exit.

The first post-fix selection-chat run passed document deletion and Undo, then timed out at line 255 filling the compatible API key. The field lives inside the pre-existing collapsed More options disclosure in `src/renderer/providers.tsx:182`. The script now expands that disclosure through its summary before filling the field. This is a test navigation correction only. [selection-after-hidden-field.log](./selection-after-hidden-field.log) records the hidden-input failure. The next integration run stopped before launch because another worktree's Electron a11y process was active. [integration-first-results.json](./integration-first-results.json) records that pause. No startup retry or application workaround was used for this failure.

The verified source HEAD, including the disclosure-navigation correction, is `305ff8fe15a18d77cfc7f23cbdf0ce298f93e1af` on `t3/fix-delete-undo`. The final evidence commit is documentation only and sits above this source HEAD.

All requested checks completed. Electron launches waited for other worktrees to exit. The two final selection-chat runs passed consecutively without an intervening test. Generated app-tabs evidence outside this directory was reverted after the run.

| Command | Result | Output |
| --- | --- | --- |
| `pnpm typecheck` | Pass, exit 0 | [typecheck.log](./typecheck.log) |
| `pnpm lint` | Pass, exit 0 | [lint.log](./lint.log) |
| `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run src/renderer src/shared src/main --pool=forks --maxWorkers=2` | Pass, exit 0; 2695 passed, 20 skipped | [tests.log](./tests.log) |
| `pnpm build` | Pass, exit 0 | [build.log](./build.log) |
| `node e2e/selection-chat.mjs, first consecutive run` | Pass, exit 0 | [selection-after-1.log](./selection-after-1.log) |
| `node e2e/selection-chat.mjs, second consecutive run` | Pass, exit 0 | [selection-after-2.log](./selection-after-2.log) |
| `node e2e/app-tabs.mjs` | Pass, exit 0 | [app-tabs.log](./app-tabs.log) |
| `node e2e/a11y-regressions.mjs` | Pass, exit 0; 144 audits, no failures | [a11y-regressions.log](./a11y-regressions.log) |
| `node e2e/chat-history.mjs` | Pass, exit 0 | [chat-history.log](./chat-history.log) |
| `node e2e/history-startup-regressions.mjs` | Pass, exit 0 | [history-startup-regressions.log](./history-startup-regressions.log) |

## Output tails

`pnpm typecheck`. Pass, exit 0.

```text

> @vstudy/desktop@0.3.0 typecheck /Users/vc/.t3/worktrees/vstudy-pro/t3-82efac76/apps/desktop
> node scripts/generate-locales.mjs && tsc --noEmit

Locale registry ready at /Users/vc/.t3/worktrees/vstudy-pro/t3-82efac76/apps/desktop/src/shared/locales.generated.ts (28 namespaces).
```

`pnpm lint`. Pass, exit 0.

```text

> @vstudy/desktop@0.3.0 lint /Users/vc/.t3/worktrees/vstudy-pro/t3-82efac76/apps/desktop
> eslint .

```

`NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run src/renderer src/shared src/main --pool=forks --maxWorkers=2`. Pass, exit 0; 2695 passed, 20 skipped.

```text
(Use `node --trace-warnings ...` to show where the warning was created)

 Test Files  299 passed | 7 skipped (306)
      Tests  2695 passed | 20 skipped (2715)
   Start at  21:25:47
   Duration  76.19s (transform 3.58s, setup 0ms, import 29.59s, tests 89.54s, environment 17.10s)

```

`pnpm build`. Pass, exit 0.

```text
../../out/renderer/assets/index-mu8B9vQn.js                         2,518.61 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 3.36s
```

`node e2e/selection-chat.mjs, first consecutive run`. Pass, exit 0.

```text
{"result":"PASS","mock":false,"screenshot":"/var/folders/m_/hlq7_f2j6wn88q4c28hvjl1m0000gn/T/vstudy-selection-chat.png","title":"VStudy Pro","selectedText":"This selected passage reaches the fake provider.","consoleErrors":[]}
```

`node e2e/selection-chat.mjs, second consecutive run`. Pass, exit 0.

```text
{"result":"PASS","mock":false,"screenshot":"/var/folders/m_/hlq7_f2j6wn88q4c28hvjl1m0000gn/T/vstudy-selection-chat.png","title":"VStudy Pro","selectedText":"This selected passage reaches the fake provider.","consoleErrors":[]}
```

`node e2e/app-tabs.mjs`. Pass, exit 0.

```text
PASS three tabs, workspace strip visible, click and keyboard switching, one panel
PASS middle click and Cmd/Ctrl+W close with neighbor selection and restored reader mode
PASS keyboard and pointer reorder, restart restores order and active tab, only active view mounted
PASS five native tabs stay within four views, retain scroll, protect imports, and disconnect
```

`node e2e/a11y-regressions.mjs`. Pass, exit 0; 144 audits, no failures.

```text
{"audits":144,"failures":[]}
```

`node e2e/chat-history.mjs`. Pass, exit 0.

```text
PASS History: real general chat, CJK search, safe text, rename, pin, archive/delete undo, keyboard navigation, message jump, Cmd/Ctrl+K, en/zh-Hant/ja
```

`node e2e/history-startup-regressions.mjs`. Pass, exit 0.

```text
PASS Electron History filtering, empty results, pagination focus/scroll, silent refresh and render-failure retry.
PASS Electron initial reload and close settles startup, confirms restore and reopens on activate.
```

Dispatch ledger. Investigation, design, implementation, review, and verification ran in-thread under the implementation sub-agent assignment. No delegation or PR work was performed.
