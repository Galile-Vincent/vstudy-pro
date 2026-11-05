/** Migration 21 adds student-owned plans. Moodle pruning detaches references instead of deleting student work. */
export const plannerMigration = `
CREATE TABLE planner_goals (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, courseId TEXT REFERENCES moodle_courses(id) ON DELETE SET NULL,
  targetDate TEXT, status TEXT NOT NULL CHECK(status IN ('active','achieved'))
);
CREATE TABLE planner_tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, courseId TEXT REFERENCES moodle_courses(id) ON DELETE SET NULL,
  dueAt TEXT, estimateMinutes INTEGER NOT NULL CHECK(estimateMinutes BETWEEN 5 AND 2880),
  status TEXT NOT NULL CHECK(status IN ('todo','doing','done')), source TEXT NOT NULL CHECK(source IN ('moodle','user','agent')),
  deadlineId TEXT REFERENCES moodle_deadlines(id) ON DELETE SET NULL,
  goalId TEXT REFERENCES planner_goals(id) ON DELETE SET NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX planner_task_deadline ON planner_tasks(deadlineId) WHERE deadlineId IS NOT NULL;
CREATE INDEX planner_tasks_due ON planner_tasks(status,dueAt);
CREATE INDEX planner_tasks_course ON planner_tasks(courseId);
CREATE TABLE planner_exams (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, courseId TEXT REFERENCES moodle_courses(id) ON DELETE SET NULL,
  date TEXT NOT NULL, scopeTopics TEXT NOT NULL CHECK(json_valid(scopeTopics)), materialIds TEXT NOT NULL CHECK(json_valid(materialIds)),
  deadlineId TEXT REFERENCES moodle_deadlines(id) ON DELETE SET NULL, createdAt TEXT NOT NULL
);
CREATE INDEX planner_exams_date ON planner_exams(date);
CREATE TABLE planner_plans (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, timeZone TEXT NOT NULL, dailyBudgetMinutes INTEGER NOT NULL CHECK(dailyBudgetMinutes BETWEEN 15 AND 480),
  assumptions TEXT NOT NULL CHECK(json_valid(assumptions)), createdAt TEXT NOT NULL
);
CREATE TABLE planner_blocks (
  id TEXT PRIMARY KEY, planId TEXT REFERENCES planner_plans(id) ON DELETE SET NULL,
  title TEXT NOT NULL, courseId TEXT REFERENCES moodle_courses(id) ON DELETE SET NULL,
  targetKind TEXT CHECK(targetKind IN ('task','exam','deadline')), targetId TEXT,
  startsAt TEXT NOT NULL, durationMinutes INTEGER NOT NULL CHECK(durationMinutes BETWEEN 5 AND 240),
  CHECK((targetKind IS NULL) = (targetId IS NULL))
);
CREATE INDEX planner_blocks_start ON planner_blocks(startsAt);
CREATE TABLE planner_reminders (
  id TEXT PRIMARY KEY, targetKind TEXT NOT NULL CHECK(targetKind IN ('task','exam','deadline')), targetId TEXT NOT NULL,
  remindAt TEXT NOT NULL, note TEXT NOT NULL, fired INTEGER NOT NULL DEFAULT 0 CHECK(fired IN (0,1))
);
CREATE INDEX planner_reminders_due ON planner_reminders(fired,remindAt);
CREATE TABLE planner_approvals (id TEXT PRIMARY KEY, action TEXT NOT NULL CHECK(json_valid(action)), appliedAt TEXT NOT NULL);
`;
