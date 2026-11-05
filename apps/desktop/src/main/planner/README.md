# Student planner

The planner stores student-owned tasks, exams, goals, study plans, blocks, and reminders. Moodle deadlines remain the source for submission state. Sync detaches deleted course and deadline references without deleting student work.

## Ownership

`shared/planner.ts` defines records, strict action schemas, and IPC contracts. `shared/planner-policy.ts` validates course ownership, current targets, due times, overlaps, and daily limits. `shared/planner-draft.ts` creates a deterministic draft within an explicit local study window. It reports unallocated work instead of inventing time.

`repository.ts` validates approvals against current SQLite state. A plan and its approval receipt share one savepoint. Reusing an approval ID with the same payload does nothing. Reusing it with another payload fails. Chat parsing never calls the repository write methods.

`context.ts` ranks cached information and fits complete items within a UTF-8 byte budget. Byte count is a conservative token estimate, not provider-reported usage. Delimiters stay outside serialized untrusted data. The row cache invalidates on SQLite total changes or data-version changes. Current time is supplied separately.

`materials.ts` reads approved converted course documents through contained paths. Each document contributes at most 8,000 bytes and carries a truncation flag. Original files and paths never enter prompts. Material actions run through the configured chat provider after confirmation.

`calendar.ts` resolves calendar IDs and exports stable UIDs. Native save destinations and notifications belong to `main/ipc/planner.ts`. Pending reminders survive restart. Unavailable or completed targets do not fire.

## Run verification

Run from `apps/desktop`.

```sh
pnpm exec vitest run src/main/planner src/main/prompt/course.test.ts src/main/services/chat.test.ts src/renderer/courses/planner.test.tsx --pool=forks --maxWorkers=2
pnpm build
node e2e/planner.mjs
```

The evaluation in `eval.test.ts` compares drafts with `__fixtures__/expected.json`. A mocked model streams those recorded actions through the course action parser. Heavy-week, imminent-exam, and missing-submission scenarios check capacity, source deadlines, and explicit unallocated work. Corrupted proposals must be rejected. These recordings test contract behavior. They do not measure live-model teaching quality.

Migration 18 is in `db/planner-migration.ts`. Opening an existing database first creates a private `before-v18` backup after checkpointing WAL. See `docs/AGENT_DESIGN.md` for product decisions and limits.
