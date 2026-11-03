# Product design v2: library, home, onboarding, i18n, hardening

Decided by the lead. Workers implement this; deviations need evidence.

## 1. Library

Every imported file keeps both forms: the original (`library/<hash>/source.<ext>`) and the Markdown (`content.md`). The Library is the place users organise them.

**Model**
- `folders(id, parentId NULL, name, color NULL, icon NULL, position REAL, pinned INT, pinnedAt, createdAt, updatedAt)`; nesting depth max 8; sibling names unique case-insensitively; deleting a folder asks whether to move contents to the parent or to Unfiled; never cascade-delete documents silently.
- `documents` add `folderId NULL` (NULL = Unfiled), `position REAL` (fractional indexing for cheap manual reordering), `pinned INT`, `pinnedAt`, `lastOpenedAt`, `pageCount NULL`, `sizeBytes`, `mime`, `converter`, `contentChars`.
- `tags(id, name UNIQUE NOCASE, color)` and `document_tags(documentId, tagId)`; optional, shown as chips.
- Smart views (not stored folders): All, Recent, Pinned, Unfiled, Converting/Failed.
- `saved_filters(id, name, queryJson, position)`.

**Sort**: manual (default inside a folder), name, date added, last opened, size, type. Direction toggle. Persisted per view.

**Filters** (combinable, shown as removable chips, count badges): file type group (PDF, Word, Excel, PowerPoint, Markdown/Text, Web, Other), status, converter, folder (with subfolders toggle), tag, date added range, size range, has chats, pinned, language of content if detectable. Free-text search over title + filename + Markdown content (FTS5, snippets with highlight). CJK: default `unicode61` does not segment Chinese/Japanese. Evaluate `trigram` plus short-query fallback versus a bigram-preprocessed index with real zh-Hant/ja fixtures (two-character words like 資料, 通信 must be findable); pick with tests.

**Interactions**: drag documents onto folders and to reorder; every drag operation has a keyboard/menu alternative ("Move to…", Cmd+Up/Down reorder); multi-select with Shift/Cmd; context menu (Open, Rename, Move to…, Pin, Tag, Reveal in Finder, Export Markdown, Export original, Re-convert, Delete); undo for move/delete (soft delete with 30 s undo toast, then purge); folder tree is an ARIA treeview.

## 2. Home dashboard

First screen when no document is open (and via a Home button). Cards, in a responsive grid (1-3 columns):
- Greeting with the user's name if set (else none), local time-of-day phrase, a rotating one-line prompt with a calm typewriter/cross-fade animation (respects reduced motion).
- Continue: the last 3 opened documents with last chat snippet and progress marker.
- Upload: a drop zone card (drag, click, paste path); shows conversion progress inline.
- Pinned folders and pinned documents (drag to reorder pins).
- Token usage: this month tokens and cost, a 14-day sparkline (from daily rollups), budget meter if set, link to Usage.
- Study streak: current streak, best streak, last 7 days as dots, today's status. A "study day" = local calendar day with at least one of: a chat message sent, a document read for 60 active seconds, a document imported. Streak continues until the end of the day after the last study day (grace until midnight tonight). Stored in `activity_days(date TEXT PK, chatCount, readSeconds, importCount)`; the date is the user's local date computed in main with Intl; no network.
- Recent activity list (imports, chats), collapsible.
Empty states are designed, not blank.

## 3. Onboarding and empty states

First run only (re-runnable from Settings): 1) Welcome with language choice (defaults from system locale), 2) Connect a model (detect claude/codex/agy; paste an API key; skip allowed), 3) Bring a document (drop zone or "Try a sample document"), 4) A three-tip coach for selecting text and asking. Progress dots, Back/Skip, keyboard friendly, no dark patterns. Welcome words and empty-state copy are written per locale by hand, not machine-literal. Blank chat state shows the rotating suggestions with a gentle animated reveal. All animation: 150-300 ms, easing out, disabled with `prefers-reduced-motion`.

## 4. Languages

English, Traditional Chinese (zh-Hant, Taiwan usage), Japanese. Default from `app.getLocale()`; switcher in Settings and onboarding; persisted. Library: `i18next` + `react-i18next` (or equivalent, lightweight), namespaced catalogs under `src/shared/locales/{en,zh-Hant,ja}/`, ICU plurals; dates, numbers, currency through `Intl` using the active locale. No string literals in components (lint rule), a test that every key exists in all three locales with identical interpolation variables, and a pseudo-locale for layout testing. Main-process errors and statuses travel as codes plus params, never as English sentences; the renderer translates. Native dialogs (open/save/confirm) get localized titles. CJK typography: system font stacks (PingFang TC / Hiragino Sans / Noto), line-height and letter-spacing tuned, `lang` attribute set, `word-break`/`line-break` rules for CJK. Setting "Reply language": Auto (follow the user's message), or fixed; it is added to the system prompt. Documents themselves are never translated unless the user asks.

## 5. Visual language

Keep the current calm, simple look; make it more crafted.
- **Radius scale** (tokens): `--r-xs 6` (chips, inputs inner), `--r-sm 10` (buttons, controls), `--r-md 14` (cards), `--r-lg 20` (sheets, large panels), `--r-pill 999`. Concentric rule: inner radius = outer radius minus the padding between them. No ad-hoc radii.
- **Material**: surfaces are layered. Window uses macOS vibrancy (`sidebar`) under the library sidebar. Cards: `background: color-mix(in oklab, var(--surface) 72%, transparent)`, `backdrop-filter: blur(20px) saturate(1.15)`, 1 px hairline border at ~8% opacity, soft two-layer shadow; solid fallback when `prefers-reduced-transparency` or the OS Reduce Transparency setting is on.
- **Elevation tokens** (flat, raised, floating), **opacity tokens** (hover 4%, pressed 8%, disabled 40%), 4 px spacing grid, type scale (11/12/13/15/17/22/28), semantic colors in OKLCH with checked contrast (AA), light and dark.
- Icons: one consistent set (Lucide). Motion tokens (fast 120, base 200, slow 320).
- All tokens in one file; no hard-coded colors, radii or shadows in components.

## 6. Security (Electron + local data)

Checklist the hardening worker must verify with tests or evidence:
- Electron Fuses via `@electron/fuses`: RunAsNode off, NodeOptions env off, `--inspect` CLI off, cookie encryption on, `onlyLoadAppFromAsar` on, embedded ASAR integrity validation on. Hardened runtime + entitlements for macOS packaging (no unneeded entitlements), notarization-ready config, no `allowJIT` unless required.
- Window: `contextIsolation`, `sandbox`, `webSecurity` default, no `webviewTag`, `will-navigate`/`setWindowOpenHandler` deny, permission request handler deny-all except explicit, `session.setPermissionCheckHandler`, CSP via headers, no `unsafe-eval`, `style-src 'unsafe-inline'` only if unavoidable and documented.
- IPC: every channel zod-validated, sender frame URL verified, no raw file paths from the renderer except dialog/drop through `webUtils`, rate limits on expensive channels (import, chat, export), size caps.
- Files: validate type by magic bytes not only extension; OOXML/zip bombs (compression ratio, entry count, total uncompressed size caps) before conversion; symlinks rejected; library dir mode 0700, DB and secrets 0600; atomic writes; path containment checked with realpath.
- Secrets: safeStorage only, never logged, redaction in logs and error reports, keys cleared from memory buffers where practical; no secrets in command-line args (use env of the child or stdin).
- Child processes: argv arrays, scrubbed env, cwd isolation, resource limits, process-group kill (already in place); CLIs never given tools.
- Prompt injection: document text is untrusted data, delimited, never able to trigger actions; citations and tool calls validated in main; no network tools.
- Supply chain: exact pins, `pnpm audit` clean or documented, `--ignore-scripts` review of postinstall, lockfile integrity, a license/SBOM report.
- Data: soft-delete purge really deletes files; "Delete all data" in Settings; no telemetry.

## 7. Database and performance

Budgets, measured with a seeded benchmark (5,000 documents, 400 folders, 100,000 messages, 1,000,000 usage rows): list a folder page < 15 ms, open a document < 50 ms to first paint of metadata, FTS search < 80 ms for typical queries, dashboard load < 100 ms, cold start to interactive < 2 s.
- Indexes designed from the actual queries; `EXPLAIN QUERY PLAN` tests assert index use for every hot query.
- Pragmas: WAL, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout`, `temp_store=MEMORY`, `mmap_size`, `cache_size`, periodic `PRAGMA optimize`, incremental vacuum on idle.
- Large content (Markdown, originals) stays on disk; list queries never read it; FTS stores a separate index with external content or contentless table.
- Pagination (keyset) for libraries, messages and usage; virtualized lists in the UI.
- Rollups: `usage_daily(date, providerId, modelId, in, out, cost, calls)` maintained transactionally; dashboard reads rollups only.
- Caches: LRU for rendered Markdown AST per document hash and converter version; conversion results cached by `sha256 + converterVersion`; HTTP model catalogs cached with TTL; renderer memoization for heavy views.
- Migrations: forward-only, transactional, backup of the DB file before a migration that rewrites data, tested on a snapshot of the previous schema with realistic data.
- Integrity: `PRAGMA integrity_check` on demand and on crash recovery; automatic rebuild of FTS from files if it is inconsistent.

## 8. Accessibility (WCAG 2.2 AA target)

Landmarks and headings, a skip link, full keyboard operation with visible focus rings, ARIA treeview for folders, dialogs with focus trap and return, live regions for streaming (polite, throttled) and toasts, reduced motion and reduced transparency honored, 4.5:1 text and 3:1 UI contrast verified in both themes, text scaling to 200% without loss, no information by color alone, hit targets 24 px minimum, drag-and-drop always has a non-drag alternative. Automated checks with axe-core inside the Electron e2e on every main view, plus a manual VoiceOver script (unverified until a human runs it).

## 9. Build order

A. (parallel) A1 data model, FTS, rollups, IPC contract, benchmark; A2 i18n framework, string extraction, design tokens, language switcher.
B. (parallel, after A) B1 Library UI; B2 Home dashboard, onboarding, empty states and animations.
C. Cross-cutting: security hardening and audit, performance benchmark pass, accessibility audit with fixes, translation review pass for ja and zh-Hant by an independent reviewer, then an end-to-end review and fix rounds.
Later (not in this scope): AI-assisted PDF improvement per page, with the cost preview from the usage system.
