# Moodle in vstudy: design brief

Lead: Claude (design). Implementation: Codex. Contract: `apps/desktop/src/shared/moodle.ts`.

## Principles
- Reuse the existing look: tokens in `renderer/tokens.css`, shadcn primitives in `renderer/components/ui`, library card styling in `renderer/library/library.css`. No new color system.
- One new top-level view, `courses`, next to Library in the shell. Navigation stays local React state.
- Calm, scannable, student-first: the question each screen answers is "what do I need to do next".

## Screens
1. **Courses home.** Header: account chip (school, name, sync time, refresh button, expired banner with Reconnect). Row 1: "Due soon" strip, horizontal cards for the next 7 days, each with course color dot, title, relative due time ("in 2 days"), bell button to set a reminder. Row 2: course card grid (auto-fill, min 260px). Each card: cover image or generated gradient from course id, course short name, progress bar, small counters for due soon and unread. Empty, loading skeleton, and offline-stale states are required.
2. **Course page.** Same card as hero. Tabs: Overview, Deadlines, Notifications, Grades, Files. Overview shows next deadline, latest 3 notifications, grade summary, recent files. Right-side agent panel (reuses the chat component) scoped to the course.
3. **Deadlines tab.** Grouped Overdue, This week, Later, Done. Row: title, kind icon, due, submitted state, bell (reminder popover with presets: 1 hour, 1 day, 3 days, custom) and "Add to calendar" (exports .ics).
4. **Notifications tab.** Unread dot, subject, sanitized body preview, time, mark as read. Agent action "Explain what I need to prepare".
5. **Grades tab.** Table with item, grade, max, percentage bar.
6. **Files tab.** Grouped by section. Row: file type icon, name, size, state chip (Not opened, Converting, Ready). Click opens it in the existing reader (download, `importPath`, then workspace view) and the chat there already works on the document.
7. **Connect dialog.** School picker, "Sign in with school account" opens a main-owned window for SSO. Never ask for passwords in renderer for `sso-launch` schools.

## Agent behavior
- Course context (deadlines, notifications, grades, file list) enters the prompt as untrusted data.
- Typed actions only: `create-reminder` and `export-calendar` (see `moodleAgentActionSchema`). The agent proposes, the UI shows a confirmation card, the user approves.

## Accessibility and i18n
- All strings in a new `moodle` namespace for en, zh-Hant, ja. Keyboard reachable cards, visible focus, contrast per `scripts/check-contrast.mjs`, reduced motion respected.

## Browser SSO callback policy

SSO uses an isolated embedded window by default for every site. Moodle's
`admin/tool/mobile/launch.php` can replace our requested `vstudymoodle` scheme
with the site's `tool_mobile.forcedurlscheme`, including `moodlemobile` at CYCU.
The public `tool_mobile_get_public_config` response in Moodle 4.5 does not
advertise this setting. Any main-frame non-HTTP URL shaped as `<scheme>://token=<base64>` is a
callback candidate, including `vstudymoodle`, `moodlemobile`, and site-specific
schemes. The MD5 signature over the site URL variants and the one-time passport
authorizes the response. Invalid candidates are intercepted silently and leave
the window open. Other custom-scheme navigations remain blocked. Success closes
the embedded window, clears its session storage and request listener, restores
the main window, and passes the verified tokens to the account connection flow.

The main-process `MoodleSso.login` option
`{mode:'external',callbackScheme:'vstudymoodle'}` explicitly enables system-browser
SSO when OS routing is available and the site's login plan permits it. Callers
must establish that the site returns our scheme before choosing this option.
The renderer does not expose this option. Never register `moodlemobile` as an OS
handler. That scheme belongs to the official Moodle app. Sites with an unknown
or different forced scheme must use the embedded default.

SSO diagnostics retain only the scheme for custom URLs and only the scheme,
hostname, and port for HTTP URLs. Recovery pages use fixed failure codes and a
retry sentinel intercepted in the embedded window. They never embed callback
authorities or the passport-bearing launch URL.

Sources are Moodle's [launch implementation](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/admin/tool/mobile/launch.php)
and [public configuration contract](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/admin/tool/mobile/classes/external.php).

## Round 2: course detail, term tabs, assistant button (Claude design)

Reference for data: iCYCU app (`/Users/vc/Local/CYCU`, `iLearningCourseDetailView.swift`) and the official Moodle app. Types: `apps/desktop/src/shared/moodle-course.ts`.

### Courses home
- Segmented tabs: **Current** (default), **Upcoming**, **Past**, **All**. Counts in each tab. Current means `identity.lifecycle === "current"`. Courses with unknown lifecycle appear in All and in Current only when the term cannot be determined, with a small "Dates unavailable" note.
- Course card shows a clean display title (never the raw bilingual string), course code and term chip (`1142 · CS924E`), the teacher, class label, a progress bar only when `hasProgress` (otherwise no bar and no "Not available" text), due soon and unread counters.
- Title language follows the app language (zh-Hant or ja shows Chinese when present, en shows English), with a graceful fallback to whichever exists. Keep the raw name as the card tooltip and in the detail header menu.

### Course page
- Hero header: cover, display title, code, term, teacher(s), class label, next deadline summary, refresh.
- Tabs: **Content** (default), **Deadlines**, **Announcements**, **Grades**, **Files**, **Notifications**. Overview content (up next, latest updates) lives at the top of Content as compact cards.
- Content tab: stacked weekly sections from `sections`, each a collapsible card with title, module count and summary. The current week is auto-expanded, badged "This week" and scrolled into view; past weeks collapsed; hidden or locked sections show a lock row. Modules are rows with type icon, name, completion check when tracked, due date, attachment count, and a chevron. Click opens a module detail sheet: sanitized HTML description, attachments (open in our reader), page content inline, link out for URL, forum discussions list, assignment due/status, quiz info. Unsupported types offer "Open in Moodle" through the authenticated route.
- Announcements tab: newest first, author and date, preview, full body in a sheet. Teacher authored first when identifiable.
- Teachers: show names in hero and a People summary when data exists.

### Course assistant
- Not a docked panel. A floating round chat button at bottom right of the course page (and over all tabs), with an unread-proposal dot. Click expands a panel anchored bottom right (about 380 by 560, resizable on wide windows, full height sheet on narrow), with quick prompts, the conversation, and approval cards. Esc or the header button collapses it. State persists while navigating tabs. Respects reduced motion, focus returns to the button on close, labelled for screen readers.
