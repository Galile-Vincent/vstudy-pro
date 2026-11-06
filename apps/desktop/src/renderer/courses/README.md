# Capture the Courses design

Run this command from `apps/desktop`.

```sh
pnpm build && node e2e/capture-courses.mjs
```

The script opens built Electron at 1280 × 800 and 1100 × 720, with device scale factor 2. It launches an isolated copy of the built output and a fresh temporary profile in the designated scratchpad. This keeps the running dev server or another build from rewriting the artifact during capture. Entry and renderer hashes are recorded, and the copy is removed afterward. It never reads the normal app profile. School HTTP requests and main-process fetch are blocked.

The fictional fixture has 11 current courses, seven upcoming deadlines, four overdue deadlines, one submitted deadline, and 33 notifications over three days. The overview reads SQLite. Read and unread changes use the production IPC and repository. Course detail and sync replies use fixture handlers.

Images and audit results go to `docs/evidence/courses/design-pass`. The default prefix is `single-line-final`. Set `COURSES_CAPTURE_PHASE` to keep another round. The stored `before-*` images document the original implementation and are historical evidence.

The capture includes rest, hover, and keyboard focus at 1280 × 800, 1100 × 720, 640 × 800, and 552 × 800 in English, Traditional Chinese, and Japanese, in both schemes. It measures equal 40px rows, aligned 56px count slots, 12px horizontal padding, 8px corners, one-line column labels, and courses above the fold. Catalogs narrower than 600px use the spec's 52px fallback. It also covers pins, Smart and Name sorting, changed deadlines after a simulated sync, 180ms FLIP transforms with retained focus, reduced motion, saved preferences, and both contrast modes.

The inbox states include an opened notification, Unread, Yesterday, Earlier, the empty state, and read/unread persistence. Eight cropped frames show the course tabs scrolling at 720 pixels. Frame metadata records interpolated mask positions and both hidden scrollbar styles. High contrast disables the mask so text stays visible. Eight further frames record the Smart reorder. Review panels combine the full page with hover and focus crops.

The script checks page overflow, axe violations, keyboard movement, read state after reload, local unread after reload, and scroll endpoints. `M` toggles read state within the notification list. Arrow keys move between rows. Enter opens the focused item.

# Notification ownership

`MoodleNotification` represents a Moodle message notification or popup notification. The adapter reads `core_message_get_messages` with a popup fallback. It does not create notifications from grade, announcement, file, or forum records.

Opening an unread item uses the existing `moodle:mark-read` operation. That operation already acknowledges read state on Moodle and retries failed acknowledgements. Marking unread stores `localUnread` in the existing SQLite JSON record and sends no unread operation to Moodle. Sync preserves that override until the item is marked read again. No new table or notification feed is added.

# Course attention counts

The course row, header, and Updates inbox use the same deduplicated notification list. The visible unread count means unread Moodle updates. Announcements have no read flag, so the UI does not claim an announcement-only count.

Overdue counts come from deadlines with a past due time that are not marked submitted and are not orphaned. A null submission status follows the existing pending-work rule. The next deadline appears only within seven days.

`displayTitle` removes a known term prefix and a suffix that exactly matches a known teacher, ignoring case and whitespace. A joined term prefix requires that matching teacher suffix. Uncertain names remain intact. The row button retains the raw full name in its tooltip and accessible description. Its accessible name includes the displayed name, teacher, and attention counts.

# Single-line course rows

The name uses the existing 15px medium token at weight 600. Teacher and a next deadline within seven days follow the name on the same line. Metadata shrinks before the course name. Overdue and Unread have fixed 56px slots with a single muted, right-aligned column header. Zero counts keep the slot empty. Alarm clocks identify overdue deadlines and envelopes identify unread updates; full tooltips describe the counted records. Values over 99 display 99+ while the tooltip and accessible name retain the true count.

The rounded hover surface has 12px horizontal padding and 10px vertical padding. A fixed 20px main line keeps rows at 40px. A catalog container query switches to 52px rows below 600px. Due soon stacks below the catalog under a 1200px window so the normal 1100px window retains the single-line list. A negative list margin keeps text aligned with the page. Adjacent separators hide during hover and keyboard focus, without movement. The inset focus ring uses the existing theme token. Decorative separators and the thin tab underline use `--hairline`, a 10% ink mix that strengthens automatically in high contrast and forced colors. Control borders retain their control tokens.

`vstudy` is the default theme. Its light background is #ffffff and ink is #0a0a0a. Stored `themeId` preferences select another pack, including Ocean (#eef7f9 background, #173b4a ink). Captures explicitly select VStudy, solid material, and 100% contrast. They never read the user's normal profile.

# Pins and Smart order

Pins live in the main-process SQLite `moodle_course_pins` table, introduced by migration 23. The validated `moodle:set-pinned` IPC verifies the account owns the course. Course and account foreign keys cascade deletes. Sync preserves pins for surviving courses and clears pins for missing courses even when reminder history retains an orphaned course. No school operation is sent. Sort choices live in the existing validated SQLite settings as `coursesSort`, separately for each term filter.

The pin button sits after the number columns in a reserved slot. It appears on row hover or keyboard focus, stays visible and filled when pinned, and stays visible on devices without hover. It uses `aria-pressed`, a localized accessible name, and a tooltip. The button sits above the course link overlay. Pin focus uses its own ring; the course opener uses the whole-row inset ring.

`src/shared/moodle-course-order.ts` owns the single pure ordering function. Current defaults to Smart. Pinned courses come first on Current and All. Within each Smart group: upcoming deadlines inside seven days by nearest time, overdue-only by most recent overdue time, unread-only by highest full count, then quiet courses by locale-aware name. Mixed signals use the first applicable tier. Name breaks ties, then course ID makes equal names deterministic. Past, All, and Future default to Name; Name groups terms newest first outside Current. Each filter remembers an explicit choice.

Ordering uses a snapshot taken when the page opens, sync completes, a pin changes, or the student changes the term or sort. Read-state updates change counts without reshuffling rows. FLIP uses a 180ms ease-out transform, preserves the focused element, and is disabled under reduced motion. The capture waits for the shell's navigation-focus frame before starting keyboard tests.

Only the list ships. There is one course-row markup and one `data-view="list"` list, ready for a future presentation change without a second course implementation. No view switch or Cards view is built.
