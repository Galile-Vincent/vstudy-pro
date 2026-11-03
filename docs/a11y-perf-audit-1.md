# Accessibility and performance audit 1 (test sub-agent, report-only)

Status: **uncommitted**, written to `docs/a11y-perf-audit-1.md`. No other repo file was changed. All scripts, builds, databases and screenshots live in the scratch directory named in §0.4.

## 0. Scope, method, environment

### 0.1 What was tested

| | |
|---|---|
| Code under test | `git archive` of **HEAD `6af28fbca2754b301063daa458687a253eac66eb`** (`docs: record Welcome review responses and final evidence`), built with `electron-vite build` in a scratch directory. The live repo has since moved (`c2b5ed4`, hardening worker); none of its changes are in this audit. |
| App | The real built Electron app (`out/main/index.js`, unpacked, **not** the packaged `.app`), driven by Playwright `_electron` with a temp `--user-data-dir` per run. Renderer = the real UI; main = the real IPC, SQLite (`node:sqlite`), converter worker. |
| Chat provider | The repo's own `VSTUDY_FAKE_PROVIDER=1` adapter. For the 5k–40k-token streams I added a `long reply N delay chunk` branch to the **built scratch copy** of the fake adapter (`out/main/index.js`); no repo file was touched. No real model or network was used for chat. |
| Seeded data | The repo seeder `scripts/bench-db.mjs`, copied to `scripts/seed.mjs` in the scratch tree with scale parameters and multilingual titles (`en`, `zh-Hant`, `ja`). Small scale (120 docs / 14 folders / 1.5k messages / 20k usage rows) for UI runs; **full scale (5,000 docs / 400 folders / 100,000 messages / 1,000,000 usage rows, 1.12 GB)** for performance. A few documents were set to `failed` / `converting` for status UI. |
| Machine | Apple M6, 12 cores, 32 GB, macOS 27.0.1, Electron 40.0.0 (Chromium 144.0.7559.60, Node 24.11.1 in-app), display DPR 1, window 1200×768 CSS px unless stated. Playwright 1.56.1, `@axe-core/playwright` 4.11.0 (axe-core 4.11.x). Another Electron 42 process (another worker) was running at times: load average 1.8–4; timings are therefore slightly pessimistic and noisy. The perf chain ran when the machine was otherwise quiet. |
| Tags | axe: `wcag2a wcag2aa wcag21a wcag21aa wcag22aa best-practice`; every impact level reported, including minor. |

### 0.2 Severity scale used

- **blocker**: a documented budget/target is missed by a wide margin, or a core task cannot be completed by some users, with no reasonable workaround.
- **warning**: AA failure or a budget miss with a workaround, or a defect that will hurt real users.
- **polish**: best-practice, robustness or small budget headroom issue.

### 0.3 What was NOT run (read this first)

1. **macOS VoiceOver was not run.** It cannot be driven reliably or read back from automation. §A (Appendix) is a manual script for a human. Every accessibility "pass" below means "no defect found in the Chromium accessibility tree and axe", not "works with VoiceOver".
2. OS-level Reduce Motion / Reduce Transparency / Increase Contrast / Differentiate were **emulated** (Playwright `reducedMotion`, CDP `Emulation.setEmulatedMedia` for `prefers-contrast`, `prefers-reduced-transparency`, `forced-colors`), not toggled in System Settings.
3. No packaged build, no ASAR/fuse/hardened-runtime effects, no Windows/Linux. The hardening worker's main-process changes are not included.
4. Cold-start numbers are with a **warm OS file cache** (no `sudo purge`), unpackaged.
5. The 30-minute soak was replaced by a **workload equivalent** (50 imports + 100 open/close cycles with periodic chat and search, about 2 minutes of activity) followed by about 3 minutes of idle sampling. I did not run a real 30-minute session. No heap snapshots were taken; I used `Runtime.getHeapUsage` after forced GC plus `Memory.getDOMCounters`.
6. Chat streaming used a **synthetic** reply (markdown paragraphs, lists, code, headings, no tables/math/Mermaid/maps), no real provider latency.
7. Not audited: PDF reader view, Mermaid / geo-map / media / image-lightbox elements, attachments, voice input, generative-UI tables, citation popovers, the packaged DMG, drag-and-drop with the real mouse (only the non-drag alternatives were driven).
8. The Library **error state** was seen (it is reachable, see A-01) but axe was not run on it; offline *conversion failure* UI was checked through IPC, not axe.
9. The pixel-contrast scanner (§3.3) is my own tool. After manual review only one finding is real; the rest are scanner artifacts (see §3.3). It cannot judge text over moving content or masks.

### 0.4 Evidence and repro

- Evidence root (literal prefix `EV` below): `/private/tmp/claude-501/-Users-vc--t3-projects-vstudy-pro/961e859c-0c00-4c4e-ac39-22e5a77ec17a/scratchpad/out`
- Scripts: `/private/tmp/claude-501/-Users-vc--t3-projects-vstudy-pro/961e859c-0c00-4c4e-ac39-22e5a77ec17a/scratchpad/snap/apps/desktop/audit/` (`axe-sweep.mjs`, `kb.mjs kb2.mjs kb3.mjs kb4.mjs`, `contrast-sweep.mjs`, `ui-contrast.mjs`, `env2.mjs`, `cjk.mjs`, `perf-a…g3.mjs`) and `…/scratchpad/snap/scripts/` (`seed.mjs`, `explain.mjs`, `time-usage.mjs`, `fts-stress.mjs`).
- Everything above is in a session scratch directory and may be pruned; a tarball of the evidence tree is at `/private/tmp/claude-501/-Users-vc--t3-projects-vstudy-pro/961e859c-0c00-4c4e-ac39-22e5a77ec17a/scratchpad/a11y-perf-evidence-1.tgz`. Copy it out if you want to keep it.

---

## 1. Summary

**3 blockers, 17 warnings, 12 polish items.** Cold start, library paint, list scrolling, search, streaming rendering, memory behaviour and idle CPU are healthy. The weak spots are (a) the usage/rate-limit queries at the documented 1M-row scale, (b) focus management and a few ARIA/semantic gaps in Library and chat, (c) reflow at the 720 px minimum window combined with 200% zoom, and (d) large-document rendering.

| ID | Sev | One line |
|---|---|---|
| A-01 | blocker | Manual reorder (drag **and** the keyboard alternative) in the default "Library / All documents" view throws and replaces the list with an error screen |
| A-02 | blocker | Chat answers are not in any live region and messages have no author role/label (design §8 says "polite, throttled") |
| P-01 | blocker | Usage queries scan JSON rows on the main thread: `usage:rateLimits` **5.9–7.3 s** (+650 MB RSS), `usage:dashboard` **1.0 s**, `usage:summary` 0.13–1.0 s; budget dashboard < 100 ms, "rollups only" |
| A-03 | warning | Keyboard focus falls to `<body>` after pin, move, rename, delete, undo, open document, back, close onboarding, close settings |
| A-04 | warning | Name/prompt dialogs focus the × button, not the text field; typing a space closes the dialog |
| A-05 | warning | Library grid: invalid ARIA (axe *critical*), 50 invalid rows, 4 Tab stops per row |
| A-06 | warning | Landmarks and headings: no `main` in Library, no H1 in compact Workspace, chat `h2` before the document `h1`, `h4` jump, duplicate skip link |
| A-07 | warning | Settings dialog and conversation popover have no accessible name |
| A-08 | warning | Reflow: 200% zoom on a 720 px window (360 CSS px) and 400% zoom break Home and Library |
| A-09 | warning | Targets under 24 px: chat action bar, Copy code, thread list items, "paste path" summary |
| A-10 | warning | `.hljs-literal` text 3.87:1 light / 4.09:1 dark |
| A-11 | warning | Keyboard-only users cannot select arbitrary text in the reader (only heading "Use this section" buttons) |
| A-12 | warning | CJK: no `lang` on CJK titles inside the English UI; wrong CJK font for zh-Hant content in the ja UI and for ja titles in the en UI |
| A-13 | warning | Increase Contrast is ignored; "current page" in the sidebar is conveyed by background tint only (invisible in forced-colors) |
| P-02 | warning | Library **grid** view is not virtualized: p50 33 ms frames, 93% of frames > 25 ms, 319 ms long frame at 850 loaded docs |
| P-03 | warning | First document open in a session takes **1.56 s** (3.8 MB lazy chunk), later opens 0.14–0.17 s |
| P-04 | warning | Large document (2 MB): 0.6 s to first content, 0.9 s to settle, 557 ms long task, 36k DOM nodes; selection to action button 0.67 s (O(document size)) |
| P-05 | warning | Startup bootstrap: resident 130–140 MB Python worker at every launch, 321 MB venv per profile, ~10 s background `uv` bootstrap on a fresh profile, raw `uv` stderr shown as the failure message when offline |
| P-06 | warning | Storage amplification: FTS stores full content (3.9× text), library dir copies (2.1×), 1M usage rows = 1.1 GB (JSON payload + 6 indexes) |
| P-07 | warning | Metadata first paint on open is 54.5 ms p50 (budget < 50 ms) on the 5k-doc / 400-folder DB because the 400-node folder tree re-renders (5.7k DOM nodes) |
| 12 polish items | polish | See A-14…A-19, P-08…P-13 |

### 1.1 Budgets in `PRODUCT_DESIGN_V2.md` §7 versus measured

| Budget (§7) | Measured | Verdict |
|---|---|---|
| list a folder page < 15 ms | 0.19 ms p50 / 0.32 max (repo bench, full scale); 0.8 ms through IPC | **PASS** |
| open a document < 50 ms to first paint of metadata | DB 0.02 ms. UI: 20–26 ms (small DB), **54.5 ms p50 / 67 max** with the 5k-doc DB (P-07) | PASS on small DB, **miss by 9%** at bench scale |
| FTS search < 80 ms typical | 34 ms / 39.5 max `science`, 5–12 ms CJK (bench); 22–25 ms en, 4–17 ms zh/ja through IPC; 22–27 ms on a 54 MB corpus; UI keystroke-to-paint 300–355 ms **including the 250 ms debounce** | **PASS** |
| dashboard load < 100 ms | Home dashboard 3.6 ms (bench). **`usage:dashboard` 1,010 ms; `usage:summary` 127–964 ms; `usage:rateLimits` 5.9–7.3 s** (P-01) | Home **PASS**, usage path **FAIL ×10–70** |
| cold start to interactive < 2 s | 0.31 s (empty DB) / 0.59 s (5,000-doc DB) process-to-Home, 10 runs each; first run 0.41–0.64 s to onboarding | **PASS** |
| virtualized lists in the UI | List view virtualized (14 rows mounted of 5,000). **Grid view and folder tree are not** (P-02, P-07) | **partial** |
| keyset pagination | Used (cursor in `library:documents:list`, `messages:page`, `usage:page`) | PASS |
| rollups for the dashboard | Home/dashboard use rollups; `usage:summary`/`rateLimits`/`dashboard` do not | **FAIL** (P-01) |
| `EXPLAIN QUERY PLAN` asserts index use for every hot query | 172 statements analysed; the 5 main list queries are indexed, 6 hot-ish queries scan or sort (P-08) | **partial** |
| FTS "separate index with external content or contentless" | `fts5(documentId,title,filename,content,tokenize='trigram')` stores content | **FAIL** (P-06) |
| `PRAGMA integrity_check` | `ok`; `quick_check ok`; FK violations 0 after churn | PASS |
| a11y: AA, focus rings, reduced motion, dialogs trap/return, 24 px targets, drag alternative | See §3 and the defects | partial |

---

## 2. What passed

**Performance (measured):**
- Cold start 0.31 s / 0.59 s (budget 2 s); 0 long tasks; offline (network denied) warm start 0.29 s; first run onboarding in 0.41–0.64 s.
- Library first rows at 85 ms p50 after reload with 5,000 docs (p95 143 ms); list scroll 360 frames: p50 16.7, p95 18.0, max 18.6 ms, 0 frames > 25 ms, 14 rows mounted.
- Search: all en/zh-Hant/ja queries ≤ 25 ms through IPC at 24 MB and ≤ 27 ms at 54 MB of indexed text, including 2-character CJK queries (LIKE scan) and 1-character queries.
- Streaming 5k tokens at 150 tok/s and 750 tok/s, plus 10k/20k/40k tokens: **0 long tasks (> 50 ms)**, frame p95 ≤ 18 ms, input delay p95 ≤ 2 ms, key-event duration identical to idle typing (p50 32 ms), JS heap flat at 38/65 MB.
- No leak found in 100 open/close cycles + 50 imports + chat: JS heap after GC 15.2 → 15.1 MB, DOM nodes 1,999 → 2,008, listeners 335 → 329.
- Idle CPU: Home 0.03% renderer, 0.03% GPU, 0.01% main; 0% Python.
- Converter queue: 20 mixed files (md, txt, csv, html, docx, xlsx, pptx, 2 pdf) accepted in 26 ms; UI frames p95 18 ms, input delay p95 0.1 ms, main event-loop lag max 11 ms.
- DB: integrity OK, FK clean, WAL mode, incremental auto-vacuum, 155 free pages (1.7%).
- Repo's own DB budgets at full scale: folder page, filtered list, FTS en/zh/ja, dashboard, document metadata all inside budget (table in §4.1).
- `EXPLAIN QUERY PLAN`: folder pages, name/created/size/type sorts, tag, hasChats, size/date filters, FTS MATCH, keyset paging all use indexes.

**Accessibility (measured):**
- **Focus is visible on every stop sampled** (about 215 Tab stops over Home, Library, Workspace, onboarding ×4, Welcome, settings): changed-pixel contrast ≥ 5.8:1 against the unfocused state, no stop clipped or covered (WCAG 2.4.7, 2.4.11).
- Onboarding: heading takes focus on each step, Tab never leaves the dialog (5/7/8/4 stops), Escape finishes.
- Move to… dialog and Settings dialog: native modal, 40 and 60 Tab presses never left the dialog; Escape closes and (for the Move dialog and menus) returns focus to the row; folder tree: arrows/Home/End/typeahead/F2/Shift+F10 work; menu: arrows/Home/End/Escape work; model picker: Escape returns focus to the trigger, effort radios reachable and arrow-operable.
- Language switch by keyboard works and keeps focus; `html[lang]` follows the UI language; Markdown `lang` follows the document content (`zh-Hant` detected for CJK text).
- **Reduce Motion is honoured**: running CSS animations 6 → 0 on Welcome; Home 1 (finished) → 0; "Pause animations" is a real toggle (`aria-pressed`, stops all animations, works by Enter and Space).
- Forced-colors (emulated) renders readable UI with visible borders and focus.
- Contrast tokens: `scripts/check-contrast.mjs` passes (light ink 14.59, muted 6.54, line 3.23, focus 6.54; dark 12.98, 6.88, 4.34, 6.88). Rendered text contrast on 10,390 text items (180 states) has no real failure except `.hljs-literal`.
- Icon-only buttons all have accessible names; no unnamed button/link/input/combobox in any of the 180 AX dumps.
- Chat errors are `role=alert` with a reachable Retry. The Library announces "N documents loaded" politely (no spam). Streaming produces no live-region spam, because the answer itself is never announced (A-02).
- Skip link works and is the first stop; status badges carry text + icon (not colour alone); zoom 200% on a normal-width window is usable.

---

## 3. Accessibility findings

### 3.1 Automated: axe on the real app (180 audits)

30 states × light/dark × en/zh-Hant/ja. Results are identical across languages and themes except for the contrast items. States: onboarding 0–3, home (empty, populated), usage dialog, Welcome (top, scrolled), library (list, filters popover, filters applied, context menu, selection bar, Move-to dialog, folder tree expanded, no-results, snippets, grid), workspace (reader + blank chat, start conversation, model picker, thread list, streamed answer, chat error, selection chip, settings dialog, usage tab, compact 720 px). The dark `workspace-start-conversation` state was not reached because the conversation already existed from the light pass; its neighbours were audited. Raw data: `EV/axe/results-all.json`, per-state screenshots and AX dumps `EV/axe/<lang>-<theme>-<state>.{png,ax.txt}`.

| Rule (impact) | WCAG / tag | Audits affected | Nodes | Cause | Defect |
|---|---|---|---|---|---|
| `aria-required-children` (**critical**) | 1.3.1 | 48 (all Library states) | `.library-results` | `button.load-more` is a child of `role=grid` | A-05 |
| `aria-allowed-role` (minor) | best-practice | 48 | 51 unique `article[role=row]` | `row` not allowed on `<article>` | A-05 |
| `landmark-one-main` (moderate) | best-practice | 48 | `html` | Library has no `<main>` | A-06 |
| `color-contrast` (**serious**) | 1.4.3 | 27 | `.hljs-literal` | `#9b7147` on `#f2f2f2` = 3.87; on `#181818` = 4.09 | A-10 |
| `target-size` (**serious**) | 2.5.8 | 30 | 6 unique buttons | 19.5×24 px chat action bar / thread-list / tooltip icon buttons | A-09 |
| `aria-dialog-name` (**serious**) | 4.1.2 | 6 | conversation popover `role=dialog` | no `aria-label` | A-07 |
| `heading-order` (moderate) | best-practice | 6 | model picker `h4 Effort` | no h2/h3 before it | A-06 |
| `page-has-heading-one` (moderate) | best-practice | 6 | compact 720 px Workspace | reader pane hidden | A-06 |
| *incomplete* `color-contrast` | – | 641 node instances | glass / animated text | axe cannot resolve translucent backgrounds | §3.3 manual |
| *incomplete* `aria-prohibited-attr` | – | 27 | `.product-preview` | `aria-label` on a generic `div` | A-18 |
| *incomplete* `skip-link` | – | 6 | compact Workspace skip link | target not visible on activation | A-06 |

### 3.2 Keyboard-only walkthroughs

Method: real keyboard events through Playwright, no mouse. For every Tab stop I recorded element, role, name, focus-visible state, a screenshot of the focused element, and a before/after pixel diff of the focus indicator (≥ 5.8:1 everywhere). Walk files: `EV/kb/walk-home.txt`, `walk-library.txt`, `walk-workspace-blank.txt`, `walk-workspace-chat.txt`, `walk-settings.txt`, `walk-onboarding-0..3.txt`, `walk-welcome.txt`; per-stop screenshots `EV/kb/walk-*-NN.png`. Task logs: `EV/kb/kb-library.json`, `kb-workspace.json`, `kb3.json`.

| Task | Result | Notes |
|---|---|---|
| Tab order, Home | pass, 22 stops | skip link → sidebar → toggle → greeting (a focusable `span`, A-18) → cards |
| Tab order, Library | **warning** | 75 stops cover only about 14 rows: **each row = 4 stops** (row, title button, Pin, Options), no roving tabindex (A-05); no stop is clipped |
| Import | pass with a gap | Enter on *Import document* opens the dialog and imports; focus stays on the button; **no announcement** that the document was added |
| Create folder | **warning** | dialog opens with focus on **× Close**, not the input (A-04); Escape returns focus to *New folder* |
| Move document (Shift+F10 → "Move to…") | pass with a gap | menu opens on the first item, arrows/Home/End, Escape closes and returns focus to the row; Move dialog is a named modal; 40 Tab presses stay inside; choosing a folder works and shows "Documents moved · Undo within 30 seconds"; **focus then falls to `<body>`** (A-03) |
| Pin | pass with a gap | row → title → Pin reachable; `aria-pressed` toggles; **focus falls to `<body>`** after the list refresh; no announcement (A-03) |
| Search | pass | typing filters; "N documents loaded" is announced politely |
| Filters | **polish** | button toggles; focus does **not** move into the panel; **Escape does nothing**; Tab walks on to Sort (A-14) |
| Reorder (Ctrl/Cmd+Option+↑/↓) | **blocker** | works only inside a single folder view; in the default view it throws and shows "Couldn't load your library" (A-01) |
| Selection | pass | Space selects, ⌘/Ctrl+A selects all 120 (announced "120 selected"), Escape clears; Shift+↓ does not extend the selection (polish) |
| Open document | **warning** | Enter opens; focus is on `<body>` afterwards (A-03) |
| Select text and ask | **warning** | no caret in the reader; only heading "Use this section" buttons (visible on focus) and ⌘⇧K on an existing selection; after choosing, focus is not moved to the composer (A-11) |
| Send / Stop | pass with a gap | Enter sends; focus stays in the composer; *Stop generating* is 30×30 px; **Escape stops generation**; reply not announced (A-02) |
| Model + effort | pass | Enter opens, focus in search, Tab reaches effort radios, ←/→ change effort, Escape returns to trigger; no announcement of the change (polish) |
| Conversations popover | pass with a gap | opens with focus inside, Escape returns to trigger; popover has no accessible name (A-07) |
| Settings, language | **warning** | opens with focus on × Close; dialog has no accessible name (A-07); 60 Tab presses stay inside; language change to 日本語 by keyboard works and keeps focus; **Escape returns focus to `<body>`** (A-03) |
| Onboarding | pass | all four steps, heading focus, no escape from the dialog, Escape finishes; **focus is `<body>` afterwards** (A-03) |
| Welcome | pass | 24 stops all visible; *Pause animations* toggles by Enter/Space and stops 6 running animations to 0; Close returns focus to the entry button; Escape does **not** leave Welcome (polish A-18) |
| Chat error | pass | `role=alert` "Rate limit reached…" with a reachable Retry |

Shortcut inventory and conflicts (code and test): ⌘/Ctrl+A (grid select all), ⌘/Ctrl+⇧K (ask about selection), ⌘/Ctrl+Alt+↑/↓ (reorder), Alt+↑/↓ (sidebar pins), F2 (rename folder), Shift+F10 / Menu key (context menu), Space/Enter/Home/End/arrows, Escape (clear selection, close menu). **Conflict:** `Control+Option+↑/↓` is the VoiceOver navigation chord; the code accepts `Meta+Alt` too, which is the usable one on macOS. Shift+F10 and the Menu key do not exist on most Mac keyboards; the *Document options* / *Folder options* buttons and VO+Shift+M cover it. The macOS menu defines standard roles only; no app shortcut collides with a menu accelerator.

### 3.3 Roles and names (accessibility tree)

CDP `Accessibility.getFullAXTree` dumps for all 180 states (`EV/axe/*.ax.txt`; summary script `audit/ax-summary.mjs`).

- **Landmarks:** Home: complementary "Document library", 2 `navigation` (one unnamed), `banner`, `main`. **Library: no `main`** (axe). **Workspace: `main` but no `banner`** (its header is a `sectionheader` inside `main`); two "Skip to content" links; two `Library` buttons. Onboarding: no landmarks (a `contentinfo` footer inside the dialog). Welcome: named `main` and seven named regions (good).
- **Headings:** Home `h1 Good morning → h2 cards` (good). Library `h1 Library`, sidebar `h2 Folders`, empty state `h2`. Workspace: the chat's `h2 "A place to think together"` precedes the document `h1` (which is the *user's* document title), `h4 Effort` in the model picker skips levels, compact 720 px has **no H1**. The settings dialog title is "Providers & API keys" even though the first controls are language settings.
- **Names:** no unnamed button/link/input/combobox/tab/radio/menuitem/img in any dump. Duplicate generic names: every Library row has a button just called "Pin" (the document name is not in the name), `Folder options: X` is good.
- **Semantics gaps:** Library grid (A-05); folder tree: `aria-expanded="false"` on **leaf** folders, no `aria-setsize/posinset` (A-15); user vs assistant messages are anonymous paragraphs: no author label, no article/group role (A-02); `div.product-preview[aria-label]` has no role (A-18); the model trigger is a `combobox` named "Model" (value read as text only).
- **Live regions (streaming must not spam):** the workspace has exactly **one** live region, an empty `sr-only role=status` for "loading earlier messages". During a 5k-token reply it produced **no** announcement for the streamed text or its completion (MutationObserver over every `aria-live`/`role=status|alert|log`: 0 records for a short reply, 1 record, the "Assistant is working" indicator, for the 1,200-token run). That is "no spam" for the wrong reason: the answer is not announced at all (A-02). Library: `div.library-live[aria-live=polite]` updates once per load ("N documents loaded"); toasts are `role=status`; errors `role=alert`.
- **Reading order vs visual order:** correct for both chat sides: swapping the chat side re-orders the DOM (tab order starts in the document pane when it is on the left). Library toolbar and sidebar: DOM order = visual order.

### 3.4 Colour contrast (en, zh-Hant, ja; light and dark)

1. `scripts/check-contrast.mjs`: pass (see §2). It only checks four token pairs and ignores `--hairline`, syntax colours, translucent surfaces and `--palette-*`.
2. **Rendered contrast on glass and translucent surfaces.** For each of 180 states I took one screenshot with all text made transparent and sampled the pixels actually painted behind each text box (worst pixel across the box; alpha of the text colour and ancestor opacity applied), against 4.5:1 (3:1 for large text) over 10,390 text items. Tool: `audit/contrastlib.mjs`; results `EV/contrast/results-*.json`.
   **Real failure: `.hljs-literal` only (3.87:1 light, 4.09:1 dark, confirmed by axe).** The other flagged items were scan artifacts, which I confirmed on screenshots: visually-hidden text (`sr-only`, `motion-sr`) positioned over the streak dots, text under a scroll-fade mask in the model list, and frames captured mid-transition. I removed what I could (occluded, inert, invisible, fully transparent text) and report the rest honestly as unresolved rather than as defects. The translucent surfaces (`--material-card` 72%, `--material-sheet` 88% over `backdrop-filter: blur(20px)`) kept ≥ 4.5:1 for all real text; the worst realistic case for muted text over a dark element is a theoretical 3.0:1 that did not occur because the blur averages the backdrop.
3. **Non-text contrast (1.4.11)** (`audit/ui-contrast.mjs`, light/dark): form-control borders at `oklch(0.65)` measure ≈ 2.9–3.0:1 on the border pixel (token says 3.23; borderline). **`--hairline` borders (10–12% ink) measure 1.07–1.6:1** on: the Library search field (the only boundary of that input), the *Filters* and *Close* buttons, and the Home "Save in" select. The buttons have text; the search field's boundary is the only visual cue (A-17). Icons: 0 failures except the decorative provider logo in the Model trigger (1.27:1 in dark).

### 3.5 Text scaling, reflow, motion, transparency, contrast preferences

| Test | Result |
|---|---|
| Zoom 200% (webContents zoom factor 2), 1200 px window = 600 CSS px | Home, Library, Workspace (tabs mode), Settings usable; Library search placeholder truncates ("Searc") |
| **Zoom 200%, 720 px window = 360 CSS px** | **Fail.** Sidebar keeps 180 CSS px of 360; Home gets horizontal scroll, heading wraps to "Goo/d/mor…", cards clipped; Library row title shows one letter. Workaround: the hamburger button hides the sidebar. (A-08) |
| Zoom 300% / 400% (400 / 300 CSS px) | Same problem; Home scrolls horizontally at 300 CSS px. Workspace is fine (sidebar auto-hides below 1000 CSS px, compact tabs) |
| 720 px window at 100% | pass: no overflow in any view; 1 item clips in Home |
| "Larger font size" | Chromium/Electron do not follow macOS text size. Setting `html{font-size:200%}`: only 31% (Library) to 76% (Home) of text elements scale; the rest use `px` tokens (`--type-*`: 76 px declarations vs 39 relative). So zoom is the only supported scaling path (A-19) |
| **Reduce Motion** (emulated) | pass: Welcome 6 running animations → 0, Home 1 → 0; chat 0/0; no animation loops left; Pause control works |
| **Reduce Transparency** | OS path (`settings:appearance` → `html[data-reduced-transparency]`): surfaces become opaque **but `backdrop-filter` stays on** `.settings-dialog`, `.bulk-bar`, `.anchored-menu`, popovers, and `dialog::backdrop`; the flag is read **once at mount**, not live; the `prefers-reduced-transparency` media-query path removes `backdrop-filter` from elements but `*` does not match `::backdrop` (A-16) |
| **Increase Contrast** (`prefers-contrast: more`) | **0.00% pixel change on all 4 views: not honoured** (A-13). The code has no `prefers-contrast` rule |
| **Forced-colors** (emulated) | readable, borders and focus visible, Welcome and onboarding fine. The sidebar "current page" highlight (background tint) disappears (A-13); the user-message bubble loses its edge |
| Hit targets (24 px) | See A-09. Measured on 10 states with the WCAG 2.5.8 spacing exception: failing buttons are the chat action bar (19.5×24), *Copy code*, thread-list item and tooltip icon buttons, and the "paste a local file path" `summary` (223×18). `New folder` (16×24) and the hover-only folder options pass by spacing |
| Colour-only information | pass: status badges, errors, pins and selection have text/icon/state in addition to colour; sidebar current page and Workspace user-vs-assistant bubble rely on tint/position alone in forced-colors |
| CJK | See A-12 |

### 3.6 Accessibility defects

Each entry: steps, expected, actual, severity, criterion, suspect file, evidence, fix. File references are to the snapshot (`6af28fb`).

#### A-01 — Manual reorder throws in the default view (blocker)
- **Criterion:** design §8 "drag-and-drop always has a non-drag alternative" (and a functional bug for mouse drag too); WCAG 2.5.7 Dragging Movements (AA, WCAG 2.2).
- **Steps:** Library (default "Manual order", all documents) → focus row 6 → `Ctrl+Alt+↑` (or `Cmd+Option+↑`; same for drag-and-drop onto a row in this view).
- **Expected:** the document moves one place up; focus stays on it.
- **Actual:** the list is replaced by `role=alert` "Couldn't load your library / Something went wrong". IPC `library:documents:move` rejects with `errors.generic` (reproduced directly: neighbour in another folder, `folderId` of the moved item + `beforeId` of a row in a different folder). It works only inside a single-folder view; even there focus then falls to `<body>` (A-03).
- **Suspect:** `src/renderer/library/index.tsx:301-312` (`reorder` passes `folderId: item.folderId` with `beforeId` from the next row) and `:708-722` (drop handler); `src/main/services/library.ts:65-70` (`move` throws on a `before` in another folder).
- **Evidence:** `EV/kb/reorder-error.png`; `audit/kb5.mjs`, `kb6.mjs`, `kb7.mjs`.
- **Fix:** in cross-folder lists (all, recent, pinned, unfiled, search) either disable manual reorder and hide the shortcut/hint, or reorder using the neighbour's own `folderId`; show a real status message instead of the full-page error; keep focus on the moved row.

#### A-02 — Chat replies are not announced; messages have no author (blocker)
- **Criterion:** WCAG 4.1.3 Status Messages (AA), 1.3.1; design §8: "live regions for streaming (polite, throttled)".
- **Steps:** Workspace → send a question with a screen reader on (or observe `aria-live`, `role=status|alert|log` regions with a MutationObserver) → wait for the answer.
- **Expected:** a polite, throttled announcement that an answer is arriving/complete (or a `role=log` transcript); user and assistant messages identifiable.
- **Actual:** the transcript viewport (`ThreadPrimitive.Viewport`) has no `role=log`/`aria-live`; the live regions in the pane are an empty `sr-only role=status` for "load earlier" and the transient "Assistant is working" thinking indicator (`thread.aui.tsx:794`). Measured mutations of any `aria-live`/`role=status|alert|log` region: **0** during a short reply with the fake provider, 1 (the thinking indicator, at the start) during a 1,200-token reply, none when the text streams or completes; the user's message and the answer are anonymous `paragraph`s in the AX tree (`data-role` only). Errors are fine (`role=alert`). Not verified with VoiceOver (see §0.3).
- **Suspect:** `src/renderer/components/assistant-ui/elements/thread.aui.tsx:254` (viewport), `:466` (empty status), message containers at `:729` and `:923`.
- **Evidence:** `EV/kb/live-stream.json`, `EV/axe/en-light-chat-streamed-answer.ax.txt`, `EV/kb/kb-workspace.json`.
- **Fix:** add a visually hidden `role=status aria-live=polite aria-atomic` region that is updated at most once per second or once per paragraph ("Assistant is answering…" then "Answer complete: first sentence…"), label messages (`role=article` with `aria-label="You"` / `"Assistant"`) or put the transcript in a `role=log` with `aria-relevant=additions`. Add a test that counts mutations of the live region during a 5k-token fake stream (target ≤ 1 per second).

#### A-03 — Focus falls to `<body>` after common actions (warning)
- **Criterion:** WCAG 2.4.3 Focus Order, 2.4.7 (focus lost), design §8 "dialogs with focus trap and return".
- **Steps and results (all measured):** pin / unpin a row (Space on Pin); Move to… (after choosing a folder); rename (prompt); delete; Undo; reorder; open a document (Enter on a row); "Library" back button; close onboarding (Escape); close Settings with Escape in the Workspace; "Start a conversation"; "Use this section".
- **Expected:** focus stays on, or returns to, the control that triggered the action (or the new content).
- **Actual:** `document.activeElement === document.body` in every case above. Cause: any mutation sets `loading` and replaces the grid with a skeleton (`index.tsx:156`), unmounting the focused row; `LibraryDialog` cleanup focuses `previous` (the already-unmounted menu item) at `dialog.tsx:21-30`; navigation does not move focus into the new view.
- **Suspect:** `src/renderer/library/index.tsx:137-199` (skeleton replaces list on every refresh), `:286-300` (`moveTo`), `src/renderer/library/dialog.tsx:12-32`, `src/renderer/shell/index.tsx:64-80`, `src/renderer/workspace/index.tsx` (no focus on open), `src/renderer/onboarding/onboarding.tsx:44`.
- **Evidence:** `EV/kb/kb-library.json`, `kb-workspace.json`, `kb3.json`.
- **Fix:** keep rows mounted during background refresh (only show the skeleton on first load); on dialog close focus the row/anchor by id, falling back to the list; after navigation focus the view's `h1` (the Welcome and onboarding code already do this); add an e2e assertion "activeElement is not body" after each action.

#### A-04 — Prompt dialogs focus × instead of the input (warning)
- **Criterion:** WCAG 2.4.3, 3.3.2; usability: data loss.
- **Steps:** *New folder* (or Rename, Tag, Save filter) → Enter → type "Keyboard Folder".
- **Expected:** focus in the text field.
- **Actual:** focus is on **× Close**; the Space in "Keyboard Folder" activates Close, the dialog closes and the typed text is lost (observed: folder not created).
- **Suspect:** `src/renderer/library/dialog.tsx:87` (React `autoFocus` runs before `showModal()` at `:25`; `showModal` then focuses the first focusable element, the × button at `:51`).
- **Fix:** put `autofocus` (lowercase DOM attribute) on the input or focus it in the effect after `showModal()`; make × not first in tab order (`tabindex` or place it last).
- **Evidence:** `EV/kb/kb-library.json` (create-folder).

#### A-05 — Library grid semantics and Tab stops (warning)
- **Criterion:** WCAG 1.3.1, 4.1.2 (axe *critical* `aria-required-children`), 2.1.1/2.4.3 usability.
- **Steps:** axe on any Library state; Tab through the list.
- **Actual:** `role=grid` contains `button.load-more` (a child not allowed); 50 `article` elements carry `role=row` (not allowed on `article`); each row is a stop plus three buttons (title, Pin, Options): about 200 Tab presses to cross 50 rows; `aria-colcount=1`; "Pin" has no document name.
- **Suspect:** `src/renderer/library/index.tsx:608-648`, `:663-672`, `:876-880`, `:851-870`.
- **Fix:** `div role=row` (or `li role=option` in a `listbox`), roving tabindex (one stop for the list, arrows move, Tab goes to the toolbar), move the load-more button outside the grid or make it `role=row > gridcell`, name the buttons "Pin {title}".
- **Evidence:** `EV/axe/results-all.json`, `EV/kb/walk-library.txt`.

#### A-06 — Landmarks and headings (warning)
- **Criterion:** WCAG 1.3.1, 2.4.1, 2.4.6; axe `landmark-one-main`, `page-has-heading-one`, `heading-order`.
- **Actual:** see §3.3: no `main` in Library; Workspace has no `banner` and, at < 1000 CSS px, no H1; chat `h2` precedes the document `h1`; `h4 Effort` skips levels; two "Skip to content" links in the Workspace (`#shell-content` and `#reading-content`) with the same name; two unnamed/duplicate `navigation` landmarks; compact skip link target is hidden.
- **Suspect:** `src/renderer/library/index.tsx:330` (`<section>`; use `<main id=shell-content>` in the shell), `src/renderer/shell/index.tsx:128-152`, `src/renderer/workspace/index.tsx:429`, `src/renderer/model-picker.tsx:102`.
- **Fix:** one `main` per view in the shell, `banner` for the topbar, an app-level visually-hidden `h1` in Workspace, `h3` for popover sections, name the second skip link "Skip to document".
- **Evidence:** `EV/axe/*.ax.txt`.

#### A-07 — Dialogs without names (warning)
- **Criterion:** WCAG 4.1.2, 2.4.6; axe `aria-dialog-name` (serious).
- **Actual:** the conversations popover (`role=dialog`, `data-slot=popover-content`) has no `aria-label`; the Settings/Usage `<dialog>` has neither `aria-label` nor `aria-labelledby` and its title reads "Providers & API keys" over language settings.
- **Suspect:** `src/renderer/conversation-list.tsx:39`, `src/renderer/providers.tsx:43-60`.
- **Fix:** `aria-labelledby` pointing at the `h2`; rename the dialog "Settings".

#### A-08 — Reflow at 360 CSS px / 400% zoom (warning)
- **Criterion:** WCAG 1.4.10 Reflow (AA), 1.4.4 Resize text.
- **Steps:** window 720 px wide, zoom 200% (`Cmd +` twice), Home or Library.
- **Expected:** one column, no horizontal scroll.
- **Actual:** sidebar stays (180 CSS px of 360), content column 170 px; Home scrolls horizontally; Library title shows "r"; same at 400% zoom.
- **Suspect:** `src/renderer/shell/index.tsx:65-70` collapses the sidebar only when `route.view === 'workspace'`; `shell.css`.
- **Fix:** auto-hide the sidebar below ~720 CSS px in every view (it already has a toggle), `flex-wrap` the Library toolbar.
- **Evidence:** `EV/env/zoom2-w720-home.png`, `zoom2-w720-library.png`, `zoom4-w1200-home.png`, `EV/env/env2.json`.

#### A-09 — Target size under 24 px (warning)
- **Criterion:** WCAG 2.5.8 (AA, 2.2); axe `target-size` (serious).
- **Actual:** chat action bar *Copy*, *Regenerate*, *Read aloud*, *More* (19.5×24, neighbours 21.6 px apart), *Copy code* (19.5×24), thread-list item buttons, tooltip icon buttons (`size-6`), "Or paste a local file path" `summary` (223×18). The 13×24 filter/settings checkboxes pass because the label wraps them.
- **Suspect:** `src/renderer/components/assistant-ui/elements/*` (`tooltip-icon-button.tsx`, `thread.aui.tsx` action bar), `src/renderer/home/upload-card.tsx:43`.
- **Fix:** `min-width/min-height: 24px` (or `p-1.5`) on icon buttons; `summary { min-height: 24px }`.
- **Evidence:** `EV/env/env.json` (targets), `EV/axe/results-all.json`.

#### A-10 — Syntax colour contrast (warning)
- **Criterion:** WCAG 1.4.3.
- **Actual:** `.hljs-literal { color: var(--palette-14) }` = `#9b7147`: 3.87:1 on `#f2f2f2` (light), 4.09:1 on `#181818` (dark), 10.56 px.
- **Suspect:** `src/renderer/style.css:561`, `src/renderer/tokens.css:30`.
- **Fix:** darken to ≥ 4.5:1 per theme (e.g. `#7a5530` light, `#c49a6a` dark) and extend `scripts/check-contrast.mjs` to all `--palette-*` used for text.
- **Evidence:** `EV/axe/results-all.json`.

#### A-11 — No keyboard way to select arbitrary text in the reader (warning)
- **Criterion:** WCAG 2.1.1 Keyboard.
- **Steps:** open a document; try to select a sentence without the mouse.
- **Actual:** the reader container is `tabindex=-1` and has no caret; `Shift+Arrow` selects nothing. The only keyboard path is the heading-level "Use this section" buttons (visible on focus, 94×24) or ⌘⇧K on a selection that already exists (VoiceOver users can create one). After choosing a section, focus is not moved to the composer.
- **Suspect:** `src/renderer/workspace/index.tsx:343`, `src/renderer/markdown.tsx:100-125`, `document-elements.tsx`.
- **Fix:** make `.markdown` `tabindex=0` with `role=document`, enable caret browsing guidance, add "Ask about this paragraph" buttons per block on focus, and focus the composer after any selection.

#### A-12 — CJK language and font (warning)
- **Criterion:** WCAG 3.1.2 Language of Parts (AA); design §4 "CJK typography … `lang` attribute set".
- **Actual (`audit/cjk.mjs`, `EV/cjk.json`):** `html[lang]` is correct in all UIs; Markdown `lang` is detected (`zh-Hant`). **But** CJK document titles in Library and Home carry no `lang` (11 CJK text nodes in the English Library, none with a `lang` attribute), so a screen reader reads them with the wrong voice; in the **ja UI** a `zh-Hant` document renders with **Hiragino Sans** (Japanese glyph forms) because the font stack does not switch on `:lang()`; in the **en UI** Japanese titles render with **PingFang TC** ("蘋方-繁") because Han fallback follows the `zh` entries first. `word-break: auto-phrase` and `line-break: strict` are correctly set for ja.
- **Suspect:** `src/renderer/tokens.css` (font stacks), `src/renderer/library/index.tsx:808`, `src/renderer/home/home.tsx:37`, `src/renderer/markdown.tsx:128`.
- **Fix:** wrap user titles with `lang={contentLanguage(title)}`, add `:lang(ja)`, `:lang(zh-Hant)` font stacks.

#### A-13 — Increase Contrast ignored; current page only by tint (warning)
- **Criterion:** WCAG 1.4.1 Use of Color, 1.4.11; design §8 "no information by color alone".
- **Actual:** `prefers-contrast: more` changes 0.00% of pixels on Home, Library, Workspace, Settings; under forced-colors the sidebar `aria-current` item is not distinguishable.
- **Suspect:** `src/renderer/tokens.css` (no `@media (prefers-contrast: more)`), `src/renderer/shell/shell.css` (active nav background).
- **Fix:** add a `prefers-contrast: more` block (opaque surfaces, `--line` ≥ 4.5:1, 2 px outlines) and a `forced-colors: active` rule giving `[aria-current=page]` a `border-inline-start` or `ButtonText` outline.
- **Evidence:** `EV/env/contrast-more-*.png`, `forced-colors-*.png`, `EV/env/env.json`.

### Polish

#### A-14 Filter "popover" is a plain div
`src/renderer/library/index.tsx:369-444`. Focus does not move in, Escape does nothing, no `aria-controls`; Tab continues to Sort. WCAG 2.1.1 (usable) / APG disclosure. Fix: make it a real popover (`popover` attribute or the Radix `Popover` already used) with Escape and focus return.

#### A-15 Folder tree semantics
`src/renderer/library/sidebar.tsx:208-225`. Leaf folders expose `aria-expanded="false"`; no `aria-setsize/posinset`; options button is `tabindex=-1` and appears only on hover (keyboard: Shift+F10). Fix: omit `aria-expanded` on leaves, add set size/position.

#### A-16 Reduce Transparency only partly applied
`src/renderer/tokens.css:83-84`, `onboarding.css:2`, `library.css:388`. See §3.5. Fix: `html[data-reduced-transparency=true] *, ::backdrop { backdrop-filter: none !important }`, subscribe to the OS setting (`nativeTheme`/`systemPreferences` event) instead of reading it once.

#### A-17 Hairline borders as the only boundary
`.library-search`, Home "Save in" select, secondary buttons (`--hairline` 10%). 1.1–1.6:1; WCAG 1.4.11. Fix: use `--line` for input boundaries.

#### A-18 Small semantic issues
(a) `AnimatedText` is a focusable `span` with no role or name (`motion/animated-text.tsx:27`; it pauses on focus, which satisfies 2.2.2 but is silent); (b) `div.product-preview[aria-label]` has no role; (c) Welcome ignores Escape (the Close button works); (d) Shift+Arrow does not extend Library selection; (e) no announcement after import, pin, effort change.

#### A-19 Text scaling by root font size
See §3.5; most sizes are `px` tokens, so only zoom scales text (the only supported path in Chromium, so low impact).

---

## 4. Performance findings

All numbers are from the real app unless the text says "DB layer" (the repo seeder/Node). Raw data: `EV/perf/*.json`, logs `EV/perf-*.log`.

### 4.1 Measurements against the budgets

**DB layer, repo bench `scripts/bench-db.mjs` at full scale** (`EV/bench-full-seed.log`): folder page 0.19 / 0.32 ms (budget 15); filtered list 0.17 / 0.20 (15); FTS `science` 34.4 / 39.5 (80); library search `science` 28.3 / 31.7; FTS 資料 4.9 / 5.5; library search 資料 11.0 / 12.4; 学習 4.1 / 4.9 and 10.6 / 11.0; dashboard 3.6 / 4.0 (100); document metadata 0.02 (50). All pass. Seeding 44 s; DB 1.12 GB.

**Cold start to interactive** (`audit/perf-a.mjs`, `EV/perf/perf-a-start.json`; "interactive" = the Home cards rendered without skeleton; process start taken from `process.uptime()` in main, so Playwright's attach time is excluded; also the wall clock from `electron.launch` including attach):

| Scenario | process→window | process→Home p50 / p95 / max | wall incl. attach p50 | LCP | long tasks |
|---|---|---|---|---|---|
| Empty DB, reused profile, 10 runs | 152 ms | **309 / 314 / 314 ms** | 366 ms | 204 ms | 0 |
| 5,000 docs / 1M usage rows, 10 runs | 380 ms | **588 / 603 / 603 ms** | 646 ms | 260 ms | 0 |
| Fresh profile (first run), 3 runs | – | onboarding dialog at 639 / 426 / 414 ms | 802 / 486 / 473 ms | – | 0 |

Budget 2 s: **pass**. The +230 ms for the big DB is `openStore` + startup work in main (1.1 GB file; not profiled further). Memory at first Home: main 182–327 MB, renderer 161–206 MB, GPU 92–94 MB, utility 47 MB, **+128–132 MB Python worker** (P-05).

**Library first paint, 5,000 docs** (`perf-b.mjs`, 10 reloads): first `article[role=row]` at **85 ms p50 / 143 ms p95** after navigation start (FCP 92 ms); 0 long tasks; 14 rows mounted; DOM 5,722 nodes (400 folder-tree items, P-07).

**Scroll frame times** (360 rAF frames, programmatic sweep; DPR 1, 60 Hz):

| View | loaded | p50 | p95 | max | frames > 25 ms | > 50 ms | long animation frames |
|---|---|---|---|---|---|---|---|
| List | 350 | 16.7 | 18.0 | 18.6 | 0 | 0 | 0 |
| **Grid** | 850 | **33.3** | **35.3** | **333** | **331 / 359** | 5 | 6 (max 319 ms) |

**IPC latency as the renderer sees it** (p50 of 10 after warm-up, 5,000-doc / 1M-row DB):

| Channel | p50 | Note |
|---|---|---|
| `library:documents:list` manual page 1 | 0.8 ms (one cold 190 ms outlier) | |
| recent view / sort last opened / status=ready / hasChats | 1.3 / 1.3 / 1.7 / 0.8 ms | |
| text `science` / `資料` / `学習` / `網路資料` / `通信と` | 22.3 / 7.1 / 7.2 / 17.4 / 12.2 ms | budget 80 |
| `library:tree` / `counts` / `tags:list` | 2.1 / 0.5 / 0.0 ms | |
| `documents:list` (all 5,000) | 38.9 ms | used by Settings/Usage |
| `usage:summary` month / last30days | **127 / 964 ms** | P-01 |
| `usage:dashboard` last30days | **1,010 ms** | P-01 |
| `usage:rateLimits` | **5.9–7.3 s** | P-01 |
| `settings:get`, `providers:list` | 0.1, 1.4 ms | |

**Search in the UI** (typing → results painted, 5 runs each; includes the app's 250 ms debounce): en `science` 320 ms, `learning` 354, `Introduction to Machine` 320; zh-Hant `資料` 319, `網路資料` 324, `線性代數` 305, `網路` 322; ja `学習` 324, `通信` 321, `統計学入門` 320, `日本語能力` 306 → **49–104 ms after the debounce**. IPC only, same queries: en 22.7 / 24.3 / 5.5, zh 7.2 / 17.3 / 4.8 / 8.3, ja 8.0 / 8.5 / 4.9 / 3.9 ms. **Pass** (budget 80 ms). At realistic corpus size (`scripts/fts-stress.mjs`: 1,500 docs, 54 MB of mixed en/zh/ja text, trigram index, DB 209 MB): `learning` 22 ms, rare word 20, zh 2-char LIKE scan 24–25, ja 2-char 27, 1-char 7 ms. The 2-character CJK path is a `LIKE '%…%'` scan over `document_fts.content`: ≈ 0.5 ms per MB, so a 1 GB corpus would approach 0.5 s (extrapolation, not measured).

**Open a document** (`perf-b.mjs`, `perf-c.mjs`, `perf-c2.mjs`; double-click → first paint of metadata (`.eyebrow`) / first content block / settled):

| Document | metadata p50 / p95 | first content p50 / p95 | settled p50 | DOM nodes | long task max | JS heap |
|---|---|---|---|---|---|---|
| tiny (284 B), small DB | 26 / 39 ms | 51 / 56 ms | 86 ms | 95 | 0 | – |
| 60 KB md, **5k-doc DB** (10 opens) | **54.5 / 67 ms** | 143 / **1,564 ms** | 174 / 1,590 | – | 117 ms | – |
| 210 KB md | 25 / 40 | 123 / 131 | 181 | 3,847 | 79 ms | 141 MB |
| **2.0 MB md (161 chapters ≈ 727 A4 pages of scroll height)** | 20 / 27 | **594 / 771** | **894 / 1,599** | **36,391** | **557 ms** | 141–159 MB |

Selection responsiveness (selectionchange → "Ask about this" button visible, same latency for any selection size): tiny 13–24 ms, 210 KB **94–119 ms**, 2 MB **651–683 ms**. Scrolling the 2 MB document: p50 16.7, p95 18.2 ms; stress jumps ±37/360 of 800k px produce 5 frames of 100–433 ms.

**Chat stream rendering** (`perf-d.mjs`, `perf-d2.mjs`; synthetic markdown, 3 tokens per chunk; typing 70 characters into the composer while streaming):

| Run | wall | frames p50 / p95 / max | long tasks (> 50 ms) | input delay p95 | key-event duration p50 / p95 | renderer script time | DOM | JS heap |
|---|---|---|---|---|---|---|---|---|
| idle typing baseline | – | – | – | – | 40 / 40 ms | – | – | – |
| 500 tok @150 tok/s | 8.2 s | 16.7 / 18.2 / 18.7 | 0 | 0.3 ms | 32 / 48 | 1.2 s | 1,021 | 38 MB |
| **5,000 tok @150 tok/s** | 46.1 s | 16.7 / 17.8 / 18.7 | **0** | 0.2 ms | 32 / 40 | 12.8 s (28% of wall) | 660 | 38 MB |
| 5,000 tok @750 tok/s | 10.3 s | 16.7 / 18.0 / 18.7 | 0 | 1.7 ms | 32 / 40 | 7.2 s (70%) | 978 | 38 MB |
| 10,000 tok @750 | 19.5 s | 16.7 / 18.1 / 18.7 | 0 | 2.0 | 32 / 40 | 16.4 s | 960 | 65 MB |
| 20,000 tok @750 | 38.2 s | 16.7 / 17.9 / 18.8 | 0 | 2.0 | 32 / 40 | 34.7 s | 2,168 | 65 MB |
| 40,000 tok @750 (158 KB) | 75.6 s | 16.7 / 17.8 / 33.8 | 0 | 1.8 | 32 / 40 | 71.2 s (94%) | 4,569 | 65 MB |

Cost per streamed chunk is ≈ 5 ms and **does not grow with message length** (not quadratic). **Pass**; at the real provider rate the main thread is about 28% busy, at a 750 tok/s synthetic burst it saturates but never produces a long task.

**Memory and leaks** (`perf-e.mjs`, `EV/perf/perf-e.json`): workload = import 50 documents (45 × 60 KB, 5 × 500 KB) in one `documents:importPaths` call (363 ms, all ready in 16 ms, main loop lag ≤ 3 ms), then 100 cycles of *search by title → open → (every 10th: chat exchange) → back*. RSS (working set) in MB:

| Checkpoint | main | renderer | GPU | utility | Python worker | total |
|---|---|---|---|---|---|---|
| baseline (120 docs) | 199 | 184 | 92 | 48 | 132 | 523 |
| after 50 imports | 236 | 230 | 98 | 48 | 132 | 612 |
| cycle 10 | 255 | 278 | 115 | 48 | 140 | 696 |
| cycle 50 | 258 | 285 | 117 | 48 | 140 | 708 |
| cycle 100 | 310 | 299 | 120 | 48 | 140 | 777 |
| after ~3 min of idle sampling, Welcome, minimize | 314 | 296 | 115 | 48 | 140 | 773 |

JS heap after forced GC cycles 10 → 100: 15.2 → 15.1 MB (slope −0.2 MB / 100 cycles); DOM nodes 1,999 → 2,008; listeners 335 → 329. **No renderer leak.** Main-process working set rises ≈ 62 MB / 100 cycles and did not plateau within the run (P-12, watch item).

**Idle CPU / wakeups** (`app.getAppMetrics()`, 5 s samples; Playwright's CDP connection was attached, so absolute numbers include it):

| State | duration | main CPU / wake s⁻¹ | renderer CPU / wake | GPU CPU / wake | Python |
|---|---|---|---|---|---|
| Home idle | 40 s | 0.01% / 0.8 | 0.03% / 5.1 | 0.03% / 10.5 | 0% |
| Library idle | 30 s | 0.01% / 0.8 | 0.03% / 1.7 | 0.00% / 1.8 | 0% |
| Workspace reader idle | 30 s | 0.02% / 0.2 | 0.09% / 10 | 0.01% / 7.8 | 0% |
| Welcome, animations playing | 30 s | 0.01% / 0.5 | **0.61% / 17** | 0.42% / **93** | 0% |
| Welcome, Pause on | 20 s | 0.00% / 0.3 | 0.05% / 0.5 | 0.07% / 61 | 0% |
| Window minimized | 20 s | 0.01% / 0.3 | 0.05% / 0 | 0.07% / 61 | 0% |

GPU wake-ups stay at about 60/s when paused or minimized; I did not isolate whether that is the app (compositor with `backdrop-filter` layers) or the CDP screencast (P-11).

**DB growth and integrity** (`EV/perf/perf-e.json`): baseline 21.6 MB; after 50 imports 34.8 MB (+13.2 MB for 5.2 MB of Markdown = 2.5×; library dir +10.9 MB; WAL 6.3 MB, TRUNCATE-checkpointed on close); no growth from 100 open/close cycles. Final: `integrity_check ok`, `quick_check ok`, `foreign_key_check` 0 rows, 8,788 pages, 155 free pages, WAL, `auto_vacuum=2`. Largest objects: `usage_events` 9.8 MB for 20,010 rows (≈ 490 B/row), `document_fts_data` 6.8 MB, `document_fts_content` 6.1 MB. Full-scale bench DB: 1.12 GB.

**`EXPLAIN QUERY PLAN`** (`scripts/explain.mjs`, bench DB; 126 statements captured at runtime from `LibraryService.list` across 60 query shapes + Home dashboard + usage, plus 46 static `prepare(...)` strings): `EV/explain.json`, timings `EV/explain-timings.json`. See P-08. Index use confirmed for folder pages (`documents_folder_*`), name/created/size/type sorts, tag, FTS MATCH, keyset paging, `usage_daily` range.

**Converter queue, 20 files at once** (`perf-f.mjs`, `EV/perf/perf-f.json`): one `documents:importPaths` call with 6 md, 3 txt, 3 csv, 2 html, 2 docx, 1 xlsx, 1 pptx, 2 pdf (made unique): the call returns in 27 ms with 20 accepted rows; all 20 reach `ready` 4.7 s later (this includes the first-run venv bootstrap, 4.4 s here and 10.1 s on another fresh profile; after it the 20 conversions take ≈ 0.3 s). The queue is serial (`documents.ts:28,154`), one Python worker (peak 154 MB RSS, 84% CPU). UI while converting and typing in the search box: frames p50 16.7 / p95 18.0 / max 33 ms, key-event input delay p95 0.1 ms, main event-loop lag max 11 ms. **Pass.**

**Startup bootstrap offline** (`perf-g2.mjs`, `perf-g3.mjs`, `perf-g3b.mjs`; Electron run under `sandbox-exec` with outbound network denied):
- Warm profile, offline: process→Home **287–296 ms** (4 runs); CSV import works.
- Fresh profile, offline, `uv` cache present: onboarding at 451 ms; import ready in < 1 s; the background bootstrap still succeeds from the cache.
- Fresh profile, offline, **no `uv` cache** (`HOME` pointed at an empty directory): the app starts normally (onboarding 385 ms); a Markdown import works (no converter needed); a **DOCX import fails after 4.5 s** with `document.error` = "Converter process failed (exit 2): Using Python 3.12.14 environment at: [path] error: Request failed after 3 retries in 6.5s … tcp connect error … Operation not permitted" (raw tool output, English, not a code + params, P-13). No hang, no crash, no CPU spin.
- Online, fresh profile: the converter venv bootstrap finishes **10.1 s after launch** in the background, creates a **321 MB** `converter-venv` per profile (uv cache warm; downloads otherwise) and leaves a 128–140 MB Python process resident for the life of the app, even if the user never imports a non-text file.
- At launch the provider CLIs `claude` and `agy` also appear as child processes (detection probes); not investigated further.

### 4.2 Performance defects

#### P-01 — Usage queries scan JSON on the main thread (blocker)
- **Budget:** §7 "dashboard load < 100 ms", "Rollups … dashboard reads rollups only", "list queries never read content"; "Pagination (keyset) for … usage".
- **Steps:** use the bench DB (1M usage rows); open a chat (composer usage meter), focus the window, or open Settings → Usage.
- **Expected:** < 100 ms, UI never blocked.
- **Actual (renderer-side and DB-layer measurements agree):** `usage:summary month` 127–305 ms, `last30days` 964 ms–2.8 s, `usage:dashboard` 1,010 ms, `usage:rateLimits` **5.9–7.3 s and +650 MB RSS** (it iterates `list()` over **all** 1M rows and `JSON.parse`s + zod-parses each payload). All run synchronously in main (`node:sqlite`): while `usage:rateLimits` ran, a concurrent `settings:get` waited **5.2–6.2 s**. The composer meter re-runs `usage:summary month` on conversation mount, on every window `focus` event and on each draft estimate, so a heavy user pays ≈ 0.13–0.3 s of frozen main thread each time the window is focused. Plans: `SEARCH usage_events USING INDEX usage_page (createdAt>? AND createdAt<?)` then per-row JSON parse (the index is used; the cost is reading and parsing payload rows).
- **Suspect:** `src/main/db/usage.ts:55-65` (`summary`, `rateLimits`), `:25` (`dashboard`), `src/main/ipc/usage.ts:29,32-36`, `src/renderer/usage/meter.tsx:15-17,57`.
- **Evidence:** `EV/perf/perf-b.json` (`ipc`, `blocking`), `EV/perf-b.log`, `EV/explain-timings.json`, `scripts/time-usage.mjs` output (`rateLimits 6097 ms, rss 672 → 1325 MB`).
- **Fix:** compute `summary` and `dashboard` from `usage_daily` (the rollup the design already requires; month = sum over ≤ 31 rows); keep the latest rate limit per provider in a tiny table written when a usage row is recorded; never call `list()` without a LIMIT in a request path; refresh the meter on `usage-updated` only (drop the `focus` listener) and debounce estimates; move any remaining heavy read to a worker. Add a bench case with these three calls to `scripts/bench-db.mjs` (currently it only times `rollupSummary`).

#### P-02 — Grid view not virtualized (warning)
- **Budget:** §7 "virtualized lists in the UI".
- **Steps:** Library → grid view → scroll down 6 pages (850 documents loaded).
- **Actual:** p50 frame 33.3 ms (30 fps), 93% of frames > 25 ms, a 333 ms frame, 6 long animation frames up to 319 ms. With 5,000 docs the grid mounts 5,000 cards.
- **Suspect:** `src/renderer/library/index.tsx:659` (`items.slice(grid ? 0 : start, grid ? items.length : end)`).
- **Fix:** virtualize grid rows the same way as list rows (row height is already `--library-card-height`), `content-visibility: auto` on cards. Add the grid case to `e2e/library-perf.mjs`.
- **Evidence:** `EV/perf/perf-b.json` (`scroll`).

#### P-03 — First document open takes ~1.5 s (warning)
- **Steps:** launch, Library → open any document (first time in the session) vs the following opens.
- **Actual:** first open: metadata 56 ms but first content **1,564 ms** (5k-doc DB); subsequent opens 115–160 ms. The renderer lazy-loads `document-presentation-*.js` (3,792 KB) on first use; `app.tsx` prefetches only the Welcome chunk.
- **Suspect:** `src/renderer/document-elements.tsx:10` (`lazy(() => import('./document-presentation'))`), `src/renderer/app.tsx` (idle prefetch).
- **Fix:** `import('./document-presentation')` in the same `requestIdleCallback` as Welcome; split KaTeX/Mermaid/highlight out of that chunk.
- **Evidence:** `EV/perf/perf-b.json` (`openSmall`).

#### P-04 — Large document: render cost and selection latency scale with document size (warning)
- **Budget:** §7 "open a document < 50 ms to first paint of metadata" (met: 20 ms) — the content is not covered by a budget.
- **Steps:** import a 2 MB Markdown; open it; select any sentence.
- **Actual:** 36,391 DOM nodes, first content 594 ms, settled 894 ms, one 557 ms main-thread task, 141–159 MB JS heap; selection→action button **651–683 ms regardless of selection size** (15 ms for a 284-byte document), and the handler runs on every `selectionchange`, so dragging a selection in this document freezes for ≈ 0.65 s per event.
- **Suspect:** `src/renderer/markdown.tsx:95-125` (`update` on `selectionchange` calls `rangeSelection`), `src/renderer/selection.ts` (offset mapping by walking the DOM), `src/renderer/markdown.tsx` (renders the whole document).
- **Fix:** compute offsets from `data-source-start/end` attributes emitted at render time instead of walking text nodes; debounce selection handling to `mouseup`/`keyup`; render long documents in chunks (`content-visibility: auto` + `contain-intrinsic-size`, or windowed blocks) and render the first screen first.
- **Evidence:** `EV/perf/perf-c2.json`, `EV/perf-c.log`.

#### P-05 — Startup bootstrap cost (warning)
- **Actual:** every launch calls `converter.ensureReady()` (`src/main/ipc/documents.ts:26`) → starts a warm Python worker that stays resident (**128–140 MB**, 0% CPU) even if the user never converts a non-text file; a fresh profile spends ≈ 10 s of background `uv` work and writes a **321 MB** venv per `--user-data-dir`; with no network and no `uv` cache a DOCX/PDF import fails after 4.5 s showing raw `uv` stderr (P-13). Total resident app memory at rest is 523–777 MB.
- **Suspect:** `resources/converter/index.ts:115-174` (`install`, `ensureReady`), `src/main/ipc/documents.ts:26`, `warm-worker.ts`.
- **Fix:** start the worker lazily on the first non-Markdown import (or after a short idle delay), kill it after N minutes idle, share one venv across profiles (`~/Library/Application Support/VStudy Pro/converter-venv` is already per user; make the path stable for dev/test profiles), pre-build the venv at install time.
- **Evidence:** `EV/perf/perf-a-start.json` (`childProcs`), `EV/perf/perf-g2.json`, `perf-g3b.json`.

#### P-06 — Storage amplification (warning)
- **Budget:** §7 "Large content … stays on disk … FTS stores a separate index with external content or contentless table".
- **Actual:** `document_fts` is a regular FTS5 table (stores `content`) with `tokenize='trigram'`: 50 imports of 5.2 MB of Markdown grew the DB by 13.2 MB (2.5×) and the library directory by 10.9 MB; the 54 MB stress corpus gave a 209 MB DB (3.9× text). `usage_events` stores every field twice (columns + a JSON `payload`) and has **six** indexes (`usage_created`, `usage_document`, `usage_conversation`, `usage_page`, `usage_provider_model`, `usage_document_date`): 1M rows = 1.12 GB.
- **Suspect:** `src/main/db/library-migration.ts:44` (`CREATE VIRTUAL TABLE document_fts … content`), `src/main/db/usage.ts:68-75`, `db/library-migration.ts:37-38`.
- **Fix:** `content=''` (contentless, with `contentless_delete=1`) or external content on `documents`/the file; drop `payload` and the redundant indexes (`usage_created` duplicates `usage_page`, `usage_document` duplicates `usage_document_date`).
- **Evidence:** `EV/perf/perf-e.json` (`db`, `dbFinal`), `EV/fts-stress.log`.

#### P-07 — Open-document metadata paint 54.5 ms with the large DB; folder tree not virtualized (warning)
- **Budget:** < 50 ms to first paint of metadata.
- **Actual:** 54.5 ms p50, 67 ms max on the 5,000-doc / 400-folder DB; 26 ms on the small DB. The 400-item folder tree puts 5,722 DOM nodes on every screen (Home 5,333).
- **Suspect:** `src/renderer/library/sidebar.tsx:209` (renders every visible folder), `src/renderer/shell/index.tsx` (view transition on every navigation).
- **Fix:** virtualize or `content-visibility: auto` the tree; cap initial expanded level.
- **Evidence:** `EV/perf/perf-b.json`, `perf-a-start.json` (`domNodes`).

### Polish

#### P-08 `EXPLAIN QUERY PLAN` findings
(`EV/explain.json`) Full table scans or sorts on statements the design wants covered: (a) `library:counts` (`src/main/ipc/library.ts:19`) `SCAN documents` on every sidebar refresh (0.4–0.5 ms at 5k, O(N)); (b) `ORDER BY coalesce(d.lastOpenedAt,'')` (Recent view and sort-by-opened) cannot use `documents_opened` → `SCAN d` + `USE TEMP B-TREE` (0.8–1.3 ms at 5k); (c) status/type/converter/pinned filters with manual order search an index then sort all matches in a temp B-tree; (d) `DELETE FROM documents` and `DELETE FROM folders` scan `activity_events`/`documents` through foreign keys (missing index on `activity_events(documentId)`, and the `folderId` indexes are partial `WHERE deletedAt IS NULL`); (e) `search.rebuild()` (`src/main/services/search.ts:23-37`) reads `length(content)` over the whole FTS table (14 ms at 24 MB; run at startup) — O(corpus); (f) 2-character CJK search = `LIKE` over FTS content (§4.1). All fast at 5k docs; they fail the "assert index use" intent. Fix: add the statements to the `EXPLAIN` test, store a `lastOpenedAt` NULL-safe index expression or `NULLS LAST`, cache counts in a trigger-maintained table, `CREATE INDEX activity_document ON activity_events(documentId)`.

#### P-09 Streaming costs ≈ 5 ms of script per delta
28% main-thread utilisation at 150 tok/s, saturation at 750 tok/s. No user-visible effect today. Fix: coalesce deltas to one render per animation frame.

#### P-10 250 ms search debounce
Keystroke-to-paint is dominated by the debounce (≈ 70% of 320 ms). Lower to 120–150 ms or search on every keystroke given a ≤ 25 ms query.

#### P-11 GPU wake-ups ≈ 60/s while paused or minimized
Possible `backdrop-filter` layers or CDP screencast; verify with Activity Monitor outside Playwright.

#### P-12 Main-process working set grows ≈ 62 MB / 100 cycles
255 → 310 MB without a JS-heap or DOM change; likely SQLite mmap / page cache but unproven. Re-run a longer soak with `process.memoryUsage()` in main.

#### P-13 Raw tool output as a conversion error
Offline DOCX failure shows `uv` stderr in English with paths and URLs placeholders. Design §4: "Main-process errors … travel as codes plus params". Fix: map converter failures to `errors.converter_unavailable` with a Retry and an offline hint.

---

## 5. Recommended order of work

1. **P-01** (usage rollups, remove `focus`-triggered scans) and **A-01** (reorder in cross-folder views) — both are correctness-level defects against stated budgets/requirements.
2. **A-02** (live region + message authorship) and **A-03/A-04** (focus management): one shared dialog/list pattern fixes most of A-03/A-04/A-05.
3. **A-05/A-06/A-07** (Library grid ARIA, landmarks, dialog names): mostly mechanical; add axe to the e2e on every state listed in §3.1 (the repo's e2e only audits Home/onboarding/Welcome and fails only on serious/critical).
4. **A-08** (sidebar collapse below 720 CSS px) and **P-02/P-03/P-04/P-07** (grid and tree virtualization, prefetch chunk, large-document selection).
5. Then the remaining warnings and polish.

## 6. Test gaps in the repo found along the way

- No e2e asserts focus after an action, live-region behaviour during streaming, grid reorder in cross-folder views, or the 1M-row usage paths (`bench-db.mjs` times `rollupSummary`, not `summary`/`rateLimits`/`dashboard`).
- `scripts/check-contrast.mjs` covers four token pairs only (no syntax colours, no `--hairline`, no translucent surfaces).
- `e2e/library-perf.mjs` covers list scrolling only, and reads `/tmp/vstudy-library-bench/bench.sqlite` which `scripts/bench-db.mjs` does not write by default.
- Documents opened from a bench DB whose Markdown lives outside `userData/library` cannot be read (`containedPath`); the repo bench seeder places files outside the library root, so UI benchmarks need documents imported through the app (done here).

---

## Appendix A. Manual VoiceOver test script (for a human; NOT run by this audit)

**Why this is a script and not a result.** macOS VoiceOver cannot be driven reliably from automation: it needs the Accessibility/Screen-Recording permissions of a real login session, it posts speech through the system synthesiser (no API to read what it said), and its quick-nav keys are consumed before Electron sees them. I did not run VoiceOver. Everything in §1–§6 comes from the Chromium accessibility tree (CDP `Accessibility.getFullAXTree`) and axe-core; those are necessary, not sufficient. Treat every "pass" in this document as "no defect found in the tree", not "works with VoiceOver".

**Setup.** macOS 14+; build of `6af28fb` run from a fresh `--user-data-dir`; System Settings → Accessibility → VoiceOver → Verbosity default; turn on *VoiceOver Utility → Visuals → Show caption panel* so what is spoken can be screenshotted. Toggle VO with ⌘F5. VO modifier ("VO") = Control+Option. Test each flow in English first, then once with the UI in 繁體中文 and once in 日本語 (voice: Mei-Jia / Kyoko) because several defects below are language-specific. Record for every step: *spoken output (caption panel), focus ring location, pass/fail*.

| # | Task | Steps (VO commands) | Expected | Known risk from the automated audit |
|---|---|---|---|---|
| 1 | Launch, orientation | Open app. VO+U (rotor) → Landmarks. VO+U → Headings. | Landmarks: navigation, main, complementary (sidebar). One H1 per view. A skip link is the first Tab stop. | The Library has **no `main` landmark** (axe `landmark-one-main`); Workspace compact (<1000 px) has **no H1**; two "Skip to content" links in Workspace. |
| 2 | Home | VO+→ through the page. Activate "What is VStudy Pro?". | Greeting is an H1; cards are named regions; streak and token figures are read with units; the sparkline has a text alternative. | Tab lands on a non-interactive `span` (the greeting subtitle) — check what VO says. Dashboard stat has `aria-label` that replaces the visible text ("Tokens · $…" may be lost). |
| 3 | Import | Library → VO+Space on *Import document*. Choose a file in the native sheet. | After the sheet closes VO announces the result (new row, or progress). | **No status announcement and focus returns to `body` in some paths.** Listen for silence. |
| 4 | Library list as a grid | VO+Shift+↓ to interact with "Documents, grid". Use VO+arrows to move through rows. Try ⌘A, Space (select), Return (open). Open the row menu with VO+Shift+M and with the "Document options" button. | Row = "name, folder, type, size, date"; selection state spoken ("selected"); menu opens with focus on first item; Escape closes and returns to the row. | axe: `aria-required-children` (critical) on the grid, `aria-allowed-role` on 50 rows. VO may read the grid as "table, 1 column", and every row has 4 Tab stops. |
| 5 | Folder tree | Tab into "Folders, tree". ↓/↑, →/← to expand, Return to open, F2 to rename, Shift+F10 (or VO+Shift+M) for options. | "Folder 3, collapsed, level 1, 4 of 14"; expanding announced. | **Leaf folders report "collapsed"** (`aria-expanded=false` on items without children); no `aria-setsize/posinset`, so no "4 of 14". |
| 6 | Create folder | Tab to *New folder* → VO+Space. Type a name, Return. | Dialog announced with its title; focus in the text field; after Return, the folder is announced. | Focus lands on the × Close button, not the field (typing a space presses Close). Check what VO says and whether the typed name is lost. |
| 7 | Move to… | On a row: VO+Shift+M → "Move to…" → choose a folder. | Modal dialog "Move to…"; VO is trapped inside; choosing closes it and announces "Documents moved · Undo". | Focus returns to `body` after the move; the toast is `role=status` but check it is spoken. |
| 8 | Pin | Tab to the *Pin* button on a row; VO+Space twice. | "Pin, toggle button, off/on". | Button name does not include the document name (all rows say just "Pin"); focus is lost after the list refreshes. |
| 9 | Search and filters | Focus *Search your documents*, type "science". Open *Filters*; change *File type*; close. | "N documents loaded" (polite) after the debounce. Filter panel behaves as a popover/disclosure; Escape closes. | The panel is a plain `div`; **Escape does nothing**; focus does not move into the panel. |
| 10 | Open document and read | Return on a row. VO+Cmd+H (headings) in the reader. | Focus moves to the document or its title; headings navigable; table/list/math announced. | Focus drops to `body` after navigation. The Markdown pane has `tabindex=-1` and no caret, so **VO's own text-selection commands (VO+Shift+arrows) are the only way to select text**. |
| 11 | Select text and ask | Select a sentence with VO+Shift+→. Press ⌘⇧K. Or Tab to *Use this section* on a heading. Type a question, Return. | Selection chip announced; composer focused. | Composer is not focused after ⌘⇧K / section buttons. The reply is **not in a live region** — listen for silence when the answer finishes streaming. |
| 12 | Streaming and Stop | Send a question. While it streams, VO+→ to read the transcript. Press Escape; also reach *Stop generating* by Tab. | Polite, throttled announcements; "Stopped" announced. | Zero live regions on the transcript (measured). Also check that VO does not read each token chunk if the dev adds a live region. |
| 13 | Model and effort | Tab to *Model* (combobox). Return. ↓ through models. Tab to *Effort*, ←/→. Escape. | Listbox with option count; radio group "Effort, Low selected, 1 of 2"; Escape returns focus to the trigger. | Popover content has an `h4` with no preceding `h2/h3` (heading-order). Conversation popover has `role=dialog` with no name. |
| 14 | Settings, language | *Open settings* → dialog. Change *Interface language* to 日本語. Close. | Dialog has a name; language change is announced in the new language; focus returns to *Open settings*. | Dialog has **no accessible name**; after Escape focus returns to `body`. |
| 15 | Usage | Settings → *Usage* tab. VO+→ through the chart and totals. | Chart has a text alternative and a table of exact values. | Verify the SVG `role=img` label is meaningful and that the data table is reachable. |
| 16 | Onboarding | Fresh profile. Step through 4 screens with Tab/Return. | Each step heading takes focus and is spoken; progress announced; Escape ends. | Verified: heading focus works. After finishing, focus goes to `body`. |
| 17 | Welcome | *What is VStudy Pro?* → Welcome. Tab to *Pause animations* → VO+Space. Walk sections with the section nav. | Toggle button announced as pressed; the demo's animation is described; countdown numbers read once. | Escape does not leave Welcome; check the "Go to Demo" nav gets sensible roles. |
| 18 | Errors | Send `test error` (with the fake provider) or disconnect a provider. | Error announced as an alert with a Retry button. | Verified: alert role present. |
| 19 | CJK language and pronunciation | In English UI, open the Library with Chinese/Japanese titles. | VO reads each title with the right voice. | Titles have **no `lang`** attribute, so VO reads them with the English voice (WCAG 3.1.2). |
| 20 | Reduce Motion / Transparency | System Settings → Accessibility → Display: Reduce motion, Reduce transparency, Increase contrast. Relaunch. | UI follows each setting. | Increase contrast is **not honoured** (no pixel change); Reduce Transparency is read once at start. |

**Shortcut conflicts to listen for while VO is on:** `Control+Option+↑/↓` (the app's row-reorder shortcut) is the VoiceOver navigation chord and will never reach the page; the macOS-friendly alternative in the code is `⌘+Option+↑/↓`. `⌘⇧K` is unused by macOS. `Shift+F10` and the Menu key do not exist on most Mac keyboards; VoiceOver users reach the same menu with VO+Shift+M, which fires `contextmenu` and works.

**Pass criteria.** A step passes only if (a) the spoken text identifies role, name and state, (b) focus is on the element VO is describing, and (c) nothing important happens silently. Log failures against the defect IDs in §3.6 / §4.2.
