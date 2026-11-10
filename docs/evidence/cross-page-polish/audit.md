# Before-edit audit

Captured on origin/main at 1280, 900 and 600 × 1000, English and Traditional Chinese, light and dark: 96 screenshots in /tmp/vstudy-cross-page/before, with computed geometry in measurements.json. Deterministic dev bridge (`libraryDemo=1&reviewDemo=1`).

- PageHeader: all titles 28px, but global heading CSS overrides library weight 500 with 600. Container gaps: Library / AI Chats 16px, Review / Home content 24px, Courses / History / Exams / gallery 32px. Global nowrap can prevent translated titles wrapping.
- Selection: library modes are ghost buttons with `--active`, AI Chats has pill buttons in a 4% ink pill; shared tabs use an 8px radius and 6% ink fill. Move mutually exclusive mode selectors to the library toggle primitives with the same shared styling as segmented tabs.
- Rows: gallery target 12px padding (43.5px one line, 63px two lines); Review target 0px (19.5px text inside a 56px wrapper); Exams CSS overrides target padding to 16px. History results use 12px vertical / 16px horizontal. Courses has a content-specific 8px override. Preserve virtualized Library rows and assistant-ui History ownership.
- Sidebar: Workspace and collection group boxes separated by 16px; collection-to-Folders heading has 16px spacing, but pinned / saved headings have no explicit shared cadence. Normalize section starts to 24px and prevent the collection group overflowing into the fixed footer at shorter heights.
- Compact subscription progress: 4px; native Usage budget meter: 6px; shared Progress: 8px. Use the shared 8px track.
- Update Cancel already uses Button, variant link / sm. Give it ghost / sm for a visible tonal hover and normal control padding.
- Ratchet before: shadow 5, radius 13, color 0, backdrop 0, surface-class 80. Safe raw radius replacements exist in tab strip and reader/chat chrome; preserve the agreed centered Whisper shadow tokens.

The dev mock also emits `Cannot read properties of undefined (reading 'filter')` on this baseline. Record route/stack in the after capture and compare rather than silently treating the capture as a clean runtime pass. Settings is out of scope; Usage is a Settings panel, not a routed page.
