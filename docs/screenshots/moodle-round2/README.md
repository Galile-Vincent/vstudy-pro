# Moodle Round 2 renderer evidence

The renderer uses the existing `MoodleCourse.identity`, `MoodleCourseDetail.sections`, `announcements`, and `MoodleTermFilter` contracts. No main-process files or shared contract types changed.

## Reproduce

Run from the repository root with dependencies installed.

```sh
NODE_OPTIONS=--no-experimental-webstorage pnpm build
NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @vstudy/desktop exec node src/renderer/courses/verify-round2.mjs
NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @vstudy/desktop exec vitest run src/renderer/courses
NODE_OPTIONS=--no-experimental-webstorage pnpm typecheck
NODE_OPTIONS=--no-experimental-webstorage pnpm lint
NODE_OPTIONS=--no-experimental-webstorage pnpm test
NODE_OPTIONS=--no-experimental-webstorage pnpm security:check
```

The script launches real Electron with the mock renderer, then closes Electron and its temporary Vite server. All test commands use the requested Node option. The installed runtime reports Node v24.19.0 rather than Node 26.

## Screenshots

Each screen has four captures. Filenames end in `light-1440`, `dark-1440`, `light-760`, or `dark-760`, followed by `.png`.

| Screen | Filename prefix |
| --- | --- |
| Current courses | `home-current` |
| Past courses | `home-past` |
| All courses | `home-all` |
| Course hero and Content summary | `course-content` |
| Expanded current week and collapsed assistant button | `current-week-chat-collapsed` |
| Module detail sheet | `module-sheet` |
| Announcements with previews | `announcements` |
| Expanded assistant | `assistant-expanded` |

All 32 final screenshots were visually inspected in contact sheets. The assistant and announcement captures were also inspected individually during iteration. Inspection caught blank HTML announcement previews and a composer below the panel edge. Both were fixed and recaptured.

[Electron verification](electron-verification.txt) records term counts, the current week, sheet opening, assistant collapse and focus restoration, composer geometry, horizontal overflow, and serious or critical axe violations. All checks passed for both themes at both widths. There were no renderer page errors.

## Checks

- [Renderer tests](checks/renderer-tests.txt) passed all 38 tests. Coverage includes lifecycle filters, display language fallbacks, absent progress, weekly collapse, the current week, locked sections, HTML sanitization, announcement previews and full bodies, attachment reader handoff, assistant persistence, Escape, and focus restoration.
- [Lint](checks/lint.txt) and [build](checks/build.txt) passed.
- [Typecheck](checks/typecheck.txt) failed only at `src/main/prompt/course.test.ts:6`. Its fixture lacks `sections` and `announcements`. There were no renderer or dev-mock diagnostics.
- [Security and full tests](checks/security-and-tests.txt) passed the dependency audit policy and security lint, then failed at the known main-process tests. There were 571 passing tests, 26 failures, and 13 skipped tests. Failures comprise ten tests in `src/main/moodle/client.test.ts`, fifteen in `src/main/moodle/service.test.ts`, and one in `src/main/services/chat.test.ts`. Boundary fixtures lack the new identity shape, which also prevents service sync fixtures from populating records. These files were left to the data builder. Security lint reports its two existing allowlisted main-process external-URL warnings.

## Integration assumptions and gaps

`courses/display.ts` is the temporary display helper. It exports `displayTitle(identity, lang, rawFallback?)`, `displayTeachers(identity, lang)`, and `displayClass(identity, lang)`. It assumes the planned shared `displayTitle(identity, lang)` returns a string. On integration, import the shared helpers and retain the course's raw full name as the final fallback at the call site. The shared teacher and class helper names were not specified, so their eventual exports must be matched then. No shared helper existed in this worktree during implementation.

The current contract provides module descriptions, attachment IDs, due dates, submission status, and URLs. It has no forum discussion records, quiz attempt limits, participant roles, or authenticated browser-launch API. Sheets render every supplied description and status, with external Moodle links for further details. Dedicated forum discussion lists, richer quiz summaries, teacher-role prioritization, and authenticated Moodle routing remain dependent on those contracts. Missing URLs cannot produce a Moodle action. Remote images are omitted from description HTML entirely. Allowed links pass `externalUrlSchema` and use the existing `shell:openExternal` bridge.

The four fixture identities use the requested raw CYCU names and explicit lifecycle values across current, future, and past. Every course has 16 weekly sections. Lifecycle values are demonstration data rather than an inference from the host's current date. Live Moodle sync and authentication were not exercised.

Model the Domain kept filtering and localized metadata in one typed helper. Prove It Works changed verification from compilation alone to Electron interaction checks and inspected screenshots. Implementation and verification ran in-thread because this task explicitly assigned an implementation sub-agent.
