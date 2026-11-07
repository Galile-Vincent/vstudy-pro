Goal: make Courses calm, scannable, and content-first in the app's flat black and white theme, with the chosen single-line list, meaningful counts, an Updates inbox, local pins, and Smart order.

## Data and privacy

Measured. The final evidence uses built Electron, a fresh temporary profile, fictional Example University data, and device scale factor 2. The fixture has 11 current courses, seven upcoming deadlines, four overdue deadlines, one submitted past deadline, and 33 notifications spread over Today, Yesterday, and Earlier. It includes Chinese and English titles, long names, missing teachers, overdue-only, unread-only, and quiet courses. School HTTP requests and main-process fetch are blocked. The normal app profile was not read. No live school login was used.

Measured. An update is a `MoodleNotification` from `core_message_get_messages`, with `message_popup_get_popup_notifications` as the fallback. Its fields include subject, body, created time, course, read state, and optional URL. Announcements, grades, files, and course modules are separate records. Announcements have no read flag. A notification can describe a grade, discussion, content change, or announcement, but the app does not synthesize unread records from those separate data sources.

Measured. Course unread counts, the header count, and the inbox use the same deduplicated notification feed. The fixture asserts their agreement. Account-wide notifications contribute to the header and inbox without belonging to a course row. Tooltips say “unread updates” rather than “unread announcements,” and “overdue deadlines” rather than “assignments,” because the contracts include other deadline kinds.

Measured. Overdue counts are derived from deadlines for that course whose due time is in the past, which are not marked submitted and are not orphaned. The same helper supplies the most recent overdue time and the next pending deadline within seven days. Submitted and orphaned work are excluded. A null submission status follows the existing pending-work rule.

Measured. Read actions reuse the existing SQLite notification record, IPC, Moodle read acknowledgement, and retry behavior. Marking unread stores `localUnread` in that existing JSON record and sends no unread operation to Moodle. Sync preserves that override until the student marks the item read. No separate inbox database was introduced.

## Before critique and design rounds

Inferred from the original before images. Large gradient covers and the page glow compete with course text. Repeated bordered containers make the account, deadlines, filters, and courses look equally important. Zero progress and empty deadline pills occupy space without identifying work. Tall horizontal deadline cards interrupt comparison and expose a clipped edge and scrollbar.

Measured. The initial rounds removed covers, gradients, filler copy, empty filters, and dead cover code. A compact catalog replaced the card grid. Due soon became a list of the next five deadlines with Show all. Updates became one header entry opening an inbox. A second round corrected obsolete card CSS and established the catalog and deadline columns. A third round refined spacing, keyboard behavior, persistence, and scroll fades.

Inferred from the subsequent before captures. Course codes remain visual noise, plain dots do not explain attention, and the earlier right-side status text zigzags. The 68px option D rows fix padding and alignment but still spend too much vertical space. Light separators made with the control-border token are too prominent.

Measured. The option D rounds added inset hover padding, fixed number slots, clean names, accessible raw descriptions, consistent Due soon alignment, and tested name cleanup. An inherited CJK line height initially made rows taller; scoped line heights fixed it. The next rounds changed decorative rules to `--hairline`, added column labels, and replaced the triangle and dot with an alarm clock and envelope.

Measured. The final density rounds implement the supplied single-line spec. Round 1 measured 11 visible courses at 1280px but only seven at 1100px because the catalog became narrow. Round 2 identified the Pinned heading's invalid position in list semantics. Round 3 moved the label outside the list, stacked Due soon below the catalog under 1200px, and reduced excess space above the rows. Final refinement removed the redundant pin and row double focus ring. The final capture also corrected a native-window viewport race and an incomplete simulated-sync response discovered by looking at the images.

## Every requested row and light-mode fix

Measured. Course codes are absent. The name uses the existing 15px token at weight 600, with one-line ellipsis. Known teacher and deadline metadata follow it on the same line. Metadata shrinks before the title. No zero count, empty deadline pill, or zero progress ring appears. A deadline within 24 hours gets an ink clock and stronger weight, never red.

Measured. The conservative display-name function strips known term prefixes and teacher suffixes only when the pattern is safe. Joined numeric prefixes require a matching known teacher suffix. Uncertain names remain intact. Tests cover matching and unmatched suffixes, meaningful hyphens, numeric names, case, whitespace, and teacher punctuation. The full raw name stays in the tooltip and accessible description. The course opener's accessible name order remains name, teacher, overdue, unread, deadline. Visually capped 99+ counts retain the real number in tooltips and screen reader text.

Measured. Due soon consistently shows the course name, a start-aligned assignment title clamped to two lines, and a quiet time and bell footer. CSS explicitly sets `text-align:start` and `justify-items:start`. Only deadlines within 24 hours receive the warning accent. It no longer scrolls horizontally.

Measured. Course dividers, Due soon rules, the account bar, Updates separators, and the thin selected-tab underline use the existing `--hairline`, a 10% ink mix. Computed-style checks confirm the same token in both schemes. Control borders keep their control tokens. Both `prefers-contrast:more` and forced colors restore stronger lines; their screenshots were inspected.

Measured. A single aria-hidden header row labels the two right-aligned 56px slots: Overdue / Unread, 逾期 / 未讀, and 期限切れ / 未読. Labels are 12px, muted, and remain on one line. Alarm clocks and envelopes reinforce meaning. Full-phrase tooltips describe the underlying records. Row screen reader names do not depend on that visual header or on color.

Measured. The default `vstudy` light palette is #ffffff background with #0a0a0a ink. Ocean is #eef7f9 background with #173b4a ink. Validated stored `themeId` settings and the appearance cache select the saved pack. Captures explicitly choose VStudy, solid material, and 100% contrast.

Inferred. The reported blue-white background and slate text are consistent with a stored Ocean or another colored pack preference. The actual selected preference cannot be confirmed without reading the real profile, which was intentionally avoided.

## Single-line density and adaptations to the references

Measured. Rows are 40px with 10px vertical and 12px horizontal padding, an 8px radius, and a fixed 20px main line. Counts and their headers align at 56px each. The negative list margin keeps text on the page edge. Hover and focus hide neighboring separators without shifting layout. Pressed state changes only the surface. The course opener has width 100% for ellipsis and a whole-row overlay.

Measured. The catalog container query uses the specified 52px two-line fallback below 600px. Measured counts below refer to complete unpinned rows whose top and bottom are inside the actual viewport. Both schemes agree.

| Window | Catalog | Row height | English above fold | Traditional Chinese / Japanese above fold |
| --- | ---: | ---: | ---: | ---: |
| 1280 × 800 | 648px | 40px | 11 of 11 | 11 of 11 |
| 1100 × 720 | 780px | 40px | 10 of 11 | 10 of 11 |
| 640 × 800 | 608px | 40px | 9 of 11 | 8 of 11 |
| 552 × 800 | 520px | 52px | 7 of 11 | 6 of 11 |

Measured. Compared against the supplied reference renders, the desktop captures match the 40px density, padded hover, pressed behavior, fixed slots, and inset course focus ring. The actual narrow app header consumes more height than the mock-up, so the 520px catalog does not reproduce its nine-course claim. The screenshots show that limit rather than hiding app chrome.

Measured. The app's existing `--active` remains #242424 dark and #ececec light, and its focus token remains white or black. These replace the reference's hardcoded hover colors and blue focus. The seven-day horizon is retained. The alarm clock, envelope, column labels, and reserved pin slot follow the later user decisions. Due soon stacks under the catalog below 1200px to preserve readable single-line content at 1100px.

Inferred. A compact deadline list is easier to compare than horizontal cards. The top label explains counts more reliably than words that appear only on hover. Keeping the app's hover and focus tokens makes the page consistent with the rest of the product.

Measured. Only the single-line list ships. One `data-view="list"` list and one course-row implementation remain friendly to a future presentation change. No Cards view, view switch, or duplicate per-view row markup was added.

## Pins and Smart order, reported separately

Measured. Migration 23 adds `moodle_course_pins` to main-process SQLite. Pins are keyed by course with its connected account, validated by `moodle:set-pinned`, and never sent to Moodle. Existing course IDs include account identity. Re-sync preserves surviving pins; foreign keys clean up deleted courses and accounts. Sync also clears pins for disappeared courses retained only for reminder history. Disk-reopen tests verify pin and sort persistence, account isolation, unpinning, re-sync, and missing-course cleanup.

Measured. The pin occupies a reserved slot after the count columns. It is visible and filled when pinned, otherwise appears on row hover and focus within. Devices without hover keep it visible. The button has localized Pin course / Unpin course names, tooltip, `aria-pressed`, and normal Tab access. It sits above the course opener overlay, so pinning does not open the course. Pin focus marks the pin control; opener focus marks the whole row. Real keyboard pin and unpin actions retain focus after movement.

Inferred. Putting the pin after the count columns keeps the title at the established page edge and avoids inserting another symbol before every course name. Reserving its space keeps all numbers and headers aligned.

Measured. One pure function, `src/shared/moodle-course-order.ts`, owns ordering. Current defaults to Smart. Pins form the first group on Current and All. Within each Smart group: upcoming within seven days by nearest due time, overdue-only by most recent overdue time, unread-only by highest full unread count, then everything else by locale-aware name. Mixed signals use the first applicable tier. Name breaks ties, then course ID makes equal names deterministic. Pinned courses use the same Smart ranking among themselves.

Measured. Past and All default to Name, grouped by newest term then name, because their deadlines are not necessarily actionable. Future also defaults to Name. The quiet sort control offers Smart and Name and remembers an explicit choice per filter through the existing validated SQLite settings. Pinned grouping still applies to Name on Current and All. No hidden ranking signal or server preference is used.

Measured. Ordering snapshots refresh on page opening, completed sync, pin/unpin, term change, and sort change. Read changes update counts without changing order. Real capture checks assert this. FLIP samples show 180ms ease-out transforms during a simulated due-time change, retain focus on the same course, and contain no move animation under reduced motion. Eight captured frames show the move and settled order. Tests cover empty and zero inputs, every tier, mixed signals, boundaries, ties, huge counts, pins, terms, locale names, and input immutability.

## Updates and remaining horizontal scrolling

Measured. Updates provides Today, Yesterday, Earlier, course senders, one-line subjects and previews, relative times, stronger unread text and muted read text. Enter opens and marks read. Arrows, Home, and End move focus; M toggles read. All / Unread, per-item read/unread, Mark all as read, the item reader, and the caught-up state are implemented in all three locales. Reload tests use the production read-state IPC and SQLite.

Measured. The remaining horizontal scrollers are course detail tabs and table wrappers. Standard and WebKit scrollbars are hidden. A 40px eased mask appears only at edges with more content. Scroll and resize listeners update native mask positions with a 180ms transition. The scrollers retain momentum, keyboard focus, and a visible ring. Reduced motion removes the transition; high contrast removes the mask. Eight inspected frames show the fade appearing without a scrollbar, with separate start, middle, and end captures.

## Best evidence and reproduction

Measured. These images were captured and inspected, including row review panels for every scheme, locale, and width, the inbox states, pin states, and both frame sequences.

- Original before: [dark](before-dark-1280.png), [light](before-light-1280.png).
- Before the density change: [dark](before-single-line-rows-zh-Hant-dark-1280-rest.png), [light](before-single-line-rows-zh-Hant-light-1280-rest.png).
- Final desktop: [Chinese dark](single-line-final-rows-zh-Hant-dark-1280-rest.png), [Chinese light](single-line-final-rows-zh-Hant-light-1280-rest.png), [English at 1100px](single-line-final-rows-en-light-1100-rest.png).
- Final interaction: [hover](single-line-final-rows-zh-Hant-light-1280-hover.png), [course focus](single-line-final-rows-zh-Hant-dark-1280-focus.png), [520px catalog](single-line-final-rows-zh-Hant-light-552-review.png).
- Pins: [two pinned](single-line-final-pinned-zh-Hant-dark.png), [pin hover](single-line-final-pin-hover-en-light.png), [pin focus](single-line-final-pin-focus-zh-Hant-light.png), [Name](single-line-final-sort-name.png), [Smart after sync](single-line-final-smart-after-sync.png).
- Inbox: [dark](single-line-final-updates.png), [light](single-line-final-updates-light.png), [opened item](single-line-final-item-open.png), [Unread](single-line-final-unread.png), [empty](single-line-final-empty.png).
- Horizontal scroll: [middle](single-line-final-scroll-middle.png), [eight frames](scroll-fade-frames.md), [frame review](single-line-final-scroll-frames-review.png).
- Smart move: [eight-frame review](single-line-final-smart-sync-review.png).
- [Final capture measurements and axe results](single-line-final-verification.json).

Measured. The reusable command, from `apps/desktop`, is `pnpm build && node e2e/capture-courses.mjs`. See [the Courses README](../../../../apps/desktop/src/renderer/courses/README.md). The script writes screenshots, review panels, both frame sequences, geometry, persistence checks, and audits to this directory. It lowers the minimum size only in its fixture window and asserts both viewport dimensions and page bounds. It launches a temporary copy of the completed build, records entry and renderer hashes, and removes the copy after capture, so a running dev server or another build cannot rewrite its artifact.

## Verification and earlier failures

Measured. Final checks pass. Full outputs are linked.

| Command or check | Final result |
| --- | --- |
| Desktop `pnpm typecheck` | Exit 0. [Log](typecheck.log) |
| Desktop `pnpm build` | Exit 0. [Log](build.log) |
| `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run src/renderer src/shared src/main/moodle --pool=forks --maxWorkers=2` | 93 files passed, one skipped; 835 tests passed, one skipped. [Log](vitest.log) |
| Root `pnpm knip` | Exit 0, one configuration hint. [Log](knip.log) |
| Relevant database migration/store tests | Eight tests passed. [Log](migration-tests.log) |
| Built Electron capture | PASS, 41 axe audits, zero violations. [Log](single-line-final-capture.log) |
| `git diff --check` | Exit 0 |

Measured. Earlier failures are preserved in their original logs. These are the verbatim failure messages, followed by the correction.

```text
TypeError: matchMedia is not a function
TypeError: mql.addEventListener is not a function
AssertionError: expected  to have a length of 1 but got +0
AssertionError: expected <button …(5)>…(1)</button>
…(1) to have a length of 1 but got 2
```

Measured. The jsdom media-query stub needed listeners; connection now refreshes the ordering snapshot; the old one-button selector now targets the course opener. [Draft test output](pin-draft-tests.log), [second draft output](pin-draft-tests-2.log).

```text
AssertionError [ERR_ASSERTION]: Keyboard focus stays on the pin after its row moves
false !== true
Element has children which are not allowed: h3[tabindex]
AssertionError [ERR_ASSERTION]: FLIP transforms were sampled during the real sync reorder
locator.click: Error: strict mode violation: getByRole('button', { name: 'Courses', exact: true }) resolved to 2 elements:
```

Measured. Focus-event tracing found the initial shell navigation frame taking focus. The capture now waits for that frame. Movement explicitly preserves focus. The Pinned heading moved outside the list. Animation sampling now starts before screenshots can finish animations, and the back button selector is scoped to the inbox. Full failures: [focus](single-line-after-3-focus-race-failure-capture.log), [list semantics](single-line-after-2-capture.log), [frame sampling](single-line-after-3-frame-race-failure-capture.log), [selector](single-line-after-3-selector-failure-capture.log).

Measured. Visual inspection also rejected a narrow capture whose layout exceeded the screenshot and a simulated-sync image showing “Could not refresh. Showing your last synced courses.” The capture now removes the fixture window's minimum-size clamp, checks real bounds, returns the complete validated sync contract, and asserts no sync error banner. Historical evidence: [viewport mismatch](single-line-narrow-viewport-failure.png), [sync fixture](single-line-sync-fixture-failure-smart-after-sync.png).

Measured. An earlier locale contract failure was fixed by giving all three locales identical keys and interpolation forms. Its original output remains in [the locale failure log](vitest-feedback-locale-failure.log).

```text
FAIL  src/shared/i18n.test.ts > locale contracts > zh-Hant has identical keys, variables and valid plural categories
FAIL  src/shared/i18n.test.ts > locale contracts > ja has identical keys, variables and valid plural categories
```

Measured. Nonfatal output remains:

```text
ExperimentalWarning: SQLite is an experimental feature and might change at any time
Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package
Configuration hints (1)
.css  apps/desktop  knip.json  Compiled extension excluded by project (imports not followed)
```

Measured. A later capture reload also failed with this verbatim error:

```text
page.reload: net::ERR_FILE_NOT_FOUND
```

Measured. The capture now isolates the completed build in the authorized scratchpad and records its hashes. The shared dev server remains running. [Original output](single-line-shared-build-failure-capture.log).

Measured. The first isolated copy omitted files required during desktop startup and timed out before opening a window. The copy now preserves the desktop build icons and sibling MCP distribution layout. The final complete copy passes.

```text
electronApplication.firstWindow: Timeout 30000ms exceeded while waiting for event "window"
```

Measured. [Original isolated-startup output](single-line-artifact-startup-failure-capture.log).

## Open risks

Measured. No live school delivery or acknowledgement was tested. The user-identified pre-existing `src/main/mcp/grants.test.ts` failure lies outside the requested subset and was not run. No commit, stash, checkout, reset, or dev-server shutdown was performed.

Inferred. A null submission status can reflect unavailable Moodle submission data, so overdue means not marked submitted rather than proof of a missing submission. Very long names and metadata still require ellipsis, especially with the pin slot. Raw names and complete accessible text remain available. The narrow header reduces the number of visible courses compared with the isolated design mock-up.

Measured. There is no announcement-only unread count in the model. Local unread state cannot represent a server-wide unread reversal. The reported real profile's selected theme remains unknown. No guess about that preference is presented as measured fact.
