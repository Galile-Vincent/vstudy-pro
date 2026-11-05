# Student planner verification

The student planner turns coursework and exams into explicit, approved study plans. The implementation branch is `t3/study-agent`. It integrates main through `0f74be5`, including school discovery, themes, chat history, the Moodle webview, storage infrastructure, and guided onboarding.

## Final merged checks

- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `pnpm contrast:check` passed for all theme variants and contrast settings. All 22 renderer CSS files use semantic tokens.
- The final targeted Vitest run passed 192 tests in 23 files with `--pool=forks --maxWorkers=2`. It covers planner persistence, migration from v20, shared storage migrations and caches, course chat, document deletion during material requests, prompt injection, context budgets, recorded evaluations, Courses controls, locale contracts, and appearance initialization.
- `node scripts/security-lint.mjs` passed with three existing, allowlisted dynamic-URL warnings in main IPC, SSO, and the Moodle webview.
- `node e2e/planner.mjs` passed against the production Electron build after the storage and onboarding merges. It closed every instance it launched. No Vite or background server was started.

The targeted command, run from `apps/desktop`, was:

```sh
pnpm exec vitest run src/main/planner src/main/db/index.test.ts src/main/db/migrate.test.ts src/main/db/chat-history.test.ts src/main/cache src/main/services/chat.test.ts src/main/prompt/course.test.ts src/renderer/courses src/renderer/onboarding src/shared/i18n.test.ts src/shared/planner-policy.test.ts src/renderer/settings/apply-appearance.test.ts --pool=forks --maxWorkers=2
```

## Single full-suite run

The full suite ran once before the final storage and onboarding merges. It reported 788 passed, 14 skipped, and 15 setup failures in the merged school and appearance tests. Node 26's process-level `localStorage` shadowed jsdom's window storage. Vitest workers now disable Node Web Storage. The targeted rerun included all 15 failed cases and passed. The full suite was not repeated, per the RAM constraint. A complete full-suite pass on the final merged tree is not claimed.

## Dependency audit blocker

`pnpm security:check` stopped at its dependency audit before running its test step. The unreviewed advisory is [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), a moderate minimatch denial-of-service advisory. The affected locked versions are 9.0.9 through the SBOM tooling and 10.2.6 through electron-builder. This branch changes no dependency versions and does not accept the advisory. Static security checks and the unit checks were run separately.

## Evidence

`verification.txt` records the production Electron assertions. `accessibility.json` is the empty violation list from the planner's automated WCAG A and AA audit. Screenshots remain local generated evidence under this directory, following repository hygiene rules.

- `plan-proposal-light.png` shows assumptions, capacity, every proposed block, and approval controls before any blocks are stored.
- `planner-week-light.png` shows the saved seven-day plan.
- `course-task-proposal.png` shows the model's task proposal before approval.
- `planner-en-dark.png`, `planner-zh-Hant-light.png`, and `planner-ja-dark.png` show Ocean, Grove, and Iris themes, persistence across reloads, all three languages, and the narrow Japanese layout.

The scenario verifies quick-add, plan approval, exam creation, countdowns, native calendar export, a course-agent task, approved document access for a quiz, no action JSON leaking into chat, and no renderer page errors. Model responses use the deterministic fake provider. Excerpt delivery, truncation, containment, and deletion cancellation also have unit integration tests.

## Migration and limits

Planner migration 21 follows storage migrations 19 and 20. It uses the shared migration checksum and private WAL-aware backup mechanism. Its migration test checks `before-v21.bak`, permissions, retained multilingual data, integrity, and persistence after restart. Student work survives removal of its school course.

Live-model educational quality is not evaluated. The planner assumes the student confirms available hours and work estimates. It has no external-calendar availability or class timetable. Goals have persistence and task relationships, but no dedicated goal editor. Summaries and quizzes require a configured provider and converted materials. Independent review remains with the coordinator; this implementation opens no PR.

## Shared integration files

- `apps/desktop/src/shared/domain.ts`, `ipc.ts`, `moodle.ts`, and `i18n.ts` add the material request, planner contracts, action union, and locale namespace. Every merged namespace remains registered.
- `apps/desktop/src/main/db/index.ts` registers migration 21. It retains the shared storage migration runner.
- `apps/desktop/src/main/ipc/index.ts` registers planner handlers and stops planner notifications during shutdown.
- `apps/desktop/src/main/services/chat.ts` attaches bounded context and approved excerpts, validates proposals, and cancels material requests when documents are deleted. `main/prompt/course.ts` preserves the proposal-only flow.
- `apps/desktop/src/main/moodle/reminders.ts` shares the calendar serializer with study-block exports. `main/providers/index.ts` extends only the existing fake provider's fixtures.
- `apps/desktop/src/renderer/chat.tsx` carries material approval for the next request. `renderer/courses/agent.tsx` and `index.tsx` connect the cards and planner entry.
- `apps/desktop/vitest.config.ts` keeps two fork workers and disables Node's global Web Storage so jsdom controls renderer storage.
