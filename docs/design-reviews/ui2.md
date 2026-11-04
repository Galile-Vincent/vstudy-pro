# UI2 implementation review

2026-11-04. Scope: renderer, additive locale keys, vendor provenance and E2E. No `src/main/**` file was edited or committed by this implementation worker. Concurrent AI-parse work changed main/shared files and generated separate commits; those are outside this review.

## Reference and outcome

The user's supplied Home screenshot was opened and inspected at its actual size:
`/Users/vc/.t3/userdata/attachments/a56d2e42-6477-4555-b6c8-247c8912b20e-46175169-248d-490a-9111-7082b74bcf8d.png`.

Before: three reading documents shared the primary card; the chat excerpt used metadata-sized text; upload competed with reading; usage and rhythm occupied separate oversized cards; recent activity was expanded; Settings resembled a section label; active Home had a left stripe. The picker used custom favorite/recent rows and effort/Fast panels.

After: one document and one Continue reading action, a bounded secondary row, plain-text two-line excerpts, quiet pin strips, and collapsed recent activity. The product introduction link sits beside the header. Content is centered within 1040 px. Sidebar activity uses a filled background with no stripe; Settings is an icon-bearing footer item. The model trigger and grouped searchable list are the registry components; effort and Fast are adjacent shadcn controls. Pointer input has no composer border/ring. Keyboard focus gets one container outline; IME Enter, budget guards and Stop remain operational.

The remaining Home list actions and top-bar buttons also use shadcn Button. List buttons retain automatic height and normal wrapping for long and CJK titles; the Home/onboarding reorder and axe regression passes after that substitution.

## Registry contract

The exact overwrite command, versions and registry URLs are in [the comparison](../ASSISTANT_UI_COMPARISON.md#ui2-reset--2026-11-04-supersedes-customization-table-above). [VENDOR_PATCHES.md](../VENDOR_PATCHES.md) is the complete patch list; every entry links an exact diff. The [manifest](../evidence/ui2-vendor-manifest.json) hashes 60 vendor/dependency sources. Most shadcn patches are the single import normalization from registry `cn` to the existing utility. Other patches translate labels, retain reviewed Electron URL policies, add optional Thread slots and expose Markdown primitive props. The full upstream tool fallback was restored rather than retaining its earlier large deletion. A deliberate one-byte drift of a patched Button was rejected by `vendor:check`, then restored.

Application behavior is outside vendor files: `document-markdown.tsx`, `chat-accessibility.tsx`, `chat.tsx`, `model-catalog.ts`, `model-controls.tsx`, and shared shadcn select/checkbox adapters. Model favorites/recents and custom punctuation-independent search are intentionally removed; the registry does not implement them. Hidden catalog entries are filtered if present; the current IPC model schema does not advertise a hidden flag. Branch controls remain omitted because durable alternate branches are not stored. No main-process capability was invented.

## Design loop

Round 1: nine captures, two axe findings, plus direct visual review. The new hierarchy was visibly quieter than the supplied screenshot. Review caught pointer-focus outlines (Chromium text inputs match `:focus-visible` even after clicks), centered sidebar controls, a spare secondary-card column, and the deleted picker module's incidental stylesheet import. The application now tracks input modality; the stylesheet loads statically; secondary cards adapt to their actual count. Settings tabs gained real tab panels, and popovers gained accessible names.

Round 2: 73 captures and zero axe findings over English, light/dark and 1200/720 widths. Reviewed Home, picker, menu, settings and keyboard composer images directly. The compact Home tutorial was removed while onboarding/Welcome retain their previews; empty Home now has a clear upload action. The introduction link stays beside personalized greetings in a grid. Modal backdrops regain their blur, menu items align left, and Library filters use the shadcn Popover. Menu portals gained a named landmark, nonmodal behavior, scroll focus and explicit return focus. A close-focus assertion exposed the difference between immediate native-dialog cleanup and Radix's delayed close callback; application cleanup now restores the initiating control immediately and retains the Radix callback. Narrow Workspace uses its Document/Chat tabs, rather than squeezing both panes. Focus within the reader or chat also updates the compact-pane state, so zooming a focused desktop composer cannot hide it. Zoom captures wait for device-pixel-ratio and layout frames to settle before asserting the 2 px indicator. Existing tests now operate those tabs where needed.

Final matrix: [ui2-screenshots.json](../evidence/ui2-screenshots.json) records locale, theme, width, zoom, state, PNG path, and full axe findings. The executable matrix includes Library list/grid/filters/menu, Workspace, picker, composer idle/pointer/keyboard, settings, onboarding and Welcome at en/zh-Hant/ja, light/dark, 1200/900/720 and 100%/200% zoom. Empty, populated and pinned Home and all four onboarding steps are captured in every combination. Existing Home/onboarding and Welcome suites cover additional empty, long-title, pin, streak, onboarding-step and section states. PNGs live under `/tmp/vstudy-ui2/`; no screenshot paths are presented as human approval.

The round manifests preserve the failed initial findings rather than rewriting them as passes. The final manifest is regenerated by `e2e/ui2-design.mjs`; its current contents and final check record govern acceptance, not historical runs.

Final regression review also caught Welcome's old native-dialog Escape guard. A regression test reproduced the tour closing after Settings handled Escape; the handler now respects the open Settings state and prevented events. The same test then closes Settings and continues navigating the tour. Profiling the strict Welcome performance failure identified a cold, off-screen citation measurement forcing about 24 ms of layout. Geometry now observes only the visible demo. The unchanged twelve-entrance, scroll, playback and off-screen-idle performance assertions pass in the isolated check; the final full-suite record below remains authoritative.

The full suite exposed a remaining cold entrance frame after that first fix. Further profiling found redundant off-screen animation enumeration and marquee geometry reads, plus first-use lazy-boundary work. The final implementation relies on existing CSS pause states, measures the marquee only while visible, mounts the demo reader once seen, caches native language names, focuses the heading after paint, and renders the idle-loaded tour component directly when available. An immediate first click retains the lazy fallback. A tested font warm-up experiment was discarded because it was inconsistent. Playback, focus, pause, hidden-tab and off-screen assertions remain unchanged. The complete isolated timing check passes; the final full-suite record is authoritative.

The final-source run also caught deferred autofocus stealing focus after the user had already entered the tour. Autofocus now checks whether focus is already inside the tour. The keyboard regression waits for the deferred frames before checking that Pause retains focus. No timing or focus assertion was removed.

Visual review of the first 200% captures also found an evidence defect: Playwright's Electron screenshot returned half-size images containing a cropped physical viewport. Measured dialog bounds were correct (328 px wide inside a 360 px viewport, with vertical scrolling). The final matrix uses `webContents.capturePage()`, verifies native capture dimensions, and asserts that dialogs fit the viewport and wrap their content horizontally. Earlier round images retain their historical capture method; the final manifest identifies native captures explicitly.

## Eight-principle critique

| Surface | Contrast / hierarchy | Alignment / proximity | Repetition / balance | White space / unity |
|---|---|---|---|---|
| Home empty/populated | One reading action; no synthetic progress. Upload is primary when nothing can be resumed. Excerpts use 15 px plain text. | Header link separated from subtitle; title/snippet/action grouped. | Shared Card/Button/Progress/Skeleton; count-adaptive secondary row. | 32 px section rhythm; activity collapsed, pin strip conditional. |
| Library list/grid/filters/menu | Document title strongest; metadata muted; filter state remains explicit. | Filters stay with search; contextual actions remain near their row. | Shared shadcn controls with existing virtualization and ARIA selection. | Counts reduced in sidebar; row/menu actions stay keyboard reachable. |
| Workspace / picker | Transcript dominates; registry trigger/list replaces panel-heavy picker. | Model/effort/Fast sit together; usage and Send retain their own footer roles. | Vendor message/composer structure and neutral token mapping. | Tabs expose one pane at compact widths; no accent stripes. |
| Composer pointer / keyboard | No pointer ring, one keyboard container indicator; no double border. | Selection and budget remain above footer; IME input stays in the same composer. | Vendor composer with optional slots; same control family as other screens. | Quiet idle state; clear Stop while running. |
| Settings | Provider, usage and privacy use real tabs; active text remains legible in both themes. | Language and reply-language choices stay grouped; credentials stay with provider. | Dialog, Tabs, Select, Input and Checkbox share shadcn behavior. | Bounded scrolling; keyboard return focus; localized labels. |
| Onboarding | One step and its action; model opt-in remains explicit. | Each instruction stays next to its input/action. | Shared Dialog, Button, Input, Select and Checkbox. | Existing reduced-motion and localization behavior retained. |
| Welcome | Existing approved story and demonstration remain; chrome uses shared controls. | Existing section alignment and reading order retained. | Existing neutral visual world; same Buttons and tooltips. | Existing animation pause/reduced-motion and 200% checks retained. |

## Verification and limits

Verified renderer/test revision: `cada2525f60aa910a099896ffe261800af249324`. The complete `pnpm e2e` exited 0: 29 scripts passed; the authenticated Codex test explicitly skipped without credentials. Typecheck, lint (including string rules), 350 unit tests (13 skipped), production build/packaging and the 60-source vendor check passed. All 650 native UI2 captures/audits and the separate 144-case regression audit reported zero violations. The 36 keyboard-focus cases measured a minimum outline contrast of 3.1925:1. Final contact sheets were regenerated and visually reviewed alongside the earlier iteration evidence; native 200% images show the full viewport.

Current command results, interrupted runs and final E2E outcomes are recorded in [ui2-checks.json](../evidence/ui2-checks.json). Typecheck, zero-error string lint, unit tests, production build and vendor hash check were run. A separate 144-case Home/Library/grid/Workspace audit passed with zero violations and overflow findings, including 200% zoom. Native Electron Playwright was used: the shared preview reported `available:false`, and this task exercises an Electron IPC application.

Earlier full E2E attempts are retained under `/tmp/vstudy-ui2/e2e*`. Some exposed real migration issues, fixed above. Other attempts hit `ERR_FILE_NOT_FOUND` while the concurrent AI worker rebuilt the shared `out/` directory; those attempts are failed evidence, not passing runs. The final isolated suite is authoritative.

Not established by automation: manual VoiceOver operation, native-speaker acceptance, a different-model independent design review, and authenticated paid-provider inference. This worker acted as the implementation sub-agent and did not create nested agents. The keyboard outline uses 52% opacity in light and 40% in dark to preserve at least 3:1 contrast; its width is 2 px and pointer focus has no outline. Outline contrast instrumentation is recorded in `ui2-focus-contrast.json`.

## Appearance hooks

Added at the parent's request for the follow-up Appearance worker; this change adds no settings controls or persistence. Set overrides on `document.documentElement.style` and use the attributes below. Neutral chroma, scale/density 1, system fonts, and the current material remain the defaults. Existing authored `font-size` pixel declarations outside vendor source were converted to equivalent rem values at the current 16 px root. Vendor files remain pinned.

| Hook | Default / contract |
|---|---|
| `--accent-l`, `--accent-c`, `--accent-h` | OKLCH source; L .28 light / .92 dark, C 0, H 0. `--accent-color` is the derived color. |
| `--accent-surface-l`, `--focus-l` | Preserve the existing soft selection and focus lightness: .92/.48 light, .34/.73 dark. Accent chroma/hue derive from the same source. |
| shadcn `--primary`, `--ring`, `--accent`, `--sidebar-primary` | Map to that source; `--active` and `--focus` also derive from it. Neutral defaults retain their previous appearance. |
| `--selection-color`, `--link-color` | Accent-derived selection and links. Set `html[data-accent]` when applying a user accent to opt into authored selection styling; the untouched default retains native system selection. |
| `--ui-scale` | 1; root font size is `calc(100% * var(--ui-scale))`. Rem typography follows it. |
| `--reader-size`, `--chat-size` | .875rem and .8125rem; reader and chat text can be overridden separately. Vendor headings retain their rem type hierarchy. |
| `--font-ui`, `--font-reader`, `--font-mono`, `--font-cjk` | Existing Apple/system UI stack, inherited reader stack, SFMono/Consolas/monospace, and PingFang TC/Hiragino/Noto CJK stacks. UI locale selects the corresponding existing CJK stack. |
| `--reader-leading`, `--reader-para-gap`, `--reader-tracking`, `--reader-measure` | Latin: 1.8, .875rem, normal, 50rem (800 px at default scale). CJK content: leading 1.85 and tracking 0; paragraph gap/measure are inherited. Local per-script defaults may be overridden on the reader element or by a higher-priority style rule. |
| `--chat-leading`, `--chat-para-gap`, `--chat-tracking` | 1.625, .75rem, normal; CJK leading 1.85 and tracking 0. Existing vendor per-element heading/list/code leading remains intact. |
| `--density`, `--control-height`, `--space-1/2/3/4/5/6/8` | Density 1. The spacing scale and default shadcn Button/Select heights derive from it. Virtualized tree/list row heights deliberately remain synchronized with their existing JS measurements; changing those rows requires updating their virtualization geometry together. |
| `html[data-material=solid]` | Sets `--material-card`/`--material-sheet` to solid surfaces and disables backdrop filters. Without the attribute, the existing translucent recipe is retained. Existing OS reduced-transparency fallbacks still take precedence. |
| `--material-filter` | Existing blur(20px) saturate(1.15), used where that material recipe already applied. |

The Appearance feature can override these variables without patching assistant-ui/shadcn files. It should keep overrides on the same root for portaled dialogs/popovers to inherit them.

Old descendant-level CJK font declarations were replaced because they defeated the reader font hook. Explicit CJK language boundaries keep their existing system stacks through low-priority base styles; document text inherits its reader font. `--font-cjk` defaults to automatic per-script fallbacks, and a root override replaces those fallbacks. A direct Electron check in all three locales applied a serif UI font, monospace reader font, independent Courier code font and 125% UI scale, then verified the computed fonts and 20 px root / 17.5 px reader text. Evidence: `/tmp/vstudy-ui2/font-hooks.json`.
