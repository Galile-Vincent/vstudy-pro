# Stage 2 native tabs

The goal is Safari-style multiple tabs in VStudy Pro. Students can keep courses, Moodle homework and web pages, and documents open, switch without losing place, and keep native-view memory bounded. This stage adds Moodle tab pages and shared native-view pool control. Full hosted-chat tabs and local reader/chat restoration remain Stage 3.

The implementation is on `t3/app-tabs-native`. The code commit is `b1cc92af9a21c46a4ad0b19ecf64f3432d602a2b`. The following evidence-only commit contains this report and the recorded output. No push or PR was made. The initial fast-forward from main to Stage 1 `b37d48fa` succeeded. Commands ran only in this checkout.

## Data and files

`shared/app-tabs.ts` adds the validated Moodle route with `accountId` and a page or file `target`, plus Moodle presentation with account ID, redacted URL, zoom, and scroll position. Route history remains authoritative. Persisted URLs pass through `publicWebviewUrl()`, now shared with main. Native runtime state stays outside persisted tabs.

`shared/moodle-webview.ts`, `shared/ipc.ts`, `preload/index.ts`, and `main/ipc/moodle.ts` add strict tab-owned requests, generations, checkpoint restoration, hide, discard action, sync, resource-limit state, and validated guest shortcut subscription. Sender checks still run through the existing registrar. Main builds resource keys from sender ID and tab ID and checks opaque pane identity for state, action, and layout.

`main/native-tab-pool.ts` owns injectable admission, LRU, protection, idle expiry, and memory policy. It exports the four-view limit, ten-minute idle interval, thirty-second metrics interval, and 1 GiB / 768 MiB thresholds. `main/moodle/webview.ts` owns per-tab resources, idempotent ensure, teardown, bounded scroll checkpoint sampling, authentication on reactivation, GET restoration, crash discard, account keepalive, and shared import quota. Disconnect destroys views and retains tab error state. `main/web-chat/views.ts` contributes existing hosted views to the same pool, protects active views and OAuth work, and supports eviction. Full hosted-chat tab identity stays in Stage 3.

`renderer/courses/webview.tsx`, `webview-pane.tsx`, and `webview.css` render a toolbar and measured slot in the active tab panel. Unmount hides the resource. Course links and approved agent navigation open tabs. The portal, inert root, focus trap, and Escape close behavior were removed. Native-aware shell presentation preserves native scroll separately from shell scroll. The tab strip displays loading and discarded indicators. Guest shortcuts run before Moodle bracket history handling. Native navigation skips DOM View Transitions.

Tests cover pool policy, per-tab ensure, owner rejection, crash reactivation, disconnect, one account keepalive timer, schema bounds and redaction, and renderer hide-on-unmount. Flat English, Traditional Chinese, and Japanese catalogs were changed and `generate-locales.mjs` regenerated the registry. The two navigation READMEs document ownership and recovery. `e2e/native-tabs-fixture.mjs` and `scripts/measure-native-tabs.mjs` provide the rerunnable local measurement and lifecycle fixture.

## Verification

All commands below passed. Logs alongside this report contain their output. Vitest always used two fork workers. Electron scripts ran sequentially.

| Command | Result |
| --- | --- |
| `pnpm typecheck` from apps/desktop | Pass. |
| `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run src/renderer src/shared src/main --pool=forks --maxWorkers=2` | Pass. 292 files passed, 7 skipped. 2,642 tests passed, 20 skipped. |
| Focused final native lifecycle tests | Pass. 4 files and 33 tests before the final two pool cases were added and covered by the full run. |
| `pnpm lint` | Pass. |
| `pnpm build` | Pass. Existing large-chunk advisory remains. |
| `node e2e/moodle-webview.mjs` | Pass. Authenticated native view, isolated bridge, navigation, external confirmation, theme isolation, certificate failure, real DocumentService import, expiry and cooldown. |
| `node e2e/app-tabs.mjs` | Pass. In-app tab switching, close, reorder, full process restart, plus five-tab native lifecycle fixture. |
| `node e2e/swipe-history.mjs` | Pass. Includes real guest wheel input and guarded history behavior. |
| `node e2e/a11y-regressions.mjs` | Pass. 144 audits, zero failures, plus keyboard checks. |
| `node e2e/i18n.mjs` | Pass. Three locales, light/dark and 720/900/1200 px layouts. |
| `pnpm security:static` from repository root | Pass. Audit failures empty. Existing dependency inventory reports 1 critical, 12 high, 4 moderate, and 1 low. Security lint reports 3 existing dynamic external-URL warnings and zero errors. |
| `node scripts/measure-native-tabs.mjs 5` | Pass. Output saved in `measurement.log` and `native-pool-results.json`. |
| Lefthook pre-commit and commitlint | Pass on both code commits. Hooks were not bypassed. |

Initial runs exposed stale modal assertions, missing test-double zoom support, and fixture navigation/input assumptions. These were corrected and the affected runs repeated. Dependency installation initially caused concurrent Electron binary initialization errors. After installation completed, the full suite passed. The initial missing `tsc` was resolved by frozen-lockfile installation.

Model the Domain shaped the owned-resource map and pure pool policy. Prove It Works shaped the real Electron fixture and saved evidence. These principles' leaf skills were read. Implementation stayed in-thread because this task explicitly assigns the implementation sub-agent role. No further agents were spawned.

## Measurement and evidence limits

The final single local fixture run printed live-view counts `[1, 2, 3, 4, 4]` for one through five requested pages. Total working-set sums across all reported application processes were approximately `[726, 816, 909, 999, 1001]` MiB. These sums include Browser, GPU, and utility processes. The pool threshold uses only unique native renderer process working sets. This is one small synthetic fixture run, not threshold calibration or a memory improvement claim. The 1 GiB and 768 MiB defaults remain unmeasured tuning choices.

The fixture verifies an 800 px retained scroll position and an 800 px restored position after forced discard, an import protected across more allocations, and zero live views after disconnect. It also restores five persisted Moodle tab headers across an app renderer reload and observes only one live native view. `native-tabs-restored.png` shows those headers. Native page captures are separate from app renderer screenshots because WebContentsView content is outside the DOM screenshot.

Native restoration across a complete Electron process restart was not exercised against the Moodle fixture. The existing in-app tab test does exercise a complete Electron restart. Native restoration uses the same persisted tab set and lazy active-page mount, but that combined native restart case remains unverified. Real school SSO, OAuth popups, OS memory pressure, Windows/Linux shortcuts, and physical trackpad input were not exercised. Injected metrics test memory thresholds, shared PIDs, protection, and chat-first eviction.

## Deviations and remaining work

- `navigation-history.ts` needed a small projection extension to preserve account ID and target. Its history operations are unchanged.
- Discard starts a fixed main-owned scroll read before destruction and retains the latest successful bounded sample as fallback. It does not wait for an unresponsive guest renderer before releasing the resource. URL, title, and zoom come from main-owned state. Scroll restoration is best effort.
- Runtime indicators use a one-second bounded metadata sync poll. Full Moodle state continues to poll every 500 ms only in the mounted visible tab. There is no native-state push channel.
- Resource-limit recovery offers retry and the existing tab-close controls. It never exceeds the cap or silently discards protected work.
- Imports completing while a tab is unmounted remain attached to that resource. Selecting its tab offers the imported document through its originating navigation closure. No background renderer callback steals focus.
- Full hosted-chat checkpoint restoration and chat tab identities remain in Stage 3. This stage adds only shared accounting, protection, eviction, and crash recovery for existing hosted views.
- No independent reviewer was invoked. This is the implementation sub-agent handoff, not a PR or merge-ready verdict.
