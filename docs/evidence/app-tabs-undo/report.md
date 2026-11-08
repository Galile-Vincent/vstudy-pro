# Document delete and Undo baseline investigation

The goal is to prevent a document delete and Undo regression from shipping with VStudy Pro's Safari-style tab stack in `apps/desktop`. This investigation compares plain main with the tab branch using the real Electron E2E script, then fixes application code only if tabs introduced the failure.

The Undo failure predates tabs. No application fix was made on the tab branch. The check remains failing and this report does not certify the stack for release.

## Baseline results

All commands ran in `/Users/vc/.t3/worktrees/vstudy-pro/t3-32fac79b`. Builds and E2E commands ran from `apps/desktop`. Electron runs from this investigation were sequential. No process from another worktree was stopped. `pnpm install --frozen-lockfile` succeeded. The lockfile is identical between the compared commits. The desktop shell resolves Node to `/opt/homebrew/bin/node`, version `v26.9.0`. pnpm is `10.28.2`.

| Application commit | Harness | Build | E2E exit | Result |
| --- | --- | --- | --- | --- |
| Main `47b6af89` | Its unchanged `e2e/selection-chat.mjs` | Pass, exit 0 | 1 | Fails at line 95 waiting for the removed Conversation usage button. Does not reach Undo. |
| Main `47b6af89` | Its unchanged script, retry | Same main build | 1 | Same line 95 failure. |
| Main `47b6af89` | Exact script and helper from `ab3e3f28`, copied under a temporary filename | Same main build | 1 | Fails at line 248 waiting for document Undo, after successful deletion and navigation to sample. |
| Tabs `ab3e3f28` | Its unchanged `e2e/selection-chat.mjs` | Pass, exit 0 | 1 | Same line 248 document Undo failure. |
| Stage 1 `b37d48fa` | Not run | Not run | N/A | Bisect condition does not apply because the main application reproduces the same Undo failure. |
| Stage 2 `d5773364` | Not run | Not run | N/A | Same reason. |

It would be incorrect to call main's original script an Undo reproduction. Its stale usage assertion blocks the path. The supplemental run controls for this by running exactly the branch harness against the unmodified main application build. [harness.diff](./harness.diff) records all harness changes between the commits. These include updated settings and conversation locators, provider refresh events, route seeding, and removal of the stale usage assertion. No application source changed for that supplemental run.

The temporary script was generated with `git show ab3e3f28:apps/desktop/e2e/selection-chat.mjs`, written to `apps/desktop/e2e/selection-chat.baseline.mjs`. Its helper was generated with `git show ab3e3f28:apps/desktop/e2e/helpers/tab-route.mjs`. Both temporary files were removed before switching to the tab branch. The helper writes the legacy route used by main and suppresses writes to the new tab-storage key. Main has no tab-storage implementation.

The original script was run twice with `node e2e/selection-chat.mjs`. The supplemental main run used `node e2e/selection-chat.baseline.mjs`. The tab run used `node e2e/selection-chat.mjs` after a fresh `pnpm build`. The existing `t3/app-tabs-undo` branch already pointed at main, so it was selected and fast-forwarded with `git merge --ff-only t3/app-tabs-restore`.

## Root cause

The first incorrect lifetime decision is that the pending Undo operation belongs to a Workspace instance that deletion immediately replaces.

On plain main `47b6af89`:

1. `apps/desktop/src/renderer/workspace/index.tsx:61` stores Undo in local React state.
2. `workspace/index.tsx:148` soft-deletes the document. Lines 149 through 151 fetch the remaining documents and navigate to the first remaining document.
3. `workspace/index.tsx:154` assigns the Undo callback to the deleting Workspace's local state.
4. `apps/desktop/src/renderer/app.tsx:54` renders `<Workspace key={route.documentId} />`. Navigation changes the key, replacing the old Workspace with a fresh instance whose Undo state is null.
5. The old instance owns both the notice and its restoration callback. Neither survives the remount. This is independent of tab history or presentation restoration.

At tab commit `ab3e3f28`, the same state is at [workspace/index.tsx:66](../../../apps/desktop/src/renderer/workspace/index.tsx), the same delete/navigation/Undo sequence is at [workspace/index.tsx:167](../../../apps/desktop/src/renderer/workspace/index.tsx), and the document key is at [app.tsx:61](../../../apps/desktop/src/renderer/app.tsx). The tab-keyed active Views adds another lifecycle boundary, but the document-key boundary already causes this failure on main.

Both E2E logs reach a remaining `sample.md` reader with no Undo button. Both reached the `documentCount() === 1` poll before timing out at the same following click. This establishes that deletion succeeded and the UI navigated before Undo disappeared. The same local state and document-keyed mount on main explain the matching failure.

The existing reader deletion test does not exercise that boundary. [reader-delete.test.tsx:7](../../../apps/desktop/src/renderer/workspace/reader-delete.test.tsx) mocks navigation as a spy, line 24 removes the only document, and line 32 renders Workspace directly without the document-keyed parent. It covers the single-document path with no destination and no remount. It cannot detect the two-document failure.

## Disposition

No application code or tests were changed. No `t3/fix-delete-undo` branch was created. A safe fix needs pending deletion state and Undo UI owned above the document-keyed Workspace, with restoration updating the currently mounted reader. Removing the key would also change document-state reset behavior. Retaining callbacks that update an unmounted Workspace would preserve the same lifetime problem in another form. This is not a clearly isolated local change, so the optional separate main fix was not attempted in this tab investigation.

A follow-up should start from `47b6af89` on `t3/fix-delete-undo`, add a two-document regression using actual keyed navigation, move pending Undo ownership above the remount boundary, and prove the exact supplemental harness passes. On the tab stack, that owner must also survive `Views key={activeTabId}` while preserving active-only mounts and per-tab RouteHistory. Apply that follow-up to the stack only after verifying tab switching, restoration, and document-state reset behavior.

## Verification and output tails

Main build and tab build passed. Both build logs end with `built` and the existing bundle-size warning. See [main-build.log](./main-build.log) and [tabs-build.log](./tabs-build.log).

Main unchanged script, both attempts, exit 1:

```text
locator.waitFor: Timeout 30000ms exceeded.
  - waiting for getByRole('button', { name: 'Conversation usage' }).filter({ hasText: '1.5k tokens · $0.012' }) to be visible
    at .../apps/desktop/e2e/selection-chat.mjs:95:105
```

See [main-selection-chat.log](./main-selection-chat.log) and [main-selection-chat-retry.log](./main-selection-chat-retry.log).

Main application with the exact branch harness, exit 1:

```text
locator.click: Timeout 30000ms exceeded.
  - waiting for getByRole('button', { name: 'Undo', exact: true })
    at .../apps/desktop/e2e/selection-chat.baseline.mjs:248:67
```

See [main-branch-harness.log](./main-branch-harness.log).

Tab application with its unchanged script, exit 1:

```text
locator.click: Timeout 30000ms exceeded.
  - waiting for getByRole('button', { name: 'Undo', exact: true })
    at .../apps/desktop/e2e/selection-chat.mjs:248:67
```

See [tabs-selection-chat.log](./tabs-selection-chat.log).

The post-fix suite was not run because there was no application fix. Specifically, typecheck, lint, the renderer/shared/main Vitest suite, app-tabs, swipe-history, a11y-regressions, history-startup-regressions, chat-history, and chat-controls were not run in this investigation. There is no passing integration claim.

The Fix Root Causes principle directed the investigation to Undo ownership and keyed remounting. The Prove It Works principle required the supplemental main runtime run instead of inferring a baseline from unchanged code.

Work was performed in-thread because this task is the implementation sub-agent assignment. No delegates, PRs, or pushes were created. The checked-out branch is `t3/app-tabs-undo`. The verified application HEAD is `ab3e3f28384713349d818e913e15589d5774fa90`. The local evidence commit sits directly above it and changes only this evidence directory.
