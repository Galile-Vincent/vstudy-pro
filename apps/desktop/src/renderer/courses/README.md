# Course library

The catalog uses shared ListRow, Card and toolbar controls. List rows keep
attention counts and actions in fixed-width slots. List rows have a 64px minimum height at comfortable density,
with a single-line title above muted teacher and deadline metadata. Teacher names
ellipsize before deadlines; deadline phrases never truncate. List titles retain
their full tooltip so long names remain available without changing row density.
Cards wrap titles and use auto-fill columns
so a sparse result does not stretch across the whole catalog. The account strip
and due-soon section adapt independently at narrow window widths.

Arrow Up/Down, Home and End move between course openers. Cards also support Left/Right; Up/Down move by the rendered column count. Enter opens a course;
Tab reaches its separate actions. Sorting updates immediately and serializes
preference writes. Keyboard reordering and reduced motion skip FLIP animation.
Updates retains its existing M shortcut for read state.

From the repository root, run `pnpm build`, then
`VSTUDY_COURSE_EVIDENCE_DIR="$TMPDIR/course-library-after" node apps/desktop/e2e/capture-course-library.mjs`.
The capture uses fictional course fixtures, a disposable profile and the fake
Anthropic adapter. Set `VSTUDY_COURSE_EVIDENCE_DIR` to choose an output directory; otherwise it creates a temporary directory. It covers light/dark at 1440, 1280, 960, 760 and
720 pixels, list/cards, hover, focus, pins, empty terms, loading and errors.
It also captures compact density at 100% and 125% UI scale. It checks minimum row height, complete deadlines, aligned list action slots, grid-aware course navigation, the full Tab/Shift+Tab walk through active-row actions to Due soon, metadata-line clicks, whole-row focus rings, refresh, Updates M and axe.

Design reference: [T3 Code](https://github.com/pingdotgg/t3code), commit
`25fada9351ce9f907ecbe8ca3a819e358646777d`, MIT, copyright T3 Tools Inc.
Studied Sidebar, SidebarThreadRow and theme tokens for dense rows, tonal states,
focus and explicit empty states. No source or assets were copied or adapted.
VStudy retains its shared components, theme packs, identity and course data.

## Historical design notes

The notes below describe earlier iterations; the implementation and capture
command above supersede their layout and capture descriptions.

### Capture the Courses design

Run this historical command from the repository root.

```sh
pnpm build && node apps/desktop/e2e/capture-courses.mjs
```

The script opens built Electron at 1280 × 800 and 1100 × 720, with device scale factor 2. It launches an isolated copy of the built output and a fresh temporary profile in the designated scratchpad. This keeps the running dev server or another build from rewriting the artifact during capture. Entry and renderer hashes are recorded, and the copy is removed afterward. It never reads the normal app profile. School HTTP requests and main-process fetch are blocked.

The fictional fixture has 11 current courses, seven upcoming deadlines, four overdue deadlines, one submitted deadline, and 33 notifications over three days. The overview reads SQLite. Read and unread changes use the production IPC and repository. Course detail and sync replies use fixture handlers.

Images and audit results go to `docs/evidence/courses/design-pass`. The default prefix is `single-line-final`. Set `COURSES_CAPTURE_PHASE` to keep another round. The stored `before-*` images document the original implementation and are historical evidence.

The capture includes rest, hover, and keyboard focus at 1280 × 800, 1100 × 720, 640 × 800, and 552 × 800 in English, Traditional Chinese, and Japanese, in both schemes. It measures equal 40px rows, aligned 56px count slots, 12px horizontal padding, 8px corners, one-line column labels, and courses above the fold. Catalogs narrower than 600px use the spec's 52px fallback. It also covers pins, Smart and Name sorting, changed deadlines after a simulated sync, 180ms FLIP transforms with retained focus, reduced motion, saved preferences, and both contrast modes.

The inbox states include an opened notification, Unread, Yesterday, Earlier, the empty state, and read/unread persistence. Eight cropped frames show the course tabs scrolling at 720 pixels. Frame metadata records interpolated mask positions and both hidden scrollbar styles. High contrast disables the mask so text stays visible. Eight further frames record the Smart reorder. Review panels combine the full page with hover and focus crops.

The script checks page overflow, axe violations, keyboard movement, read state after reload, local unread after reload, and scroll endpoints. `M` toggles read state within the notification list. Arrow keys move between rows. Enter opens the focused item.

### Notification ownership

`MoodleNotification` represents a Moodle message notification or popup notification. The adapter reads `core_message_get_messages` with a popup fallback. It does not create notifications from grade, announcement, file, or forum records.

Opening an unread item uses the existing `moodle:mark-read` operation. That operation already acknowledges read state on Moodle and retries failed acknowledgements. Marking unread stores `localUnread` in the existing SQLite JSON record and sends no unread operation to Moodle. Sync preserves that override until the item is marked read again. No new table or notification feed is added.

### Course attention counts

The course row, header, and Updates inbox use the same deduplicated notification list. The visible unread count means unread Moodle updates. Announcements have no read flag, so the UI does not claim an announcement-only count.

Overdue counts come from deadlines with a past due time that are not marked submitted and are not orphaned. A null submission status follows the existing pending-work rule. The next deadline appears only within seven days.

`displayTitle` removes a known term prefix and a suffix that exactly matches a known teacher, ignoring case and whitespace. A joined term prefix requires that matching teacher suffix. Uncertain names remain intact. The row button retains the raw full name in its tooltip and accessible description. Its accessible name includes the displayed name, teacher, and attention counts.

### Page surface and attention

The catalog tabs, controls and rows sit directly on the page, with one hairline
under the toolbar. Due soon uses an unboxed column with explicit urgency headings.
Overdue comes first with an alarm icon and label. Within each section, deadlines
group under a course heading. Titles clamp to two lines and retain their full title
tooltip. Reminder bells stay beside their item.

The account strip keeps identity and shared icon actions on one line. School names
ellipsize and multiple schools scroll within the strip. Each school retains its own
disconnect and recovery actions. Sync time hides at narrow widths.

Open and pin actions reveal on hover or focus within the row. Pinned rows and
devices without hover always show them. Opacity preserves the accessibility tree
and the existing roving tab order. Attention badges expose named image roles and
native tooltips.

### Pins and Smart order

Pins live in the main-process SQLite `moodle_course_pins` table, introduced by migration 23. The validated `moodle:set-pinned` IPC verifies the account owns the course. Course and account foreign keys cascade deletes. Sync preserves pins for surviving courses and clears pins for missing courses even when reminder history retains an orphaned course. No school operation is sent. Sort choices live in the existing validated SQLite settings as `coursesSort`, separately for each term filter.

The pin button sits after the number columns in a reserved slot. It appears on row hover or keyboard focus, stays visible and filled when pinned, and stays visible on devices without hover. It uses `aria-pressed`, a localized accessible name, and a tooltip. The button sits above the course link overlay. Pin focus uses its own ring; the course opener uses the whole-row inset ring.

`src/shared/moodle-course-order.ts` owns the single pure ordering function. Current defaults to Smart. Pinned courses come first on Current and All. Within each Smart group: upcoming deadlines inside seven days by nearest time, overdue-only by most recent overdue time, unread-only by highest full count, then quiet courses by locale-aware name. Mixed signals use the first applicable tier. Name breaks ties, then course ID makes equal names deterministic. Past, All, and Future default to Name; Name groups terms newest first outside Current. Each filter remembers an explicit choice.

Ordering uses a snapshot taken when the page opens, sync completes, a pin changes, or the student changes the term or sort. Read-state updates change counts without reshuffling rows. FLIP uses a 180ms ease-out transform, preserves the focused element, and is disabled under reduced motion. The capture waits for the shell's navigation-focus frame before starting keyboard tests.

List and card views share one course-row implementation and preserve the saved view preference.
