# Review fixes

These are isolated fixtures using the real PageHeader/Button components, production theme/base CSS, and the actual Moodle and chat selectors. They do not claim a live Moodle or AI session. The hosted-chat fixture preserves the real nested `span > small` markup. All captures are Chromium, English/light, 900 or 600 × 500.

| Measured value | PR head cf2f765b | Review fix |
| --- | --- | --- |
| Moodle header height, 900px | 125.59375px | 76px |
| Moodle header height, 600px | 153.890625px | 72px (existing narrow breakpoint) |
| Title size / weight | 28px / 500 | 17px / 700 |
| Title white-space / overflow | normal / ellipsis | nowrap / ellipsis |
| Title line-height | 37.8px | 22px |
| Description margin-top | 0px | 4px |
| Chat session display, 600px | inline | none |
| Chat session display, 900px | inline | inline |

[Before 900px](before/headers-900.png) · [After 900px](after/headers-900.png) · [Before 600px](before/headers-600.png) · [After 600px](after/headers-600.png). Raw values are in each round's measurements.json.

The computed regression helper is called by `apps/desktop/e2e/cross-page-polish.mjs`. It can also run alone against `pnpm dev`:

```sh
node apps/desktop/e2e/header-regressions.mjs
# Optional: VSTUDY_RENDERER_URL=http://localhost:5174 VSTUDY_POLISH_EVIDENCE=/tmp/headers
```

The helper fails against cf2f765b (`28px !== 17px`). It asserts title size, weight, nowrap, ellipsis, line-height, description margin, desktop header height, chat visibility at both widths, and intentional planner zero margins.

CSS audit: checked all PageHeader callers (Home, Library, Courses overview/unavailable/course head, Planner, Review, Exams, History, AI Chats, design gallery, Moodle webview). Planner's former 8px title/paragraph margins deliberately remain 0; Review's former 1.7 paragraph leading deliberately remains 1.5 for the description (19.5px at 13px font). No other caller has a competing h1/p declaration that needs an exception. Nested course cards, review consent, exam built-in prose, Home upload prose and Library empty-state prose are outside the header and retain their local rules. The Moodle webview is the only compact exception.

Selector audit against main: art-reader explicitly asserts `data-view=list` after keyboard activation; ui2-design captures `library-grid` then toggles back. Both need the document layout button, accessible name “Switch list or grid view” (localized in ui2-design). Documents/Folders radios are a separate mode control; changing these scripts to those radios would test the wrong behavior.
