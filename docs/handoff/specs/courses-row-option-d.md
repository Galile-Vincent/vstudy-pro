# Course row, option D: numbers right, words left

Rule: counts are numbers and go in fixed slots at the right. The deadline is a phrase and joins the teacher line.

## Structure (per row)
```html
<ul class="course-list" role="list">
  <li class="course-row">
    <div class="course-main">
      <h3><button type="button" class="course-open" title="{fullName}"
          aria-labelledby="c7-title c7-meta c7-ov c7-un"><span id="c7-title" class="course-title">{name}</span></button></h3>
      <p id="c7-meta" class="course-meta">{teacher}<span class="sep" aria-hidden="true">·</span><time datetime="{iso}">{後天截止}</time></p>
    </div>
    <div class="course-counts" aria-hidden="true">
      <span class="count count-ov" title="{1 項逾期}"><TriangleAlert/>{1}</span>
      <span class="count count-un" title="{9 則未讀}"><i class="dot"></i>{9}</span>
    </div>
    <span id="c7-ov" class="sr-only">{1 項逾期}</span><span id="c7-un" class="sr-only">{9 則未讀}</span>
  </li>
</ul>
```
- Leave out `.course-meta` when there is no teacher and no deadline. Leave out a separator that has nothing on one side.
- Always render both `.count` spans, even when empty, so the slots keep their width. Leave out the sr-only span and its id in aria-labelledby when the count is 0.
- Accessible name, in this order, leaving out empty parts: name, teacher, overdue, unread, deadline. zh-Hant: "全球化大議題，林能山，1 項逾期，9 則未讀". en: "Operating Systems with a very long…, WU-CHUN CHUNG, 3 overdue, 120 unread". The sr text uses the real count ("120 則未讀"), never "99+".

## Layout (4 px scale)
- `.course-list`: `margin-inline: -0.75rem` so row text stays on the page's left edge.
- `.course-row`: `position: relative; display: flex; align-items: center; gap: 1rem; padding: 0.75rem; border-radius: var(--r-sm)` (8px).
- `.course-main`: `flex: 1; min-width: 0; min-height: 2.75rem; display: flex; flex-direction: column; justify-content: center`. Measured row height: 68px for every row, with or without a teacher.
- `.course-open`: `all: unset; display: block; width: 100%; min-width: 0; text-align: start`. **width: 100% is required.** A block button sizes to its content and breaks the ellipsis. ::after `{ content: ""; position: absolute; inset: 0; border-radius: inherit }` makes the whole row clickable.
- `.course-counts`: `flex: none; display: grid; grid-template-columns: 3rem 3rem`. `.count`: `display: flex; justify-content: flex-end; align-items: center; gap: 0.25rem`.

## Type and color
- `.course-title`: `var(--type-md)` (0.9375rem), weight 600, line-height 1.4, `--ink`, one line, `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`.
- `.course-meta`: `var(--type-base)` (0.8125rem), weight 400, line-height 1.5, `--muted`, `margin-top: 0.125rem` (optical half step), one line with an ellipsis. `.sep`: `margin-inline: 0.25rem`.
- Deadline under 24 hours: `--ink`, weight 600, with a 0.8125rem Clock3 icon (`vertical-align: -2px; margin-inline-end: 0.25rem`). Otherwise plain `--muted`. Never `--danger`: red means overdue only.
- `.count`: `var(--type-base)`, `font-variant-numeric: tabular-nums`, line-height 1.25rem.
- `.count-ov`: `--danger`, weight 600, TriangleAlert 0.875rem, stroke 2. Shape and color together, never color alone.
- `.count-un`: number `--muted`, weight 400. `.dot`: 6px circle, `background: var(--ink)` (the same dot as `.moodle-unread`).
- Over 99: show "99+". The title tooltip and sr text give the real number. 3rem fits "● 99+" (measured).

## Hover, pressed, focus
```css
.course-row + .course-row::before { content: ""; position: absolute; top: 0; inset-inline: 0.75rem;
  height: 1px; background: var(--line); pointer-events: none; }
.course-row:hover { background: var(--active); }
.course-row:active { background: color-mix(in srgb, var(--ink) 14%, var(--page)); } /* light: 9% */
.course-open:focus-visible { outline: none; }
.course-row:has(.course-open:focus-visible) { background: var(--active);
  outline: 2px solid var(--focus); outline-offset: -2px; }
.course-row:is(:hover, :has(.course-open:focus-visible))::before,
.course-row:is(:hover, :has(.course-open:focus-visible)) + .course-row::before { opacity: 0; }
@media (prefers-reduced-motion: no-preference) { .course-row { transition: background-color 120ms ease-out; } }
@media (forced-colors: active) { .course-row:hover { outline: 1px solid CanvasText; outline-offset: -1px; } }
```
- `--active` target values from the mock (measured): dark #191919 (10% ink over #000), light #f3f3f3 (5%). If the app's `--active` is darker than #161616 in dark mode, hover will not show on pure black (seen in round 1 at 8% oklab).
- Nothing moves on hover. No border, no shadow, no size change.

## States
- Nothing pending: name and teacher only. Empty slots. No "all clear" text, no zero.
- No teacher and nothing pending: title only, vertically centred, same 68px row.
- No teacher with a deadline: the meta line holds only the deadline.

## Narrow, below 640px
- Row `gap: 0.5rem`. Slots stay 3rem. Title and meta truncate. The full title stays in `title`.
- Measured at 600px: no horizontal scroll, and the long English title truncates.
