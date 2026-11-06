import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { openStore } from '../db';
import { ReviewRepository } from './repository';
import { ArtifactRepository } from './artifact-repository';

/** Eligible exchanges with `perJob` observations each, spread by `at(index)`. */
export function seedObservations(db: DatabaseSync, courseId: string, options: { count: number; perJob?: number; unitId?: string | null; concept: (index: number) => string; at: (index: number) => string; confidence?: number }): void {
    const chat = randomUUID(), perJob = options.perJob ?? 5;
    db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt) VALUES(?,'general','p','m','2030-01-01T00:00:00.000Z')").run(chat);
    new ReviewRepository(db).assignChat(chat, courseId);
    db.exec('BEGIN');
    try {
        for (let first = 0; first < options.count; first += perJob) {
            const job = randomUUID(), user = randomUUID(), assistant = randomUUID(), at = options.at(first);
            for (const [id, role] of [[user, 'user'], [assistant, 'assistant']] as const)
                db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES(?,?,?,?,?)').run(id, chat, role, JSON.stringify([{ type: 'text', text: 'Answer', status: 'complete' }]), at);
            db.prepare("INSERT INTO study_jobs(id,conversationId,userMessageId,assistantMessageId,extractorVersion,courseId,assignmentRevision,status,occurredAt,createdAt,updatedAt) VALUES(?,?,?,?,'v1',?,1,'succeeded',?,?,?)").run(job, chat, user, assistant, courseId, at, at, at);
            for (let i = first; i < Math.min(first + perJob, options.count); i++)
                db.prepare("INSERT INTO study_observations(id,jobId,courseId,unitId,conceptKey,errorType,signal,evidenceQuote,confidence,createdAt) VALUES(?,?,?,?,?,'misconception','wrong','my answer',?,?)").run(randomUUID(), job, courseId, options.unitId ?? null, options.concept(i), options.confidence ?? 1, at);
        }
        db.exec('COMMIT');
    }
    catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}
export function course(cleanup: (() => void | Promise<void>)[]) {
    const store = openStore(':memory:');
    cleanup.push(() => store.close());
    const foundation = new ReviewRepository(store.db);
    const created = foundation.createCourse({ title: 'Physics' });
    return { store, foundation, courseId: created.id, repo: new ArtifactRepository(store.db) };
}
