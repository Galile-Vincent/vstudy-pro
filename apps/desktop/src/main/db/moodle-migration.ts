export const moodleMigration = `
CREATE TABLE moodle_accounts (id TEXT PRIMARY KEY, schoolId TEXT NOT NULL, remoteUserId INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), UNIQUE(schoolId,remoteUserId));
CREATE TABLE moodle_courses (id TEXT PRIMARY KEY, accountId TEXT NOT NULL REFERENCES moodle_accounts(id) ON DELETE CASCADE, data TEXT NOT NULL CHECK(json_valid(data)));
CREATE INDEX moodle_courses_account ON moodle_courses(accountId);
CREATE TABLE moodle_deadlines (id TEXT PRIMARY KEY, courseId TEXT NOT NULL REFERENCES moodle_courses(id) ON DELETE CASCADE, data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE moodle_notifications (id TEXT PRIMARY KEY, remoteId INTEGER NOT NULL, accountId TEXT NOT NULL REFERENCES moodle_accounts(id) ON DELETE CASCADE, data TEXT NOT NULL CHECK(json_valid(data)));
CREATE INDEX moodle_notifications_account ON moodle_notifications(accountId);
CREATE TABLE moodle_grades (id TEXT PRIMARY KEY, remoteKey TEXT NOT NULL, courseId TEXT NOT NULL REFERENCES moodle_courses(id) ON DELETE CASCADE, data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE moodle_files (id TEXT PRIMARY KEY, courseId TEXT NOT NULL REFERENCES moodle_courses(id) ON DELETE CASCADE, url TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), documentId TEXT REFERENCES documents(id) ON DELETE SET NULL);
CREATE TABLE moodle_reminders (id TEXT PRIMARY KEY, deadlineId TEXT NOT NULL REFERENCES moodle_deadlines(id) ON DELETE CASCADE, data TEXT NOT NULL CHECK(json_valid(data)));
CREATE INDEX moodle_deadlines_course ON moodle_deadlines(courseId);
CREATE INDEX moodle_grades_course ON moodle_grades(courseId);
CREATE INDEX moodle_files_course ON moodle_files(courseId);
CREATE INDEX moodle_reminders_deadline ON moodle_reminders(deadlineId);
`;
