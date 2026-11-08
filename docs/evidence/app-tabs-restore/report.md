# Stage 3 tab restoration

The goal is Safari-style multiple tabs in VStudy Pro. Students can keep several courses, Moodle homework and web pages, documents, and chats open at once, switch without losing their place, and keep memory use bounded. This final stage adds hosted AI-chat tabs, local chat and reader restoration, and verification of native restoration after a complete Electron restart.

## Data and implementation

`shared/app-tabs.ts` keeps TabSet version 1 and adds the validated `hosted-chat` route with a provider. Strict presentation objects now hold reader mode, source version, original page, scroll position, block anchor and offset, pane selection and sizes, selected conversation, and a composer draft capped at 100,000 characters. Scroll and anchor offsets are finite and bounded. Hosted URLs lose query, fragment, and credentials before persistence. Main accepts restoration only on the provider's primary origin.

`shared/web-chat.ts`, `main/ipc/index.ts`, and `main/web-chat/views.ts` identify resources by sender, tab UUID, and a fixed page or Workspace slot. Same-provider views share the provider partition and keep independent navigation and page state. Ensure reuses a live resource. Generation checks reject stale layouts and hides. Unmount hides; authoritative tab sync closes removed resources. Discard retains a safe URL and bounded title. Repeated discard is safe. Crashes can reactivate. OAuth children retain their opener and partition, reject nested popups, and remain protected pool work. Owner navigation listeners distinguish real reloads from in-place navigation and are removed on teardown.

`renderer/chat-session-host.tsx` owns conversation-keyed runtime providers above the active page. A running response survives page unmount without retaining Markdown, readers, or page polling. Idle unmounted sessions release their runtimes; returning pages load messages from storage. Closing the last tab owning a running session cancels it. `chat.tsx` checkpoints drafts for all local chat entry points. Workspace and Desktop Chat restore the selected conversation and draft.

`renderer/tab-presentation.ts`, `workspace/index.tsx`, `workspace/reader-position.ts`, and `document-original.tsx` capture lightweight state. Reader capture runs before DOM removal. Restoration waits for source and image readiness, stops on user interaction, and has a bounded observer lifetime. Independent reader and composer patches merge against the shell's current presentation, preventing cleanup ordering from overwriting newer fields. Expected-route checks reject stale checkpoints after navigation.

`app.tsx`, `shell/index.tsx`, `shell/navigation-history.ts`, `shell/tab-state.ts`, `shell/tab-strip.tsx`, and `web-chat/*` integrate hosted pages, provider selection, runtime indicators, native-aware transitions, overlay hiding, and shortcuts while the composer has focus. Only active page content mounts.

The navigation and webview READMEs describe ownership and recovery. English, Traditional Chinese, and Japanese README sections document shortcuts and memory behavior. Existing flat locale strings were reused; `generate-locales.mjs` regenerated the registry through typecheck and build.

## Verification

Commands ran from `apps/desktop` unless otherwise noted. Vitest used two fork workers. Electron fixtures ran sequentially, using isolated profiles and offline providers.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | Pass. See `typecheck.log`. |
| `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run src/renderer src/shared src/main --pool=forks --maxWorkers=2` | Pass. 296 files passed, seven skipped. 2,651 tests passed, 20 skipped. See `tests.log`. |
| `pnpm lint` | Pass. See `lint.log`. |
| `pnpm build` | Pass. Existing large-chunk advisory remains. See `build.log`. |
| `node e2e/moodle-webview.mjs` | Pass. Native authentication, isolation, navigation, import, expiry, and recovery. |
| `node e2e/app-tabs.mjs` | Pass after checkpoint merge fix. Includes reader mode, switching, reorder, close, and full restart. |
| `node e2e/web-chat.mjs` | Pass. Independent same-provider views, retained inputs, shared login storage, OAuth guards, LRU discard, close, and lazy full-process restoration. |
| `node e2e/swipe-history.mjs` | Pass. Includes real native guest wheel input. |
| `node e2e/a11y-regressions.mjs` | Pass. 144 audits with zero failures, plus keyboard and chat checks. |
| `node e2e/i18n.mjs` | Pass. Three locales at 720, 900, and 1200 pixels, light and dark. |
| `node e2e/chat-controls.mjs` | Pass. Adds unsent draft restoration across tab switches. |
| `node e2e/chat-history.mjs` | Pass. Search, message jumps, actions, keyboard finder, and three locales. |
| `node e2e/chat-composer-position.mjs` | Pass. Eight geometry checks and eight accessibility scans. |
| `node e2e/selection-chat.mjs` | Fail. Reaches selection, usage, pane swapping, reload, provider availability, and conversation deletion, then times out waiting for document Undo. See `selection-chat.log`. |
| `node e2e/codex-chat.mjs` | Skipped by the fixture. Requires `VSTUDY_CODEX_LIVE=1` and authenticated Codex. Exit zero is not counted as a live-provider pass. |
| `pnpm security:static` from repository root | Pass. Audit failures empty; three existing dynamic external-URL warnings. Dependency inventory reports one critical, 12 high, four moderate, and one low vulnerability. |
| `node scripts/measure-native-tabs.mjs 5` | Pass. Full Moodle process restart and 20 repeated allocation/discard cycles. |

Mocked Electron tests cover ownership, independent views sharing a partition, idempotence, stale generations, safe checkpoints, crash recovery, and listener cleanup. Tests using the real Assistant UI runtime verify background completion and explicit-close cancellation. Presentation tests cover strict bounds, redaction, anchor restoration after content shifts, and reader/composer merge ordering.

Early checks exposed an Electron initialization race, incomplete test doubles, headless runtime-provider initialization, a redundant reconciliation notification, shortcut editing guards, and stale cleanup snapshots. These were corrected. The final logs record reruns rather than treating earlier failures as passes. The interrupted full-suite run was repeated.

## Memory sanity

`measurement.log` and `native-pool-results.json` record one synthetic local run. Five requested native tabs produced live counts of 1, 2, 3, 4, and 4. Before restarting Electron, the fixture verifies that a Moodle resource is live. After restarting it restores five tab headers and observes only one live resource.

Across the 20 open, hide, discard, and sync cycles, every post-discard sample has three live native views. Summed renderer working sets start at 571.50 MiB and finish at 570.83 MiB, ranging from 568.97 to 571.50 MiB. These sums cover all reported renderer processes, including the app renderer. They exclude Browser, GPU, and utility processes. Each cycle waits for ready content, so failed loads are not counted as successful allocations. Imports remain protected, scroll survives reactivation, and disconnect leaves zero live native views.

This is a sanity run, not proof of leak freedom or calibration of the 1 GiB and 768 MiB pool thresholds. OS pressure, real school SSO, and real hosted-provider traffic were not measured.

## Decisions and limits

The branch already existed at main when `git switch -c` was attempted. It was clean, and the required fast-forward to Stage 2 `d5773364` succeeded. All work stayed in this worktree. Nothing was pushed and no PR was opened.

Code evidence determined fixture updates. Legacy-route seeding now suppresses the old renderer's persistence until reload. Fixtures dismiss first-session memory consent when testing unrelated controls, use the current History finder and offline controls, and open Usage through Settings. Composer geometry covers 720, 960, and 1200 pixel windows; its 200% zoom check starts at 1200 pixels, giving a 600 pixel CSS viewport. This does not verify the earlier 360 pixel CSS zoom case.

Reader anchors are best effort when document content changes. Hosted restoration uses safe GET URLs and never restores unsent web forms. Native memory thresholds remain the Stage 2 defaults. Real provider authentication, live Codex, Windows/Linux input, physical trackpads, and manual screen-reader operation remain unverified.

The additional selection-chat fixture exposes a remaining document-delete Undo failure. Deleting the document navigates to a different document, rekeys Workspace, and loses its local Undo state. The delete implementation and document-keyed Workspace mount are unchanged from Stage 2, confirmed by `baseline-delete-flow.txt`; no baseline runtime run was performed. This broader delete-flow issue remains unresolved, so the entire verification matrix is not green. The Stage 3 tab lifecycle, draft, reader, and runtime checks pass.

Model the Domain shaped the resource identity map and lightweight presentation union. Its leaf skill was read. Deslop review kept the changes within existing shell and provider patterns. Work stayed in-thread because this task assigns the implementation sub-agent role. No independent reviewer ran, so this report is an implementation handoff rather than an independent merge-ready verdict.

## Git

Branch `t3/app-tabs-restore`.

Implementation commit `d27ca535cad0af22d86377485a15d837db117231` adds the hosted and local restoration work. The following fix commit merges reader and composer checkpoints against current state. The code HEAD is `cd299ea4fcb8e396a3e9a54174ab7678456802ad`. The following evidence commit contains this report; its final HEAD is reported in the handoff. Lefthook and commitlint ran without bypasses on both code commits. The final evidence commit also runs the applicable hooks.

Screenshots in this directory show restored Moodle tabs, restored shell tabs, and hosted-chat tabs. `e2e-results.json` preserves raw process exit codes; the live Codex fixture exits zero when it skips, as identified above.
