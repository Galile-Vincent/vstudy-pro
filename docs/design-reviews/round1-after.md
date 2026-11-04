# Round 1 after implementation

The 37-item independent review is tracked below. “Done” means the reviewed user-facing issue is addressed, with deliberate alternatives in [round1-response.md](round1-response.md); optional sub-design omissions are listed there. “Not done” identifies incomplete P2 polish explicitly.

## Evidence and environment

Real built Electron, isolated user-data directories, actual SQLite/IPC and fake providers. The design seed has 42 documents including failed/converting states, 12 nested folders, document/folder pins, long Japanese/Traditional Chinese titles, 14 days of usage and a five-day current streak with an earlier gap. Interface locales: en, ja, zh-Hant. Widths: 720/900/1200; light/dark; height 872. Screenshots are in `/tmp/vstudy-design1/`; the machine-readable inventory is `docs/evidence/design1-screenshots.json`.

Before evidence is the independent review's explicitly named captures (some are ephemeral outside this repository). For every after filename in the table, substitute any locale/width/theme in `round2-{en,ja,zh-Hant}-{720,900,1200}-{light,dark}-STATE.png`. The table names one concrete comparison frame; the manifest enumerates the actual files.

## Per-item ledger

| # | Status | Change / limitation | Before → after screenshot names |
|---|---|---|---|
| 1 | Done | 64px virtual list rows; content-sized grid; strong title, Intl sizes, type/pages/date, ancestry, filename/converter details; Ready hidden. | `round2-en-1200-light-populated.png` → `round2-en-1200-light-library-list.png` |
| 2 | Done | Resting Markdown/Original buttons removed; Open/exports grouped in menu. | `round2-en-1200-light-context-menu.png` → `round2-en-1200-light-library-menu.png` |
| 3 | Done | Anchored grouped popover with icons, keyboard navigation, outside dismissal and focus return; see alternative in response. | `round2-en-1200-light-context-menu.png` → `round2-en-1200-light-library-menu.png` |
| 4 | Done | Opaque aligned filter panel, full-width Selects, adjacent toggle labels, date/size presets, Custom dates, Clear/Close footer, active count. | `round2-en-1200-light-populated.png` → `round2-en-1200-light-library-filters.png` |
| 5 | Done | Continue spans two columns, has a Continue action and actual dates/snippets; fake progress removed. | `mine/en-1200-light-home.png` → `round2-en-1200-light-home.png` |
| 6 | Done | Empty Home shows import/sample and a token-built reader/chat preview; zero-data cards hidden; empty hero spans the grid. | `mine/en-1200-light-home.png` → `round2-en-1200-light-home-empty.png` |
| 7 | Done | 10%/12% decorative hairlines; input/select outlines retained; solid content surfaces. | `round2-en-1200-light-populated.png` → `round2-en-1200-light-library-list.png` |
| 8 | Done | Primary, secondary and ghost treatments; page, toolbar and row sizes use shared scale. | `round2-en-1200-light-populated.png` → `round2-en-1200-light-library-filters.png` |
| 9 | Done | Search heading includes the query; search/filter hints and clearing actions differ from import empty states in all locales. | `round2-en-1200-light-populated.png` → `round2-en-1200-light-library-no-results.png` |
| 10 | Done | Home cards use r-md (14px). | `mine/en-1200-light-home.png` → `round2-en-1200-light-home.png` |
| 11 | Done | Card titles/summary use muted 13px/600; stats use 28px/600. | `mine/en-1200-light-home.png` → `round2-en-1200-light-home.png` |
| 12 | Done | Content-aligned grid, two-column Continue hero, full-width open recent activity, responsive columns. | `mine/en-1200-light-home.png` → `round2-en-1200-light-home.png` |
| 13 | Done | Folder duplicate removed from Home; bounded document pins remain; see response. | `mine/en-1200-light-home.png` → `round2-en-1200-light-home.png` |
| 14 | Done | Reorder controls reveal on hover/focus; disabled end actions hidden; Alt+arrows work on Home and sidebar pins. | `mine/en-1200-light-home.png` → `round2-en-1200-light-home.png` |
| 15 | Done | No nested pin scrollers; capped pin rows and clamped Continue titles with full title details. | `mine/en-1200-light-home.png` → `round2-en-1200-light-home.png` |
| 16 | Done | Token-styled progress tracks/fills on Home, conversion and budget meters; normal chat budget chrome folded away. | `mine/en-1200-light-home.png` → `round2-en-1200-light-home.png` |
| 17 | Done | Locale weekday initials, today ring, studied/rest states, best caption and focusable explanation tooltip. | `mine/en-1200-light-home.png` → `round2-en-1200-light-home.png` |
| 18 | Done | Real Filters button/icon, shared Select, consistent 32px cluster and current-state view icon; compact toggle alternative documented. | `round2-en-1200-light-populated.png` → `round2-en-1200-light-library-filters.png` |
| 19 | Done | Scope/subfolders excluded from narrowing chips; checkbox inside filters; localized enum labels; Clear/Save are ghost actions. Saved-filter persistence retained. | `round2-en-1200-light-populated.png` → `round2-en-1200-light-library-filters.png` |
| 20 | Done | Folder ancestry/title and result count replace filler; shared 32px page inset; duplicate topbar label removed; paginated count has +. | `round2-en-1200-light-populated.png` → `round2-en-1200-light-library-folder.png` |
| 21 | Done | True empty Library hides toolbar/header CTA; one primary import, secondary sample and dashed drop area. | `round2-en-1200-light-populated.png` → `round2-en-1200-light-library-empty.png` |
| 22 | Done | Empty pin/filter headings hidden; folder hint, shared smart-view icons and 12px/13px caption floor. | `mine/en-1200-light-home.png` → `round2-en-1200-light-home-empty.png` |
| 23 | Done | Recursive non-deleted folder counts with move/delete/restore test; quiet parent nav state, hover/focus options and one selected row fill. | `round2-en-1200-light-populated.png` → `round2-en-1200-light-library-folder.png` |
| 24 | Done | Floating selection bar with hairline/material, ghost actions and danger Delete; no result-list displacement. | `round2-en-1200-light-populated.png` → `round2-en-1200-light-library-selection.png` |
| 25 | Done | One 44px workspace toolbar contains title, thread picker, New Chat, swap and settings; duplicate chrome/deletion action removed. | `en-720-dark-chat.png` → `round2-en-720-dark-chat.png` |
| 26 | Done | Full-width reader/chat tabs under 820px; sidebar auto-collapses below 1000px in workspace. | `en-720-dark-chat.png` → `round2-en-720-dark-chat.png` |
| 27 | Done | Composer footer retains model/effort, scoped usage tooltip and Send; normal budget/unknown-price slabs removed, warning behavior retained. Disabled start CTA hidden. | `en-720-dark-chat.png` → `round2-en-720-dark-chat.png` |
| 28 | Done | Document welcome now actually renders pill suggestions; fallback suggestions are actionable; sparkle centered. | `en-720-dark-chat.png` → `round2-en-720-dark-chat.png` |
| 29 | Done | BookOpen Library nav icon; consistent 16px stroke weight. | `round2-en-1200-light-populated.png` → `round2-en-1200-light-library-list.png` |
| 30 | Not done | Implemented search/radius treatment, hidden raw IDs, unavailable-only dots and strong effort selection. Scroll-edge fade omitted; native scrolling remains visible. Favorite controls moved out of listbox for axe. | `en-720-dark-chat.png` → `round2-en-720-dark-picker.png` |
| 31 | Not done | Selection removal has a 24px target. Positioning Ask above selection and replacing the disclosure glyph were not changed in this round; existing selection regression passes. | `en-720-dark-chat.png` → `round2-en-1200-light-reader.png` |
| 32 | Done | Onboarding has a 520px minimum, bounded scrolling and footer anchored within a flex sheet. | `en-1200-light-onboarding-0.png` → `round2-en-1200-light-onboarding-0.png` |
| 33 | Not done | Back hidden on first step, Skip is quiet, footer is a hairline. Four existing progress dots retained instead of the optional segment/count redesign. | `en-1200-light-onboarding-0.png` → `round2-en-1200-light-onboarding-0.png` |
| 34 | Done | Reader table/code hairlines, subtle header, token cell padding and horizontal code overflow. | `en-720-dark-chat.png` → `round2-en-1200-light-reader.png` |
| 35 | Done | Engineering live region visually hidden; localized document count appears under title. | `round2-en-1200-light-populated.png` → `round2-en-1200-light-library-list.png` |
| 36 | Done | Dark page is darker than cards; primary actions invert ink/surface; input outlines distinct from hairlines. | `mine/en-1200-light-home.png` → `round2-en-1200-light-home.png` |
| 37 | Not done | Single-point sparkline becomes a dot and line stroke is strengthened. Area fill, baseline and endpoint decoration omitted; accessible last-14-days label retained. | `mine/en-1200-light-home.png` → `round2-en-1200-light-home.png` |

## Critique loop

Round 1 inspected the seeded Home, 720px dark chat, anchored menu and 720px filters, alongside list/grid and onboarding captures. **Contrast:** calmer outlines and opaque filters worked; picker favorite buttons violated listbox semantics. **Hierarchy:** row metadata was quieter, but Continue still lacked an explicit action. **Alignment:** sidebar smart views lacked a shared icon column. **Proximity:** the budget meter still separated model and composer. **Repetition:** Home/card radii were unified; picker effort needed a stronger selected state. **Balance:** full-width chat was usable, but the header still stacked. **White space:** empty Home occupied an unnecessarily narrow column. **Unity:** preview cards made onboarding and empty Home explain the same product. Revisions added the hero action, smart-view icons, a merged 44px workspace header, footer usage, full-width empty hero, and corrected picker semantics.

Round 2 inspected Home/empty Home, content-sized grid, CJK list and filter layouts, onboarding preview, compact chat and picker in both themes. **Contrast:** axe caught a specificity collision on effort selection; the selected style now owns both ink and background at matching specificity. **Hierarchy:** title → metadata → contextual actions holds; current dates/snippets replace fake progress. **Alignment:** Home/Library content insets and card radii repeat. **Proximity:** model/effort/usage/Send share the composer; custom dates are behind a deliberate preset choice. **Repetition:** shared Select and preview replace native select/form-only onboarding. **Balance:** empty hero spans the grid and 720px chat gets the full pane. **White space:** no fixed grid card height or pin scroller; actual long titles determine card height. **Unity:** neutral surfaces, shared tokens and localized copy persist across the surfaces. The final recapture includes the corrections; capture/audit results are recorded in the manifest.

The screenshot ledger is automated evidence, not a claim that every image was individually inspected at full resolution. The named frames and contact sheets were inspected for the eight checks. Supplemental regression captures use their own smaller fixtures.

## Verification

Final commands and outcomes are in the manifest's verification section. Unit tests include descendant folder counts and real reconversion identity/original retention. The older ready→converting assertion was already corrected in the starting tree (`src/main/db/index.test.ts`); both that test and `documents.test.ts` pass. No further behavior change was needed for that transition.

The PDF reader test now generates a deterministic ten-page PDF when no source is supplied, exercising the same page anchors and real pdf_md converter without relying on a private textbook. It searches anchor text within rendered paragraphs because Markdown can merge adjacent page paragraphs while retaining page metadata.

Unverified: manual VoiceOver, live macOS vibrancy, actual provider authentication/network responses, independent native-speaker review, OS-level reduced transparency and exhaustive 200% text-scaling interaction. The matrix uses reduced motion for stable contrast audits; component tests separately cover motion behavior. P2 #30/#31/#33/#37 are not fully complete as recorded above.

### Final automated results

| Check | Result |
|---|---|
| Typecheck / lint / production build | Passed; zero lint violations |
| Unit/component/integration tests | 43 files passed; 225 tests passed, four existing skips |
| All 12 e2e scripts | Passed: design1, Library, Library performance, Home/onboarding, selection-chat, i18n, assistant-elements, chat-controls, visual-regressions, composer QA, conversion, PDF reader |
| Design matrix | Round 1: 324; final round 2: 342 screenshots; all three locales, widths and themes |
| Accessibility | Final 60 design audits: zero serious/critical; full Home/onboarding and Library regression audits also passed |
| Contrast script / security smoke | Passed |
| Saved filters | UI Save filter dialog, saved sidebar item and persisted ready-status query verified by Library e2e |

There are 352 supplemental Library/Home captures copied into the requested evidence directory. The manifest distinguishes them from the realistic 42-document critique matrix. The first matrix's picker findings remain recorded as before evidence; only the final matrix is reported as zero serious/critical.
