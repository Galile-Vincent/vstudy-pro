import { randomUUID } from 'node:crypto';
import { attemptSchema } from '../../shared/review-generate';
import { isStudyAnswer, studyAnswersSchema, studyTestSchema } from '../../shared/review-artifacts';
import { ArtifactRepository } from './artifact-repository';
import { gradeAnswer } from './grade';
import { EXAM_COURSE_ID } from '../../shared/review-artifacts';
import { stemHash } from './test-validate';
export class Attempts {
    constructor(private readonly repo: ArtifactRepository) { }
    get(id: string) { const row = this.repo.db.prepare('SELECT * FROM study_attempts WHERE id=?').get(id); if (!row)
        throw new Error('review.attempt_unavailable'); const results = this.repo.db.prepare('SELECT itemId,conceptKey,correct,reportedBad FROM study_attempt_items WHERE attemptId=? ORDER BY itemId').all(id); const test = this.repo.find(String(row.artifactId))?.test; const { answersJson, ...rest } = row; const drafts = Object.fromEntries(this.repo.db.prepare('SELECT itemId,draftJson FROM study_attempt_drafts WHERE attemptId=? ORDER BY itemId').all(id).map(d => [String(d.itemId), JSON.parse(String(d.draftJson))])); return attemptSchema.parse({ ...rest, answers: JSON.parse(String(answersJson)), drafts, results: results.map(r => ({ ...r, correct: r.correct === null ? null : r.correct === 1, reportedBad: r.reportedBad === 1, ...(r.correct !== null ? {feedback:test?.items.find(item=>item.id===r.itemId)} : {}) })) }); }
    start(artifactId: string) { const artifact = this.repo.find(artifactId); if (artifact?.status !== 'ready' || !artifact.test)
        throw new Error('review.test_unavailable'); return this.repo.atomic(() => { const existing=this.repo.db.prepare("SELECT id FROM study_attempts WHERE artifactId=? ORDER BY startedAt DESC,id DESC LIMIT 1").get(artifactId); if(existing) return this.get(String(existing.id)); const id = randomUUID(); this.repo.db.prepare("INSERT INTO study_attempts(id,artifactId,phase,answersJson,startedAt) VALUES(?,?,'answering','{}',?)").run(id, artifactId, new Date(this.repo.clock()).toISOString()); for (const item of artifact.test!.items)
        this.repo.db.prepare('INSERT INTO study_attempt_items(attemptId,itemId,conceptKey,reportedBad) VALUES(?,?,?,0)').run(id, item.id, item.conceptKey); return this.get(id); }); }
    answer(id: string, itemId: string, answer: string | number | boolean | number[] | null) { const attempt = this.get(id); if (attempt.phase !== 'answering')
        throw new Error('review.answers_locked'); if (attempt.results.some(i=>i.itemId===itemId && i.correct!==null)) throw new Error('review.answers_locked'); if (!attempt.results.some(i => i.itemId === itemId))
        throw new Error('review.item_unavailable');
        const item = this.repo.find(attempt.artifactId)?.test?.items.find(item => item.id === itemId);
        if (!item || !isStudyAnswer(item, answer)) throw new Error('review.invalid_answer');
        const answers = studyAnswersSchema.parse({ ...attempt.answers, [itemId]: answer }); return this.repo.atomic(() => { this.repo.db.prepare("UPDATE study_attempts SET answersJson=? WHERE id=? AND phase='answering'").run(JSON.stringify(answers), id); this.repo.db.prepare('DELETE FROM study_attempt_drafts WHERE attemptId=? AND itemId=?').run(id, itemId); return this.get(id); }); }
    saveDraft(id: string, itemId: string, answer: string | number | boolean | number[] | null) {
        const attempt = this.get(id);
        const result = attempt.results.find(i => i.itemId === itemId);
        if (!result) throw new Error('review.item_unavailable');
        if (attempt.phase !== 'answering' || result.correct !== null) return attempt;
        const item = this.repo.find(attempt.artifactId)?.test?.items.find(item => item.id === itemId);
        if (!item || answer !== null && !isStudyAnswer(item, answer)) throw new Error('review.invalid_answer');
        if (answer === null) this.repo.db.prepare('DELETE FROM study_attempt_drafts WHERE attemptId=? AND itemId=?').run(id, itemId);
        else this.repo.db.prepare('INSERT INTO study_attempt_drafts(attemptId,itemId,draftJson,updatedAt) VALUES(?,?,?,?) ON CONFLICT(attemptId,itemId) DO UPDATE SET draftJson=excluded.draftJson,updatedAt=excluded.updatedAt').run(id, itemId, JSON.stringify(answer), new Date(this.repo.clock()).toISOString());
        return this.get(id);
    }
    commit(id: string, itemId?: string) {
        return this.repo.atomic(() => {
            const attempt = this.get(id);
            if (itemId && !attempt.results.some(item => item.itemId === itemId))
                throw new Error('review.item_unavailable');
            if (attempt.phase === 'graded' || attempt.phase === 'confirmed') return attempt;
            const test = studyTestSchema.parse(this.repo.find(attempt.artifactId)?.test);
            for (const item of test.items) {
                if (itemId && item.id !== itemId || attempt.results.find(r=>r.itemId===item.id)?.correct !== null) continue;
                const answer = attempt.answers[item.id];
                const correct = gradeAnswer(item, answer);
                this.repo.db.prepare('UPDATE study_attempt_items SET correct=? WHERE attemptId=? AND itemId=? AND correct IS NULL').run(Number(correct), id, item.id);
            }
            this.repo.db.prepare('DELETE FROM study_attempt_drafts WHERE attemptId=? AND itemId IN (SELECT itemId FROM study_attempt_items WHERE attemptId=? AND correct IS NOT NULL)').run(id, id);
            if (!this.get(id).results.some(item => item.correct === null))
                this.repo.db.prepare("UPDATE study_attempts SET phase='graded',committedAt=? WHERE id=? AND phase IN ('answering','committed')").run(new Date(this.repo.clock()).toISOString(), id);
            return this.get(id);
        });
    }
    confirm(id: string) { return this.repo.atomic(() => { const attempt = this.get(id); if (attempt.phase === 'confirmed')
        return attempt; if (attempt.phase !== 'graded')
        throw new Error('review.not_graded'); if(this.repo.find(attempt.artifactId)?.courseId===EXAM_COURSE_ID) throw new Error('review.exam_no_mastery'); const at = new Date(this.repo.clock()).toISOString(); this.repo.db.prepare('UPDATE study_attempt_items SET appliedAt=? WHERE attemptId=? AND reportedBad=0 AND appliedAt IS NULL').run(at, id); this.repo.db.prepare("UPDATE study_attempts SET phase='confirmed',confirmedAt=? WHERE id=? AND phase='graded'").run(at, id); return this.get(id); }); }
    reportBad(id: string, itemId: string) { this.get(id); const change = this.repo.db.prepare('UPDATE study_attempt_items SET reportedBad=1,appliedAt=NULL WHERE attemptId=? AND itemId=?').run(id, itemId); if (!change.changes)
        throw new Error('review.item_unavailable'); return this.get(id); }
    retake(id: string) { const attempt = this.get(id); if (attempt.phase !== 'confirmed')
        throw new Error('review.not_confirmed'); const test = this.repo.find(attempt.artifactId)?.test; if (!test)
        throw new Error('review.test_unavailable'); return { conceptKeys: [...new Set(attempt.results.filter(i => i.correct === false && !i.reportedBad).map(i => i.conceptKey))], excludedStems: [...new Set([...(test.excludedStemHashes ?? []), ...test.items.map(i => stemHash(i.stem))])] }; }
}
