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

## Schools

School search uses a bundled curated directory and accepts any public HTTPS Moodle root. A directory entry is a hint, not a claim that the school's mobile service is enabled. The initial bundle includes CYCU, UCL, Warwick, and UNSW. Warwick and UNSW document mobile app restrictions. The live check reports the school's actual availability before sign-in.

`main/moodle/schools.ts` owns entries with a stable `id`, `name`, `localizedNames`, ISO `country`, canonical `host`, login hint, nullable `logoUrl`, and maintainer `notes`. Search matches names in all bundled languages, country names, abbreviations, and hostnames. Connected schools come first, then recent sites, then directory entries. The picker deduplicates by canonical root. It supports arrow keys, Home, End, Enter, ordinary pointer selection, and a labelled combobox with an active option. A missing result always offers URL entry. All new copy lives in the `schools` locale namespace for English, Traditional Chinese, and Japanese.

### Directory decision

We ship local search plus URL entry. There is no remote directory call or background logo lookup while typing. The official app's public [site picker](https://github.com/moodlehq/moodleapp/blob/02b713f13acce5d8ff7e2d171e2734327cb7b8cd/src/core/features/login/pages/site/site.ts) debounces queries of at least three characters and calls `CoreSites.findSites`. At the same revision, the public [service implementation](https://github.com/moodlehq/moodleapp/blob/02b713f13acce5d8ff7e2d171e2734327cb7b8cd/src/core/services/sites.ts) returns an empty list. That source does not expose the production site's search endpoint, authentication, terms, or response contract. Its [download.moodle.org/mobile references](https://github.com/moodlehq/moodleapp/blob/02b713f13acce5d8ff7e2d171e2734327cb7b8cd/src/core/features/login/services/login-helper.ts) are app download links, not a school directory API. We did not infer an API from `lms.moodle.net` or depend on an undocumented endpoint.

A remote directory would disclose students' school queries to another service and add availability and inventory obligations. It offers no necessary capability for URL-based connection. A future remote search must be separately opt-in, name its recipient before consent, validate responses, and record requests in Settings > Privacy. It must preserve local search and URL entry when disabled or offline.

Directory source pages are [UCL Moodle](https://www.ucl.ac.uk/isd/services/digital-education/digital-tools/moodle), [Warwick login guidance](https://warwick.ac.uk/services/digitallearning/support/student-guides/moodle/loggingin/), and [UNSW Moodle guidance](https://www.unsw.edu.au/student/managing-your-studies/academic-life/edtech/moodle). CYCU uses the existing tested iLearning configuration. These URLs are references for maintainers, not runtime network dependencies.

### Discovery and authentication

Only choosing a school or submitting a URL begins discovery. The picker explains this before the action. `site-url.ts` normalizes domains, Unicode hosts, subdirectories, and pasted Moodle page links. It requires HTTPS on the default port, rejects credentials and local addresses, checks DNS at socket creation, and validates redirect destinations. Plain HTTP, LAN-only installations, and untrusted TLS certificates are intentionally unsupported.

The public `tool_mobile_get_public_config` probe supplies the site name, compact and full logos, login mode, availability, registration method, QR capability, and country. Unknown login modes stop with administrator guidance. Maintenance messages become bounded plain text. `forcedUrlScheme` is nullable because the standard Moodle 4.5 [public configuration contract](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/admin/tool/mobile/classes/external.php) does not expose the forced scheme. If a compatible extension advertises `forcedurlscheme`, we retain it. We never guess that the site returns our OS scheme.

Password sites use `/login/token.php` for the `moodle_mobile_app` service. Browser and embedded modes use the existing isolated SSO window and verified one-time callback. External-browser SSO remains a main-process-only option when OS routing and the site's callback scheme are known. Password-endpoint SSO-required errors change the next attempt to the browser plan. After authentication, `core_webservice_get_site_info` verifies the canonical root and user, and its site name takes precedence when provided.

QR credential exchange is not implemented. The UI explicitly directs QR users to ordinary URL and school-account sign-in without sending QR tokens. Self-registration takes place on the school website. A school with no registration method tells students to use an existing account or contact the school. Mobile-disabled, web-service-disabled, maintenance, old-version, and unknown-login responses have clear next steps.

Accounts are keyed by site root and remote user ID. Multiple schools and multiple identities can coexist, with separate tokens, courses, and sync state. Reconnecting an expired account must use that same identity; connecting a different identity while that site's expired account remains requires disconnecting the expired account first. The Connect dialog receives existing accounts from Courses, so opening search does not trigger another overview or sync request. Recent-site storage contains public site information only and excludes image bytes and credentials.

### Logos and network inventory

`main/moodle/logos.ts` fetches a selected school's public compact logo, then its full logo if necessary. Requests are HTTPS, same-origin, unauthenticated, and reject redirects and token-bearing URLs. There is no third-party image proxy or tracker. All app-owned Moodle HTTPS requests record a hostname-only destination in the session inventory under Settings > Privacy. No paths, query strings, passwords, or tokens enter that inventory.

The logo cache is `<userData>/moodle/logos`. Source pointers and image content use SHA-256 filenames, atomic replacement, 0700 directories, and 0600 files. A source URL is fetched once while cached and survives app restarts. Files are validated again by content hash and raster metadata when read. PNG, JPEG, GIF, and WebP must match their declared MIME type, stay within 1 MiB, have positive dimensions no larger than 4096 per axis, and contain at most 4,194,304 pixels. SVG and other active formats are rejected. Logo failures never block connection. The renderer receives only raster data URLs and otherwise generates a monogram from the school name. No automatic expiry refresh occurs; changed source URLs fetch new content, and clearing app data removes cached logos.

Tests use recorded public-config shapes, raster fixtures, mocked transports, and temporary directories. No unit test calls a live university. `e2e/schools-registry.mjs` exercises the built Electron app with fixture discovery and saves screenshots under `docs/evidence/schools`.
