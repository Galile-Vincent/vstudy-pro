# Astryx group integration

The owner wants a calm, flat VStudy Pro UI with consistent layouts. This branch integrates the four accepted Astryx groups and fixes their shared styling, dialog, and verification seams. Nothing was pushed.

## Branch and merges

Branch `t3/integrate-astryx-ui-groups` started at `85165dd3098c8ac4e92489fef1dd73fbaeee2b39`.

| Merge commit | Group | Post-merge typecheck |
|---|---|---|
| `214d9db0` | `t3/redesign-app-shell-tokens` | PASS |
| `ecc3327e` | `t3/chat-redesign` | PASS |
| `16c80184` | `t3/courses-library-ui-redesign` | PASS |
| `98ab1e88` | `t3/settings-astryx-migration` | PASS |

Settings conflicts retained its native-dialog assertion and the shell's deletion of the obsolete welcome-details recipe. Locale keys and vendor manifest merged cleanly. The UI lint baseline was lowered to the observed counts. The vendor hash gate confirms the merged manifest matches every source.

## Seams

- Hover and pressed overlays now mix 6% and 10% ink with transparency globally. The settings override is deleted. `e2e/astryx-integration.mjs` exercises a button, tab, menu item, and sidebar row in both schemes. Eight screenshots were inspected.
- `src/test/native-dialog.ts` is the only Vitest setup for dialog, popover, focus restoration, and ResizeObserver polyfills. The shell and courses setup files and their per-test imports are deleted. Astryx owns Escape dismissal. Emulating it again caused duplicate callbacks, which the full test run caught.
- Quiet dividers retain `--line`. Subscription progress tracks, scheme check boundaries, native inputs, select aliases, agent expiry fields, segmented controls, and Astryx track colors use `--line-strong`. Theme editor controls set both line tokens consistently. Settings capture confirms required control samples meet 3:1 contrast.
- Removed surface-opacity, glass-opacity, and card-transparency readers. Removed remaining art-reader backdrop-filter use and native window vibrancy. Shared schema fields still parse stored settings. Flatness preserves old settings compatibility.
- ConversationList now uses Astryx Dialog and DialogHeader. Selection chat passes through the real Electron app.
- AI parse explicitly selects Library's All files mode. Locale assertions switch through the settings UI and reopen the workspace popover, since the Library action navigates to Workspace. Its panel heading is h2 to follow Library's h1 without skipping a level. All 43 checks and five axe scans pass.
- Removed SidebarProvider and the app-wide Radix TooltipProvider. A caller scan found no remaining feature imports of either legacy component. The unused primitive implementations remain for the later cleanup wave.
- Added an explicit accessible name to the shared Select adapter to avoid duplicate external and internal labels. Library E2E waits for mobile-sidebar focus restoration before typing. i18n uses Astryx model search and option selectors.
- Visual review fixed oversized model provider icons, a clipped walkthrough body, and segmented-selection and switch-thumb elevation. The walkthrough body now scrolls. Full capture was rerun after these fixes.

## Gates

| Command | Result and excerpt |
|---|---|
| `pnpm install` | PASS. Lockfile up to date, 1,266 packages installed. |
| `pnpm typecheck` | PASS after every merge and after integration. All workspace tsc processes exited 0. |
| `pnpm --filter @vstudy/desktop exec eslint .` | PASS, exit 0, no diagnostics. |
| `pnpm --filter @vstudy/desktop ui:check` | PASS. shadow 2, radius 7, color 0, backdrop 0, surface-class 65. |
| `node apps/desktop/scripts/vendor-check.mjs` | PASS. 55 vendor sources and 13 application files match reviewed hashes. |
| `node apps/desktop/scripts/check-contrast.mjs` | PASS. All theme/scheme/contrast combinations pass. 48 CSS files use semantic tokens. |
| `pnpm --filter @vstudy/desktop exec vitest run --maxWorkers=2` | PASS. 364 files passed, 7 skipped. 3,387 tests passed, 20 skipped. |
| `pnpm --filter @vstudy/desktop build` | PASS. Renderer built successfully. Existing chunk-size and CSS @property warnings remain. |

## Electron recipes

One Electron instance ran at a time. All results use the integrated build. Generated tracked evidence was restored before the integration commit.

| Recipe | Result and excerpt |
|---|---|
| selection-chat | PASS. Selected passage reaches fake provider, no console errors. |
| chat-controls | PASS, exit 0. |
| chat-history | PASS. General chat, CJK search, rename, pin, archive/delete undo, keyboard navigation, message jump, shortcuts, three locales. |
| chat-composer-position | PASS, exit 0. |
| ai-parse | PASS. 43 checks, 5 axe scans, 0 axe violations, no live providers. |
| library | PASS. 101 screenshots, three locale search, move, pin, delete/undo, export, reload, axe. |
| capture-courses | PASS. 20 screenshots, three locales, responsive layouts, terms, sort, keyboard pins, drawer focus, disconnect cancellation, detail tabs, assistant, axe. |
| capture-settings --quick --assert | PASS. Clamped dialog, fixed tabs, pane scrolling, contrast >=3:1, zero renderer errors. |
| privacy-settings | PASS, exit 0. |
| security-delete-data | PASS, exit 0. |
| themes | PASS, exit 0. |
| i18n | PASS. en, zh-Hant, ja at 720/900/1200, light and dark. |
| welcome | PASS, exit 0. |
| welcome-axe | PASS. 12 audits, no severe violations. |
| home-onboarding | Known base failure. Timeout waiting for `.blank-chat`, line 84. |
| app-tabs | Known base failure. Moodle webservice assertion, line 96, actual 1 versus expected 0. Tab creation, switching, close, reorder, and restart checks pass before that assertion. |
| astryx-integration | PASS. Translucent hover tokens and visible controls in light and dark. |

## Full screenshot comparison

The requested ui-shots command completed with **76 shots and zero failures**. Every captured after view was inspected in light and dark. Outputs and paired baseline comparisons are in the integrated directory linked below. The final capture includes the provider icon and walkthrough fixes.

Counts are elements whose computed property is not `none`, including hidden elements and transparent zero-size shadow declarations. They are not counts of visible elevations. A direct DOM inspection found Astryx cards with transparent 0px shadow lists that this harness counts. Floating overlays retain the permitted shadows.

Across 76 matched views, raw shadow declarations total **692 baseline / 903 integrated**. Backdrop-filter declarations total **202 baseline / 0 integrated**. S/B below means box-shadow / backdrop-filter.

| View | Light baseline S/B | Light integrated S/B | Dark baseline S/B | Dark integrated S/B |
|---|---:|---:|---:|---:|
| ai-chats | 2/0 | 4/0 | 2/0 | 4/0 |
| capture | 9/3 | 18/0 | 9/3 | 19/0 |
| connect-ai | 12/5 | 9/0 | 12/5 | 9/0 |
| course | 6/2 | 10/0 | 6/2 | 10/0 |
| courses | 4/2 | 15/0 | 4/2 | 15/0 |
| design | 21/10 | 8/0 | 21/10 | 8/0 |
| exams | 3/0 | 3/0 | 3/0 | 3/0 |
| figures | 6/2 | 21/0 | 6/2 | 22/0 |
| history | 2/1 | 22/0 | 2/1 | 22/0 |
| home | 4/0 | 8/0 | 4/0 | 8/0 |
| library | 3/1 | 4/0 | 3/1 | 4/0 |
| onboarding | 6/0 | 10/0 | 6/0 | 10/0 |
| original | 9/3 | 18/0 | 9/3 | 19/0 |
| overlay-folder-options | 4/2 | 8/0 | 4/2 | 8/0 |
| overlay-help-checklist | 5/0 | 9/0 | 5/0 | 9/0 |
| overlay-help-menu | 5/1 | 8/0 | 5/1 | 8/0 |
| overlay-help-setup | 6/0 | 9/0 | 6/0 | 9/0 |
| overlay-help-shortcuts | 6/0 | 9/0 | 6/0 | 9/0 |
| overlay-help-walkthroughs | 7/1 | 10/0 | 7/1 | 10/0 |
| overlay-library-new-folder | 5/3 | 5/0 | 5/3 | 5/0 |
| overlay-model-picker | 6/2 | 22/0 | 6/2 | 22/0 |
| overlay-new-tab-menu | 5/1 | 8/0 | 5/1 | 8/0 |
| overlay-subscription-usage | 4/0 | 8/0 | 4/0 | 8/0 |
| planner | 7/0 | 10/0 | 7/0 | 10/0 |
| reader | 5/2 | 21/0 | 5/2 | 21/0 |
| review | 7/4 | 3/0 | 7/4 | 3/0 |
| school | 6/3 | 16/0 | 6/3 | 16/0 |
| settings-agents | 9/2 | 11/0 | 9/2 | 11/0 |
| settings-appearance | 33/3 | 17/0 | 33/3 | 17/0 |
| settings-general | 14/4 | 17/0 | 14/4 | 17/0 |
| settings-privacy | 15/6 | 18/0 | 15/6 | 18/0 |
| settings-providers | 32/16 | 20/0 | 32/16 | 20/0 |
| settings-storage | 11/6 | 13/0 | 11/6 | 13/0 |
| settings-usage | 11/3 | 12/0 | 11/3 | 12/0 |
| storage | 11/6 | 13/0 | 11/6 | 13/0 |
| themes | 33/3 | 17/0 | 33/3 | 17/0 |
| usage | 11/3 | 12/0 | 11/3 | 12/0 |
| webview | 1/1 | 4/0 | 1/1 | 4/0 |

## Remaining issues and scope

The two named base E2E failures remain. The other named base recipes were outside the requested run list and were not chased. The fifth page group and removal of unused legacy primitives remain outside this integration.

Some narrow controls intentionally ellipsize labels, including the walkthrough lesson tabs and compact reader filename. No new overlap was observed in the reviewed captures. The raw shadow metric increased despite removal of visible in-flow elevation because Astryx renders additional DOM and transparent shadow declarations. It should not be reported as a shadow-count reduction.

Independent review belongs to the coordinating agent. No PR was opened and no branch was pushed.

Sequence Work into Verifiable Units kept every merge behind its own typecheck. Model the Domain kept the native appearance state limited to color and timer after removal of material rendering. Prove It Works added a reusable Electron hover recipe and used full Electron captures rather than treating compilation as UI evidence.

Dispatch ledger. In-thread implementation and verification, as requested for this implementation sub-agent.

## Artifacts

- [Full paired screenshot comparison](/private/tmp/claude-501/-Users-vc--t3-projects-vstudy-pro/68bc03fd-445c-465f-b3a7-abc16d2e0b8c/scratchpad/integrated/index.html).
- [Final metrics JSON](/private/tmp/claude-501/-Users-vc--t3-projects-vstudy-pro/68bc03fd-445c-465f-b3a7-abc16d2e0b8c/scratchpad/integrated/metrics.json).
- [Recipe and gate logs](/private/tmp/claude-501/-Users-vc--t3-projects-vstudy-pro/68bc03fd-445c-465f-b3a7-abc16d2e0b8c/scratchpad/integrated/logs).
- [Hover screenshots](/private/tmp/claude-501/-Users-vc--t3-projects-vstudy-pro/68bc03fd-445c-465f-b3a7-abc16d2e0b8c/scratchpad/integrated/hover).
