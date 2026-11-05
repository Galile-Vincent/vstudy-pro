# A planner that helps students choose their next step

Students need an answer to "what can I finish today?" A list of deadlines alone cannot answer it. Work has an estimate, exams need repeated practice, and an overdue submission needs a recovery decision. The assistant must expose its assumptions and let the student change the plan.

## Student needs

- See overdue work and the next fourteen days together, across courses.
- Pick a small, achievable list for today and reserve time before each due date.
- Prepare for exams by topic, with spaced study blocks and selected course materials.
- Balance a heavy week against the time the student says they have. Show work that does not fit.
- Catch up without pretending that an overdue assignment can still meet its original deadline.
- Summarize converted materials with source names and identify missing or truncated content.
- Practice recall using questions grounded in selected documents, with answers separated from questions.

## Domain and ownership

`Task` has an ID, title, nullable course, nullable due time, estimate in minutes, status `todo | doing | done`, source `moodle | user | agent`, optional Moodle deadline, and optional goal. A Moodle deadline remains authoritative for submission state. Creating a linked task does not submit work or replace the deadline. A linked task cannot move its due time after Moodle's due time.

`Exam` has an ID, course, title, date, scope topics, selected material IDs, and an optional source deadline. Scope is explicit, never inferred as confirmed fact from an announcement. `Goal` has a title, optional course and target date, and status `active | achieved`. Tasks can contribute to a goal.

`StudyBlock` reserves a start time and duration for one task, exam, or Moodle deadline. A free-standing block has no target. `StudyPlan` groups blocks with a title, IANA time zone, daily time budget, and explicit assumptions. All timestamps are UTC instants. Daily limits and today's membership use the student's time zone. Blocks cannot overlap, exceed the daily budget, cross a local day, or finish after the target's due time. Overdue work remains visible but unscheduled. After agreeing a recovery date, the student can add a separate recovery task without changing Moodle's original deadline. Estimates are assumptions, not availability inferred from the school timetable.

Existing Moodle reminders keep their current behavior. Planner reminders can point at tasks or exams as well as deadlines. Export includes selected deadlines, tasks, exams, or blocks as stable-UID calendar events. It uses the native save dialog.

Student-owned records live in normalized `planner_tasks`, `planner_exams`, `planner_goals`, `planner_plans`, `planner_blocks`, and `planner_reminders` tables. Migration 21 lives in its own file. Course and deadline references use `ON DELETE SET NULL`, so sync cannot erase a student's plan. Before an existing database migrates, use the shared WAL-aware snapshot mechanism to create a mode-0600 `before-v21` backup. Forward migration is transactional. Downgrade is manual from the backup.

## Runtime and trust boundaries

The existing course assistant already buffers a response, extracts strict `vstudy-action` JSON, and emits proposals. Keep that flow. Chat never writes planner records. A confirmation card explains the full change, including dates, duration, assumptions, and every block in a plan. Only an explicit approval invokes the planner IPC. Main validates schema, course ownership, current targets, due dates, overlaps, and available time again. A receipt keyed by approval ID makes a repeated approval idempotent. A multi-day plan commits all blocks or none.

Actions are `create-task`, `update-task`, `schedule-study-block`, `create-exam`, `make-study-plan`, `plan-today`, `export-calendar`, `set-reminder`, `summarize-course-materials`, and `generate-practice-quiz`. Keep `create-reminder` for existing conversations. Material actions require approval before the selected converted documents enter a new model request. Main resolves IDs to contained local Markdown files and checks course membership and readiness. Course pages never grant tool authority. Documents, announcements, forums, notifications, and history are escaped JSON within untrusted delimiters. Providers still have no native write tools.

## Context and relevance

A pure budgeter ranks overdue and imminent deadlines, today's tasks, exams, existing blocks, grades, recent announcements, sections, and ready material metadata. Include only the next fourteen days for future work. Retain overdue work with an explicit label. A conservative UTF-8 byte budget bounds token use even for CJK text. Fit whole ranked items, report omitted counts, and keep structural delimiters outside the budget. Time zone, locale, sync age, and the current instant are explicit. Cache only assembled course data. Its revision includes SQLite total changes and Moodle sync/detail revisions, so sync and local writes invalidate it. The clock and local day remain fresh on each request.

## Interaction and implementation shape

Courses gains a Today / Planner entry, usable before connecting a school. Today shows tasks, overdue source deadlines, today's study blocks, and exam countdowns. A week view shows reserved minutes for each local day. Quick-add creates a student-authored task. Plan my week builds a deterministic draft from saved tasks, exams, deadlines, and existing blocks. It shows the assumed study window and daily budget, reports unallocated minutes, and requires approval. Course chat also proposes the same typed actions and offers catch-up, exam prep, material summaries, and practice prompts.

Keep the business rules in shared planner schemas and pure constraints. The main planner repository owns transactions and referential checks. The IPC module owns native dialogs and notifications. The context builder owns ranking and bounded serialization. Renderer planner modules own display and approval state. Separate locale files own all English, Traditional Chinese, and Japanese strings.

Two candidates were considered. Extending Moodle reminders into tasks would make a synced deadline own student work and delete plans during pruning. A separate planning model preserves student ownership and permits work without a school account, so it is the chosen design. A fully autonomous scheduler would hide assumptions about free time. A bounded draft with visible capacity and explicit approval is the chosen interaction.

## Verification and limits

Repository tests cover persistence, rollback, references, idempotency, course removal, and the v20-to-v21 backup. Context tests cover byte budgets, relevance, malicious page text, and sync invalidation. Recorded scenario outputs cover a heavy week, an exam in three days, and missing submissions. A mocked model emits the recordings through the same action parser. Constraint tests reject overbooking and late blocks. Run the fixture evaluation with `pnpm exec vitest run src/main/planner/eval.test.ts --pool=forks --maxWorkers=2` in `apps/desktop`.

The fixture evaluation checks contract behavior, not a live model's educational quality. The planner has no class timetable, external calendar availability, OCR, or submission authority. Unknown exam scope and missing materials remain visible uncertainties. Summaries and quizzes need a configured provider and still require student verification.
