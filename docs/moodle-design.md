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
