# UI3 design spec — Settings + Library "All documents"

Design lead: Claude. Implementer: Codex. Feedback being answered (verbatim): "1. the setting view looks messy. 2. the all documents the text might be overlaty. maybe show like title and the other content show at the right instead of under it?"

## 0. State reviewed
- **Baseline: committed `de5c04f`** (UI2 migration + Appearance hooks done; the UI2 worker still has a focus-guard test and evidence docs pending, none touching Settings/Library). Between `b5f7cb4` and `de5c04f` no Settings/Library/Usage/`style.css` file changed; `tokens.css` only gained CJK font-family layering (`--font-cjk:initial` + `@layer base :where([lang=...])`), which does not affect these defects. I edited, reverted and stashed nothing.
- **Screenshots are FINAL** (re-shot 10:2x Taipei after the UI2 quiet window, from a private copy of the build, private userData dir; working tree at HEAD `674edda`, which only adds `welcome/index.tsx` + docs on top of `de5c04f`; `out/` was not older than `src/`). Script `/tmp/vstudy-ui3/capture.mjs`, runner `/tmp/vstudy-ui3/reshoot.sh`, raw metrics `/tmp/vstudy-ui3/report.json`. The earlier 09:46 images were superseded (kept in `/tmp/vstudy-ui3/provisional-0946/`). "200% text" shots (`*-text200.png`) set `--ui-scale:2` on `<html>`, the same hook Appearance will drive.
- **There is no Appearance section today.** `tokens.css:179-199` only defines hooks (`--ui-scale --density --accent-l/c/h --font-ui --font-cjk --font-reader --reader-size --chat-size --material-*`). Section §2.6 is new work and needs settings fields. Note `--font-cjk` is now `initial` by design: the Appearance font control must set `--font-reader`/`--font-ui` only and let the `lang` layers keep supplying CJK fallbacks.

## 1. Defects found
Screenshots: `/tmp/vstudy-ui3/<name>.png`, `<name>` = `{settings-providers|settings-usage|settings-privacy|library-all|library-selected-hover|library-search}-{1280|960}-{light|dark}[-bottom|-text200]` (`library-search` is 1280 only).

### Settings (`providers.tsx:43-71`, `style.css:610-665,984-996`, `tokens.css:78-81`)
- S1 **One long scroller, everything stacked.** `.settings-dialog` is the scroller (`overflow:auto`, 680px wide), so the title and close button scroll away. Content height 1280px (Providers), 1354px (Usage), 961px (Privacy) in a 766px (1280×800) / 606px (960×640) dialog. See `settings-providers-960-light-bottom.png`.
- S2 **Global controls repeated on every tab.** Interface language, Reply language, the note, "Show welcome guide" and "What is VStudy Pro?" sit above the tabs, so ~230px of every tab is unrelated to it. `settings-usage-1280-light.png`.
- S3 **Wrong hierarchy.** The tab strip sits *under* the global controls and *under* the title, while the title text changes per tab ("Providers & API keys", "Usage", "Privacy"). The tabs have no visual weight; the content below it starts with a 30px gap.
- S4 **Button wall.** Welcome buttons are touching bordered outline buttons (zero gap, `settings-usage-1280-light.png`); each provider shows up to 4 bordered buttons + a full-width input. Every control uses `variant="outline"`, so nothing is primary.
- S5 **Inconsistent controls.** Native `<select>` (Usage period) next to the custom `Select` (language); raw `Checkbox` instead of shadcn `Switch`; Privacy is bare `<h3>`/`<p>` with no spacing system (`settings-privacy-960-dark.png`: h3 → paragraph → button → paragraph with 0px gaps).
- S6 **Separators instead of structure.** Providers are divided only by `border-top` rules plus 16/18px ad-hoc margins; Privacy has none. Spacing mixes 6/8/10/12/16/18/24px literals (`style.css:625-665`).
- S7 **Pointer-focus ring on tabs.** After a click the tab keeps a double ring (`settings-usage-1280-light.png`, "Usage" tab).
- S8 **Close button** is a bordered ~42px "×" glyph button (`variant="outline"`), visually heavier than the title.
- S9 **Width jumps.** Usage tab widens the dialog to 880px (`usage.css:19`), so the dialog resizes when switching tabs.

### Library list (`library/index.tsx:624-900`, `library.css:23-79,293-302`)
- L1 **Clipped second/third line = the "overlap" the user sees.** Row is a fixed 64px (`rowHeight`, `--library-row-height`), `position:absolute`, `overflow:hidden`, but the content is title (≈22px) + meta (≈20px) + `.document-forms` (tags/retry/progress) → the meta line is cut off by the row's bottom border (`library-all-1280-light.png`: "Graduate Seminar — Computational Linguistics · MD · 1.6 kilobytes" cut in half) and **tags are never visible** (fully clipped). In search mode the row is 96px with snippet and is still cramped.
- L2 **Metadata under the title instead of beside it** (user's request): folder path · type · pages · size · date are one `·`-joined line; the folder path (first child) is the only shrinkable item, so at 960px it collapses to "Graduate Seminar — Computational Linguistics › … · MD" with an empty segment (`library-selected-hover-960-dark.png`).
- L3 **Title is an `outline` Button** (border + background on every title). `A` and short titles show a visible rounded box that is narrower than the row; long titles show a box that ends at the ellipsis (`library-all-1280-light.png`).
- L4 **Three trailing bordered buttons** (pin, "…") per row plus a 32px file-glyph tile → 140px of chrome before data; pinned state is only `aria-pressed` on the pin button and looks identical to unpinned (rows 1/2/11 are pinned in the fixture).
- L5 **Selected row uses `inset 4px` left accent bar** (`library.css:40-43`); hover has no style; no `.library-document:hover` or `:focus-visible` rule exists in `library.css`, so hover is unstyled and keyboard focus relies on a global fallback.
- L6 **Bulk bar covers the last rows** (`library-selected-hover-960-dark.png`: "1 selected" bar over rows 6–7) because it is absolutely positioned over the scroller with no bottom padding.
- L7 **200% text:** `-text200` shots show rows with 3-line content in 64px, title ellipsised to ~12 chars. Row height must scale with text.
- L8 **Toolbar breaks at 200% text.** Search field collapses to an empty ~60px box, Filters/sort/direction/view buttons wrap to two lines of unequal size, title "Library" is 56px (`library-all-960-light-text200.png`).
- L9 **Pointer focus border on search.** Clicking the search field draws a double dark ring around the input inside its own bordered wrapper (`library-search-1280-light.png`). Same class of bug as S7; the field should use the single wrapper `focus-within` style, no ring on pointer focus.
- L10 **Search rows still clipped:** the 96px row holds title + meta + snippet + tags, so tag chips are cut in half (`library-search-1280-light.png`, rows 2-5).
- **Measured (report.json, `capture.mjs` flags content that exceeds its row box):** every Library capture has `clippedMeta` 17 at 1280 and 960 (5 in search mode, 29 at 200% text) and row height stays **64px at 200% text** (96px in search). At 200% text the 960 row is only 382px wide. Overlap detector (`overlaps`) is 0: the problem is clipping and crowding, not box-on-box overlap, so the acceptance test must assert *content inside row box* as well as non-intersection.
- Settings measured (dialog always 680px wide): content height Providers 1280 / Usage 1354 / Privacy 961 px against a 766px (1280×800) or 606px (960×640) dialog; at 200% text Providers = **2327px** (`settings-providers-1280-light-text200.png`: 70px-tall inputs, three buttons per provider wrap, 3 provider rows span 1.5 screens). 26/17/14 interactive controls per tab (incl. the repeated global ones).
- Fixture: long EN (118 chars), ZH/JA/KO titles, 1-char title, 3 folders incl. nested + pinned, 3 pinned docs, tags.

## 2. Settings redesign

### 2.1 Structure (shadcn: `Dialog`, `Tabs` vertical + `TabsList variant="line"`, `Card`-less plain sections, `Switch`, `Select`, `Input`, `Textarea`, `Button`, `Separator` only if needed, `ScrollArea`)
```
Dialog  width:min(880px,calc(100vw - 32px)); height:min(640px,calc(100dvh - 32px)); NOT scrollable itself
├─ header  height 56px, padding 0 24px, border-bottom 1px var(--hairline): h2 "Settings" 15px/600 · Button ghost icon-sm (lucide X 16px, aria-label=common:close_settings)
└─ body    display:grid; grid-template-columns:200px minmax(0,1fr); min-height:0; container-type:inline-size; container-name:settings
   ├─ nav  (TabsList, vertical) padding 12px; border-inline-end 1px var(--hairline)
   └─ pane (TabsContent) overflow:auto; padding 24px 32px 32px; contents max-width:720px
```
- One title: "Settings" (fixed). Section name is the pane `h2`. Dialog size is **constant across sections** (kills S9: delete `.usage-dashboard-dialog` width override).
- Sections, in order, each with a lucide icon 16px: **General** (SlidersHorizontal), **Appearance** (Palette), **Providers** (KeyRound), **Usage** (BarChart3), **Privacy** (Shield). Default = `initialTab` prop if given, else `general`. Keep the existing `initialTab="providers"|"usage"|"privacy"` callers working. Keep the `Tabs`/`TabsContent forceMount` pattern and every `data-testid` / aria-label used by e2e (`language`, `replyLanguage`, `privacy-settings`, `#welcome-settings-entry`, the "Show welcome guide" accessible names).
- Nav item: height 36px, padding 0 12px, gap 10px, radius `--r-sm`, 13px/500, `--ink`; icon `--muted`. Hover `color-mix(in oklab,var(--ink) calc(var(--opacity-hover)*100%),transparent)`; selected = `background:var(--active)`, weight 600, **no left bar**; `:focus-visible` = `outline:2px solid var(--focus); outline-offset:-2px`; no ring on pointer focus (`html[data-input-modality=keyboard]` guard already exists).
- Narrow: `@container settings (max-width: 40rem)` (rem so 200% text triggers it) → body becomes one column; nav becomes a horizontal scrollable strip (height 44px, `overflow-x:auto`, items `flex:none`, border-bottom hairline instead of border-inline-end), pane padding 16px 16px 24px.

### 2.2 Section anatomy
- Pane header: `h2` 17px/600/1.3 (`--type-lg`), then `p.muted` 13px/1.5, max-width 60ch, margin-top 4px; margin-bottom 24px.
- **Group** = optional `h3` (12px/600, `--muted`, margin 0 0 8px 4px) + **one quiet card**: `border:1px solid var(--hairline); border-radius:var(--r-md)` (14px); `background:color-mix(in oklab,var(--ink) 3%,var(--surface))`; `box-shadow:none`; `overflow:hidden`. Groups are separated by 24px (`--space-6`). **No card inside a card**; nothing inside the card draws its own border except inputs/buttons.
- **Row**: `display:flex; flex-wrap:wrap; align-items:center; gap:12px 24px; padding:16px 20px; min-height:64px`; rows after the first get `border-top:1px solid var(--hairline)` (only separator in the card).
  - Text block `flex:1 1 14rem; min-width:0`: label 13px/500 `--ink`; description 12px/1.5 `--muted` (margin-top 2px).
  - Control block `flex:0 1 auto; margin-inline-start:auto; display:flex; gap:8px; align-items:center`. Widths: Select 200px, text/number input 160–260px (see below), Switch intrinsic, Button intrinsic (`size="sm"`, h-8).
  - `data-layout="stack"` (provider keys, price JSON): control block `flex:1 1 100%`, goes under the text block.
  - Because bases are in rem, rows reflow to stacked automatically at narrow widths and at 200% text; never rely on px breakpoints inside a row.
- Spacing tokens only: 4/8/12/16/20/24/32 via `--space-1..8` (these multiply by `--density`; do not add literals). Radii `--r-sm` controls, `--r-md` cards. Opacity: hover `--opacity-hover`, pressed `--opacity-pressed`, disabled `--opacity-disabled`. Type: only `--type-sm` 12 / `--type-base` 13 / `--type-lg` 17.
- Buttons: one primary per section at most (`variant="default"`, `size="sm"`, e.g. "Save key"); everything else `variant="secondary"` or `ghost`, `size="sm"`; destructive = `variant="ghost"` with `color:var(--danger)`. No `outline` buttons in settings.

### 2.3 General
Group "Language": row *Interface language* (Select 200px), row *Reply language* (Select 220px) with the existing `reply_note` as that row's description (drop the standalone paragraph). Group "Welcome": row *Welcome guide* → `Button secondary sm` "Show welcome guide"; row *About VStudy Pro* → "What is VStudy Pro?". Keep `#welcome-settings-entry` on the second button and its focus-return behaviour (`shell/index.tsx:89-96`).

### 2.4 Providers
Pane description = the "keys are saved securely…" sentence. Group 1 (single row): *Read-only structured tables* + description `optional_table_presentations…` + `Switch` (replace `Checkbox`; keep error `role=alert` under it). Group 2 "Providers": one row per provider, `data-layout="stack"`: line 1 = name 13px/600 left, status right (12px muted; key saved = Check icon 14px `--ink`); line 2 (API) = `Input` flex 1 min 12rem + `Button default sm` "Save key" (disabled until text) + `Button ghost sm` "Use without saving keys" + (if key) "Unlock" ghost + "Remove" ghost danger; wraps naturally. OpenAI-compatible adds a second line: `Input type=url` + "Save URL". CLI rows: line 1 name + status; control = `Switch` labelled `enable_cli`; line 2 muted `binary_path: <code>` (truncate, `title`) + `Button ghost sm` "Change". Alerts/status `p[role]` render under their row at 12px, not as bold ink.

### 2.5 Usage / Privacy
- Usage: pane header, then `UsageDashboard` content placed directly in the pane (its own sub-borders removed), period `Select` (shadcn) + "Refresh usage" `ghost` in a toolbar row right-aligned above it. Budgets group: three rows (label+description left, `Input` 120px right-aligned numbers, `tabular-nums`), *Price overrides* = stack row with `Textarea` (rows 5, 12px mono, `--font-mono`), footer row inside card right-aligned: `Export CSV` secondary + `Save usage settings` default. Status line as 12px muted under the card.
- Privacy: three groups with `h3`: *Network activity* (row description + `Refresh` ghost; event list inside the same card as rows 12px: time left `tabular-nums`, event/endpoint right, `min-width:0; overflow-wrap:anywhere`), *Document converter* (row *Stop converter after idle minutes* + `Input type=number` 88px; row *Converter mode* with two secondary buttons Retry / Offline), *Delete all data* (card border `color-mix(in oklab,var(--danger) 35%,var(--hairline))`; row text + `Input` 160px placeholder `DELETE` + destructive ghost button). Keep `aria-label`s and the `DELETE` confirmation logic.

### 2.6 Appearance (new) — live preview
Persist as new settings fields (add to `settingsSchema` + defaults + IPC; apply on load in `shell/index.tsx` next to `applyLanguage`, and on change immediately — no Save button): `uiScale` 100|125|150|200 (→ `--ui-scale` 1|1.25|1.5|2), `density` comfortable|compact (→ `--density` 1|.875), `accent` neutral|blue|green|violet|amber (→ `--accent-c`/`--accent-h`: 0/0, .12/250, .11/150, .12/300, .11/70), `readerFont` system|serif|mono (→ `--font-reader`), `readerSize` s|m|l|xl (→ `--reader-size` .8125|.875|1|1.125rem), `material` glass|solid (→ `html[data-material]`). Defaults must reproduce today's look exactly. Controls: `ToggleGroup` (single) for scale/density/readerSize/material, `Select` for font, 5 accent swatches (24px circles, `role=radio`, 2px ring on selected) in a `RadioGroup`-style row.
Layout (`container-name:settings`): `@container settings (min-width: 44rem)` → `display:grid; grid-template-columns:minmax(0,1fr) 280px; gap:24px; align-items:start`, preview column `position:sticky; top:0`. Below that: single column, **preview first** (so the change is visible), then the controls card.
Preview (`aria-hidden`, `role=img` label "Preview", not interactive): a card same surface style, 16px padding, shows a sample document title (`--type-lg`/600), 2 lines of reader text using `--font-reader --reader-size --reader-leading` ("The quick brown fox… 字體預覽 Aa 你好 日本語"), one chat bubble at `--chat-size`, one accent button and one "selected row" using `--active`/`--accent-color`. It consumes the real root tokens (no scoped copies) so preview == app.

## 3. Library "All documents" redesign

### 3.1 Row anatomy (list view; grid/card view unchanged except it must not inherit these rules)
`.library-results` gets `container-type:inline-size; container-name:docs`. Row = CSS grid, **one line**, height `--library-row-height: 2.75rem` (44px at 100%, scales with text; JS virtualization must read it: `parseFloat(getComputedStyle(root).getPropertyValue(...))` → px, replacing the hard-coded `64`; search rows (snippet) = `4rem` with the snippet as a second line *inside the title cell*, 12px muted, single-line ellipsis). Row padding-inline 12px, column-gap 12px, `align-items:center`, **drop** the `overflow:hidden` clip on the row and the 32px file-glyph tile.

Columns, left→right (`grid-template-columns`), all cells `min-width:0`:
| # | cell | width | content | align |
|---|------|-------|---------|-------|
| 1 | gutter | 1.5rem (24px) fixed | Pin icon 14px (filled, `--muted`) if pinned; replaced by `LoaderCircle` 14px (`--muted`) if converting, `AlertTriangle` 14px (`--danger`) if failed; always present even when empty; `sr-only` text "Pinned"/"Converting"/"Failed" | center |
| 2 | title | `minmax(12rem,1fr)` | title 14px/500/1.35, `lang` kept, `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`; ghost-styled `<button>` (no border/background, `padding:0`, `height:auto`, `justify-content:flex-start`, `text-align:start`) | start |
| 3 | tags | `minmax(0,9rem)` | max 2 `Badge variant="outline"` (11px, h-5) then "+N"; overflow hidden | start |
| 4 | folder | 10rem (160px) | folder path, `--type-sm` 12px `--muted`, ellipsis; "Unfiled" in the same style | start |
| 5 | size | 7rem (112px) | `12 pp · 1.6 KB` (`pages` omitted when null) 12px `--muted`, `tabular-nums` | end |
| 6 | added | 5.5rem (88px) | `format.date(createdAt)` 12px `--muted`, `tabular-nums` (no `updatedAt` exists on documents; label column "Added") | end |
| 7 | type | 3rem (48px) | `Badge variant="secondary"` uppercase 11px/600, `rounded-md`, h-5, e.g. `MD` `PDF` | center |
| 8 | actions | 2.25rem (36px) | single `Button ghost icon-sm` "…" (`MoreHorizontal`, existing aria-label `library:actions`); **remove the standalone pin button** (Pin/Unpin stays in the context menu, bulk bar and ⌘-shortcuts) | end |

Column order in DOM: gutter, title, tags, folder, size, added, type, actions (type last so the right edge is consistent; at narrow the badge is the first to survive).
Status extras: `failed` → in the *added* cell show `Button ghost xs` "Retry" (existing handler); `converting` → `<progress>` 64px in the *added* cell. The status-badge text moves to the gutter's tooltip + the `sr-only` label.

### 3.2 Collapse rules (container queries on `docs`, **rem** so 200% text collapses earlier)
Hide with `display:none` (CSS only, so the hidden cell is also removed from the accessibility tree; the same facts stay reachable via the tooltip and context menu) and redefine `grid-template-columns`:
- `< 68rem` (1088px): hide tags.
- `< 52rem` (832px): hide folder.
- `< 44rem` (704px): hide size.
- `< 36rem` (576px): hide added.
- `< 28rem` (448px): hide type. Always visible: gutter, title, actions.
Resulting list widths (container ≈ viewport − 255 sidebar − 64 padding): 1600 → ≈1281px, all columns shown; 1280 → ≈961: gutter,title(≥397),folder,size,added,type,actions; 960 → ≈641: gutter,title(≥373),added,type,actions; 200% text at 960 → only gutter,title,actions. Hidden facts remain available in the title tooltip (below) and the context menu "Details".
Title tooltip: shadcn `Tooltip` (delay 500ms) wrapping the title, content = full title on line 1 (max-width 28rem, wraps) + muted line `folder · type · pages · size · added`; shown only if `scrollWidth > clientWidth` **or** any column is hidden. Replaces the `title=` attribute on `.document-meta`. Row also keeps `aria-label`-less semantics (`role=listitem` unchanged).

### 3.3 States (no left accent bar, no pointer-focus border)
- Row border: only `border-bottom:1px solid var(--hairline)` (last row none). Container `.library-results`: keep one hairline + `--r-md`, **remove its `--elevation-raised` shadow** (already a card on a flat page).
- Hover: `background:color-mix(in oklab,var(--ink) calc(var(--opacity-hover)*100%),transparent)`; the "…" button appears at `opacity:0→1` on hover/focus-within/selected (keep visible on touch/`(hover:none)`); it must still occupy its 36px column when hidden (no layout shift).
- Selected: `background:var(--active)`, no inset shadow, no outline; text unchanged.
- Keyboard focus (`html[data-input-modality=keyboard] .library-document:focus-visible`): `outline:2px solid var(--focus); outline-offset:-2px; border-radius:var(--r-sm)`. Pointer focus (`[data-input-modality=pointer]`): `outline:none`. Inner title/"…" buttons stay `tabIndex=-1` as today.
- Dragging, reorder shortcuts, multi-select, ARIA (`role=list/listitem`, `aria-posinset/setsize`) unchanged.
- Bulk bar: add `padding-bottom:calc(bar height + 24px)` to the scroller when `selected.length>1` so it never covers rows; bar stays centered.
- Optional but recommended: sticky column header, 28px, 12px/600 `--muted`, `aria-hidden`, labels Name/Folder/Size/Added/Type matching the visible columns (same grid template so they always align).

## 4. Acceptance checklist (all measurable by `e2e`; run in light + dark, languages en / zh-Hant / ja)
1. **No overlap:** for every `.library-document` at window widths **960, 1280, 1600**, and again with `--ui-scale` 2 (Appearance 200%), for each pair of visible cells (gutter, title, tags, folder, size, added, type, actions): bounding boxes intersect by ≤ 0px; every visible cell's `scrollWidth ≤ clientWidth` except the title (and tags/folder, which ellipsise); no element's bottom exceeds the row's bottom (`clippedMeta === 0`, as in `capture.mjs`).
2. **Row geometry:** row height = 44px ±1 at 100%, 88px ±2 at 200%; search row = 64px ±1; exactly one text line per cell except the search snippet.
3. **Columns present per §3.2** at each width (assert `getComputedStyle(cell).display`), and the title is ≥ 12rem wide at every width ≥ 960.
4. **Titles:** the fixture titles (long EN 118 chars, 41-char ZH, 36-char JA, KO, 1-char `A`, short EN) render without border/background on the title button; truncated ones show a tooltip with the full title; CJK keeps `lang` and line-height 1.35.
5. **States:** selected row has no `box-shadow` and no left border; hover changes background; mouse click leaves `outline-style:none`; Tab to a row gives a 2px outline with ≥3:1 contrast vs the row background.
6. **Settings layout:** dialog has `overflow` hidden/visible (not auto) and a single scroller (`pane`); header stays visible while pane scrolls; at 1280×800 and 960×640 the dialog fits the viewport (`rect` within window), **dialog size identical for all five sections**; no section needs horizontal scroll at 960, nor at 200% text (`scrollWidth ≤ clientWidth` on pane and dialog).
7. **Settings rows:** within one card every row's label block and control block do not intersect; control right edge x = card right − 20px at ≥ 44rem; at < 44rem or 200% text rows wrap to stacked with 12px gap; no nested bordered card (query `.settings-card .settings-card` = 0).
8. **Appearance:** changing each control updates the `:root` hook live (assert `--ui-scale`, `--density`, `--accent-h`, `--font-reader`), persists across reload, preview is side-by-side at pane ≥ 44rem and stacked (preview first) below; 200% text keeps §6/§7 true; defaults leave `getComputedStyle` of every existing page unchanged (visual regression `ui2-design` still passes).
9. **axe:** zero violations (`wcag2a/aa/21aa/22aa/best-practice`) on Settings (every section), Library list (selected + menu open), both themes, 1280 and 960, 200% text. Nav is a `tablist` with `aria-orientation=vertical`, arrow-key navigation works, focus returns per existing `restore` logic. Contrast: muted text on card ≥ 4.5:1 (`scripts/check-contrast.mjs`).
10. **No regression:** existing unit/e2e (`library.test.tsx`, `library.mjs`, `privacy-settings.mjs`, `a11y-regressions.mjs`, `i18n.mjs`, pseudo-locale `en-XA` still fits) pass; all new strings added to `en`, `zh-Hant`, `ja` locale files; `pnpm lint` and `pnpm typecheck` clean.

## 5. Implementation notes for Codex
- Files: `providers.tsx` (shell/nav/sections), new `settings/` components (`SettingsRow`, `SettingsGroup`, `AppearanceSection`), `language-settings.tsx`, `privacy-settings.tsx`, `provider-row.tsx`, `usage/settings.tsx`, `library/index.tsx` (row markup, `rowHeight` from CSS var), `library/library.css` (replace lines 23-79 and 293-302; drop `.document-glyph`, `.document-forms` in list view), `style.css`/`tokens.css` (delete `.settings-dialog` 680px/overflow rules, `.provider-row` border/margins, `.settings-tabs`), `shared/domain.ts` + `ipc.ts` for Appearance fields.
- Do not use `position:absolute` children inside a row except the virtualised row itself; do not add new `!important`.
- Keep the UI2 constraints: no pointer-focus border on composer/tabs/rows, shared shadcn `Button` everywhere, tokens not literals.
- After coding, run `/tmp/vstudy-ui3/reshoot.sh` again (it copies `out/` to a private dir, so build first) and diff `report.json`: `clippedMeta` must be 0, `overlaps` 0, `dialog.scrollH <= clientH` for the pane, row `h` 44 (88 at text200). Add the search-field fix (L9) and the toolbar at 200% (L8) to the Library work: toolbar buttons must be `shrink-0` with a `min-width:12rem` search field that wraps to its own line before it collapses.
