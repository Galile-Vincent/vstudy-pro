# Course list, option 3: single-line rows. Delta against option D

Rule: one course, one 40px line. The name comes first. Teacher and deadline follow in muted text on the same line. The two counts stay in fixed slots on the right.
Anything not listed here is unchanged from `row-design/spec.md` (accessible name, sr-only spans, 99+, never red for deadlines, empty slots kept).

## Structure
- Same `li.course-row` markup as D. `.course-main` holds the `h3` and `p.course-meta` side by side instead of stacked.
- New: `ul.course-list` gets `data-view="list"` (or `"cards"`, see View switch). Nothing inside the `li` changes between views.
- New: one header element before the list, aria-hidden, with two identical cells:
  `<div class="course-colhead" aria-hidden="true"><div><span>逾期</span><span>未讀</span></div><div>(same)</div></div>`

## Sizes (4px scale)
- `.course-row`: padding `0.625rem 0.75rem` (10/12). **Measured height 40px** for every row, with or without teacher. D was 68px.
- `.course-main`: `display: flex; flex-direction: row; align-items: baseline; gap: 0.75rem; height: 1.25rem; min-height: 0`.
  Fixed `height` is required: baseline alignment of 15px and 13px text otherwise makes rows 41px (measured).
- `.course-main h3`: `flex: 0 1 auto; min-width: 0; max-width: 70%`. The name gets space first.
- `.course-meta`: `flex: 0 100 auto; min-width: 0; margin-top: 0; line-height: 1.25rem`. It shrinks 100x faster, then ellipsizes.
- `.course-title`: `line-height: 1.25rem` (was 1.4). Size, weight, color unchanged.
- `.course-counts`: columns `3.5rem 3.5rem` (was 3rem). The English "Overdue" and "Unread" labels touched at 3rem (seen).
- List top to fold at 1280x800: 11 of 11 visible (measured). 1100x720: 10 of 11 (measured).

## Colors
- `--line` soft hairline: `color-mix(in srgb, var(--ink) 10%, transparent)`. Same as the app's `--hairline`. D's mock used #333 (20%), which is too hard.
- Row: `--ink` title, `--muted` meta, `--danger` overdue, `--muted` unread number with an `--ink` dot. Same as D.
- Hover `--active` (dark #191919, light #f3f3f3). Pressed `color-mix(--ink 14%, --page)` dark, 9% light. Focus `--focus` (= `--accent`).

## Hover, pressed, focus
- Same rules as D: hairline `::before` inset 0.75rem, hidden on the hovered or focused row and the row after it.
- Focus: `.course-row:has(.course-open:focus-visible) { background: var(--active); outline: 2px solid var(--focus); outline-offset: -2px }`.
  Verified with real Tab presses and a real mouse hover (shots line-dark-realfocus, line-light-realhover).
- Keyboard: Tab through row buttons in DOM order. No arrow-key roving.

## Header labels
- `.course-colhead`: `display: grid; grid-template-columns: 1fr; height: 1.25rem; margin-top: 0.5rem; font-size: var(--type-xs); color: var(--muted)`.
- Each cell: `display: flex; justify-content: flex-end; padding-inline-end: 0`. Spans `width: 3.5rem; text-align: end; white-space: nowrap`.
  The list has `margin-inline: -0.75rem`, so with padding 0 the label's right edge lines up with the number's right edge (measured, both views).
- List view: the second cell is `display: none`. One header row.
- zh-Hant 逾期 未讀, en Overdue Unread, ja 期限切れ 未読.

## Narrow
- Container query on the catalog (`container-type: inline-size`), not a viewport media query, because the Due soon column moves.
- `@container (max-width: 599px)`: rows go back to two lines. `.course-main { flex-direction: column; height: auto; min-height: 2.25rem; gap: 0 }`,
  padding `0.5rem 0.75rem`, meta `line-height: 1rem`. Measured row height 52px. The h3 `max-width` is removed.
- No horizontal scroll at any tested width (measured at 520 to 880).

## View switch (optional, see the recommendation)
- Place: right end of the Current, Past and All row (`justify-content: space-between`). It hides below a 560px list width.
- Markup: `<div role="group" aria-label="檢視方式">` with two `<button type="button" aria-pressed>` children, icon only, each with `aria-label` and `title`:
  List / 清單 / リスト (lucide `Menu` or `List`) and Cards / 卡片 / カード (lucide `LayoutGrid`). Group label: View / 檢視方式 / 表示.
- Size: group `height: 2.25rem` (matches the tabs' 36px), `padding: 2px; gap: 2px`, no border, no fill. Buttons `2rem x 2rem`, `border-radius: var(--r-xs)` (6px), icon 1rem, stroke 1.75.
- Colors (new tokens, scoped to the switch):
  - rest: icon `--muted`, no fill.
  - hover: icon `--ink`, `--sw-hover` = ink 5% over page dark, 4% light.
  - selected (`aria-pressed=true`): icon `--ink`, `--sw-on` = ink 14% dark, 10% light.
  - pressed: `--sw-press` = ink 20% dark, 15% light.
  - focus-visible: `outline: 2px solid var(--focus); outline-offset: 0`.
  Hover must be lighter than selected. In round 2, hover at #191919 looked selected (seen), so the values were changed.
- Cards surface, all inside `@container (min-width: 560px)` so the list is the fallback with no JS:
  - `.course-list[data-view=cards] { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-inline: 0 }`.
  - Row: `background: var(--surface); border-radius: var(--r-md)` (12px), padding `0.75rem 1rem`, gap 0.75rem, no hairline. Main stacks (column), title 1.25rem, meta 1.125rem with 2px top margin. Measured card height 64px.
  - Hover `color-mix(--ink 7%, --surface)` dark, 5% light. Pressed 11% / 9%. Focus ring `outline-offset: 2px` (outside, the gap is 8px).
  - Header: `.course-colhead` becomes `1fr 1fr` with `column-gap: 0.5rem`. Both cells show with `padding-inline-end: 1rem`, so labels repeat over each column.
- Order: DOM order, row-major (Z). Tab follows it. Same accessible names and counts in both views, because the `li` is identical.
- Default `list`. Stored in renderer `localStorage['vstudy.courses.view']`, values `list` or `cards`. Read and write in try/catch. Anything else means `list`.
  Why not the settings object: settings goes through IPC and main-process validation, so a new field needs schema, migration and tests. This is a cosmetic per-device preference.
- Narrow: below a 560px list the switch is hidden (`display: none`) and `data-view=cards` renders as the list. The stored value is kept and comes back when the window widens.

## Verdict on offering both
- Measured: cards fit no more courses than the single-line list (11 and 10 against 11 and 10). They truncate 全民國防教育軍事訓練課程-防衛動員 at every list width below 880.
- The switch doubles the QA matrix (2 views x 2 schemes x 3 languages x widths) for no density gain. Recommend shipping the list alone and keeping this section on file.
