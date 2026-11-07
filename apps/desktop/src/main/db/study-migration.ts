/** Migration 23 keeps private study evidence separate from library and Moodle content. */
export const studyMigration = `
CREATE TABLE study_courses (
 id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
 aliases TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(aliases) AND json_type(aliases)='array' AND length(CAST(aliases AS BLOB))<=8192),
 moodleCourseId TEXT UNIQUE REFERENCES moodle_courses(id) ON DELETE SET NULL,
 createdAt TEXT NOT NULL, archivedAt TEXT
);
CREATE TABLE study_units (
 id TEXT PRIMARY KEY NOT NULL, courseId TEXT NOT NULL REFERENCES study_courses(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('moodle','document','manual')), ordinal INTEGER NOT NULL CHECK(ordinal>=0),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 240), sourceKey TEXT NOT NULL CHECK(length(sourceKey) BETWEEN 1 AND 240),
 sourceSectionId TEXT, startsAt TEXT, endsAt TEXT,
 CHECK(startsAt IS NULL OR endsAt IS NULL OR startsAt<endsAt), UNIQUE(id,courseId), UNIQUE(courseId,kind,sourceKey)
);
CREATE TABLE study_course_documents (
 courseId TEXT NOT NULL REFERENCES study_courses(id) ON DELETE CASCADE,
 documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, attachedAt TEXT NOT NULL,
 PRIMARY KEY(courseId,documentId)
);
CREATE INDEX study_course_documents_document ON study_course_documents(documentId);
CREATE TABLE study_document_units (
 courseId TEXT NOT NULL, documentId TEXT NOT NULL, unitId TEXT NOT NULL,
 PRIMARY KEY(courseId,documentId,unitId),
 FOREIGN KEY(courseId,documentId) REFERENCES study_course_documents(courseId,documentId) ON DELETE CASCADE,
 FOREIGN KEY(unitId,courseId) REFERENCES study_units(id,courseId) ON DELETE CASCADE
);
CREATE INDEX study_document_units_unit ON study_document_units(unitId,courseId);
CREATE INDEX study_document_units_document ON study_document_units(documentId);
CREATE TABLE study_chat_links (
 conversationId TEXT PRIMARY KEY NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 courseId TEXT REFERENCES study_courses(id) ON DELETE SET NULL,
 method TEXT NOT NULL CHECK(method IN ('scope','document','alias','model','manual')),
 confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
 confirmed INTEGER NOT NULL DEFAULT 0 CHECK(confirmed IN (0,1)),
 excludeFromMemory INTEGER NOT NULL DEFAULT 0 CHECK(excludeFromMemory IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=0), updatedAt TEXT NOT NULL
);
CREATE INDEX study_chat_links_course ON study_chat_links(courseId);
CREATE TABLE study_jobs (
 id TEXT PRIMARY KEY NOT NULL, conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 userMessageId TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 assistantMessageId TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 extractorVersion TEXT NOT NULL CHECK(length(extractorVersion) BETWEEN 1 AND 120),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','succeeded','failed','cancelled','skipped')),
 attemptToken TEXT, attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 courseId TEXT REFERENCES study_courses(id) ON DELETE CASCADE,
 assignmentRevision INTEGER NOT NULL DEFAULT 0 CHECK(assignmentRevision>=0),
 questionSummary TEXT CHECK(length(questionSummary)<=240), occurredAt TEXT NOT NULL,
 errorCode TEXT CHECK(length(errorCode)<=120), createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
 UNIQUE(assistantMessageId,extractorVersion), UNIQUE(id,courseId)
);
CREATE INDEX study_jobs_claim ON study_jobs(status,createdAt);
CREATE INDEX study_jobs_conversation ON study_jobs(conversationId);
CREATE INDEX study_jobs_user ON study_jobs(userMessageId);
CREATE INDEX study_jobs_assistant ON study_jobs(assistantMessageId);
CREATE INDEX study_jobs_course ON study_jobs(courseId);
CREATE TRIGGER study_job_sources_insert BEFORE INSERT ON study_jobs BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM messages WHERE id=NEW.userMessageId AND conversationId=NEW.conversationId AND role='user')
 OR NOT EXISTS(SELECT 1 FROM messages WHERE id=NEW.assistantMessageId AND conversationId=NEW.conversationId AND role='assistant')
 THEN RAISE(ABORT,'study invalid message source') END;
END;
CREATE TRIGGER study_job_sources_update BEFORE UPDATE OF conversationId,userMessageId,assistantMessageId ON study_jobs BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM messages WHERE id=NEW.userMessageId AND conversationId=NEW.conversationId AND role='user')
 OR NOT EXISTS(SELECT 1 FROM messages WHERE id=NEW.assistantMessageId AND conversationId=NEW.conversationId AND role='assistant')
 THEN RAISE(ABORT,'study invalid message source') END;
END;
CREATE TRIGGER study_message_sources_update BEFORE UPDATE OF role,conversationId ON messages
 WHEN EXISTS(SELECT 1 FROM study_jobs WHERE (userMessageId=OLD.id AND (NEW.role!='user' OR NEW.conversationId!=conversationId)) OR (assistantMessageId=OLD.id AND (NEW.role!='assistant' OR NEW.conversationId!=conversationId))) BEGIN
 SELECT RAISE(ABORT,'study invalid message source');
END;
CREATE TABLE study_observations (
 id TEXT PRIMARY KEY NOT NULL, jobId TEXT NOT NULL REFERENCES study_jobs(id) ON DELETE CASCADE,
 courseId TEXT NOT NULL REFERENCES study_courses(id) ON DELETE CASCADE, unitId TEXT,
 conceptKey TEXT CHECK(length(conceptKey) BETWEEN 1 AND 240), proposedLabel TEXT CHECK(length(proposedLabel) BETWEEN 1 AND 240),
 errorType TEXT NOT NULL CHECK(errorType IN ('none','slip','mistake','misconception','gap')),
 signal TEXT NOT NULL CHECK(signal IN ('asked','confused','wrong','gave_up','resolved')),
 evidenceQuote TEXT NOT NULL CHECK(length(evidenceQuote)<=240),
 evidenceKind TEXT NOT NULL DEFAULT 'quote' CHECK(evidenceKind IN ('quote','paraphrase')),
 weaknessNote TEXT CHECK(length(weaknessNote)<=240), confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
 wrongAttempt INTEGER NOT NULL DEFAULT 0 CHECK(wrongAttempt IN (0,1)),
 dismissed INTEGER NOT NULL DEFAULT 0 CHECK(dismissed IN (0,1)), resolved INTEGER NOT NULL DEFAULT 0 CHECK(resolved IN (0,1)), createdAt TEXT NOT NULL,
 CHECK((conceptKey IS NOT NULL) != (proposedLabel IS NOT NULL)),
 FOREIGN KEY(jobId,courseId) REFERENCES study_jobs(id,courseId) ON DELETE CASCADE,
 FOREIGN KEY(unitId,courseId) REFERENCES study_units(id,courseId) ON DELETE NO ACTION
);
CREATE UNIQUE INDEX study_observations_unique_concept ON study_observations(jobId,coalesce(conceptKey,proposedLabel));
CREATE INDEX study_observations_page ON study_observations(courseId,createdAt DESC,id);
CREATE INDEX study_observations_concept ON study_observations(courseId,conceptKey);
CREATE INDEX study_observations_unit ON study_observations(unitId,courseId);
CREATE TABLE study_concepts (
 id TEXT PRIMARY KEY NOT NULL, courseId TEXT NOT NULL REFERENCES study_courses(id) ON DELETE CASCADE,
 key TEXT NOT NULL CHECK(length(key) BETWEEN 1 AND 240), label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 240),
 source TEXT NOT NULL CHECK(source IN ('heading','user','promoted')), unitId TEXT,
 userState TEXT NOT NULL DEFAULT 'none' CHECK(userState IN ('none','dismissed')), note TEXT CHECK(length(note)<=240), createdAt TEXT NOT NULL,
 UNIQUE(courseId,key), FOREIGN KEY(unitId,courseId) REFERENCES study_units(id,courseId) ON DELETE NO ACTION
);
CREATE INDEX study_concepts_state ON study_concepts(courseId,userState);
CREATE INDEX study_concepts_unit ON study_concepts(unitId,courseId);
CREATE TABLE study_concept_events (
 id TEXT PRIMARY KEY NOT NULL, conceptId TEXT NOT NULL REFERENCES study_concepts(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('understood','restored')), at TEXT NOT NULL
);
CREATE INDEX study_concept_events_concept ON study_concept_events(conceptId);
CREATE TABLE study_artifacts (
 id TEXT PRIMARY KEY NOT NULL, courseId TEXT NOT NULL REFERENCES study_courses(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('note','test')), title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
 scopeJson TEXT NOT NULL CHECK(json_valid(scopeJson) AND length(CAST(scopeJson AS BLOB))<=8192),
 resolvedScopeJson TEXT NOT NULL CHECK(json_valid(resolvedScopeJson) AND length(CAST(resolvedScopeJson AS BLOB))<=65536),
 status TEXT NOT NULL CHECK(status IN ('generating','ready','failed','interrupted')),
 idempotencyKey TEXT NOT NULL UNIQUE CHECK(length(idempotencyKey) BETWEEN 1 AND 240), attemptToken TEXT NOT NULL,
 bodyMarkdown TEXT CHECK(length(bodyMarkdown)<=262144), testJson TEXT CHECK(json_valid(testJson) AND length(CAST(testJson AS BLOB))<=262144),
 providerId TEXT NOT NULL, modelId TEXT NOT NULL, promptVersion TEXT NOT NULL, errorCode TEXT CHECK(length(errorCode)<=120), createdAt TEXT NOT NULL,
 CHECK((status='ready' AND ((kind='note' AND bodyMarkdown IS NOT NULL AND testJson IS NULL) OR (kind='test' AND testJson IS NOT NULL AND bodyMarkdown IS NULL))) OR
 (status!='ready' AND bodyMarkdown IS NULL AND testJson IS NULL))
);
CREATE INDEX study_artifacts_page ON study_artifacts(courseId,createdAt DESC,id);
CREATE TABLE study_attempts (
 id TEXT PRIMARY KEY NOT NULL, artifactId TEXT NOT NULL REFERENCES study_artifacts(id) ON DELETE CASCADE,
 phase TEXT NOT NULL CHECK(phase IN ('answering','committed','graded','confirmed')),
 answersJson TEXT NOT NULL CHECK(json_valid(answersJson) AND json_type(answersJson)='object' AND length(CAST(answersJson AS BLOB))<=65536),
 startedAt TEXT NOT NULL, committedAt TEXT, confirmedAt TEXT,
 CHECK((phase='answering' AND committedAt IS NULL AND confirmedAt IS NULL) OR
 (phase IN ('committed','graded') AND committedAt IS NOT NULL AND confirmedAt IS NULL) OR
 (phase='confirmed' AND committedAt IS NOT NULL AND confirmedAt IS NOT NULL))
);
CREATE INDEX study_attempts_artifact ON study_attempts(artifactId);
CREATE TABLE study_attempt_items (
 attemptId TEXT NOT NULL REFERENCES study_attempts(id) ON DELETE CASCADE,
 itemId TEXT NOT NULL CHECK(length(itemId) BETWEEN 1 AND 240), conceptKey TEXT NOT NULL CHECK(length(conceptKey) BETWEEN 1 AND 240),
 correct INTEGER CHECK(correct IN (0,1)), selfGrade TEXT CHECK(selfGrade IN ('correct','partial','incorrect')),
 appliedAt TEXT, reportedBad INTEGER NOT NULL DEFAULT 0 CHECK(reportedBad IN (0,1)), PRIMARY KEY(attemptId,itemId)
);
CREATE INDEX study_attempt_items_concept ON study_attempt_items(conceptKey);
`;
