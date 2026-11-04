# Moodle renderer verification

The renderer adds Courses to the shell, a due-soon strip, course cards, account controls, five course tabs, reminders, calendar export, and file opening in the existing workspace. It uses the existing appearance tokens and UI primitives. English, Traditional Chinese, and Japanese share the `moodle` namespace.

## Reproduce

From the repository root, run:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test
node apps/desktop/scripts/check-contrast.mjs
pnpm --filter @vstudy/desktop exec node src/renderer/courses/verify.mjs
```

The verification script starts a temporary Vite renderer with `VITE_MOCK_DESKTOP=1` and launches Electron through Playwright. It closes Electron and the server afterward. The shared T3 browser was also used to inspect desktop, compact Traditional Chinese, and Japanese dialog layouts.

## Evidence

| Screen | Light | Dark |
| --- | --- | --- |
| Courses home | [Light](home-light.png) | [Dark](home-dark.png) |
| Course overview | [Light](course-light.png) | [Dark](course-dark.png) |
| Files tab | [Light](files-light.png) | [Dark](files-dark.png) |

All six screenshots were inspected. The course header was shortened after inspection to avoid repeating the hero title. The files captures scroll enough to show every file row.

[Electron verification output](electron-verification.txt) records keyboard course navigation, both themes, no horizontal overflow, no serious or critical axe violations on the files screen, reminder persistence, file handoff to the workspace, and no page errors during those flows. Axe uses its same-origin legacy mode because Electron does not support creating the temporary browser target used by its default mode.

The full Vitest run passed 373 tests, with 13 skipped. The Moodle tests cover contract-valid mock data, reader/library availability, read state, reminder creation/removal, reconnect, loading, expiry, offline stale data, failed file opening/retry, disconnect navigation, deadline ordering/grouping, and approved course-scoped agent actions. The contrast script passed for both themes.

## Integration gap

The existing Chat component needs a document-bound conversation. Course chat remains a labeled preview panel. `CourseAgentRequest` and `CourseAgent` in `src/renderer/courses/agent.tsx` define the TODO transport. Course context is marked untrusted. Proposed actions are schema-validated, restricted to the selected course, and confirmed by the user before execution. Notifications and the panel expose the preparation action; without the transport they show an explanation and direct the student to the document assistant.

The screenshots and Electron flows use rich mock data. They do not verify live Moodle authentication, network sync, or actual office-file conversion. The renderer uses `window.vstudy.moodle` when all API methods are present and otherwise uses its mock adapter. No main, preload, or shared IPC files were changed.

A separate existing Vite development issue was observed when the generic `reading.md` mock rendered a fenced TypeScript block. The dynamically loaded `highlight.js` TypeScript module can emit `module is not defined`. Moodle files now use course-specific reading fixtures rather than that unrelated generic document. The shared reader/highlighter implementation was outside this task's ownership and was not changed.
