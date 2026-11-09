import { expect, it } from 'vitest';
import { fixture } from './regression-fixture';
import { Attempts } from './attempts';
import { validateStudyData } from '../db/study-validation';

function setup() {
 const f = fixture();
 const art = f.a.create(f.request, f.snapshot, 'token');
 const common = { conceptKey: 'force', explanation: 'Explanation', source: { ...f.source, quote: 'Force' } };
 const items = [
  { ...common, id: 'q1', type: 'mcq' as const, stem: 'One', options: ['A', 'B'], answer: 1 },
  { ...common, id: 'q2', type: 'cloze' as const, stem: 'Two', answer: 'Force', alternatives: [] },
 ];
 f.a.finish(art.id, 'token', { test: { version: 1, items } });
 const engine = new Attempts(f.a);
 return { f, engine, attempt: engine.start(art.id) };
}

it('keeps drafts apart from answers and never grades from them', () => {
 const { f, engine, attempt } = setup();
 try {
  expect(attempt.drafts).toEqual({});
  const saved = engine.saveDraft(attempt.id, 'q1', 1, 1);
  expect(saved.drafts).toEqual({ q1: 1 });
  expect(saved.answers).toEqual({});
  expect(engine.get(attempt.id).drafts).toEqual({ q1: 1 });
  expect(engine.commit(attempt.id, 'q1').results[0]!.correct).toBe(false);
  expect(engine.get(attempt.id).drafts).toEqual({});
  expect(() => validateStudyData(f.store.db)).not.toThrow();
 } finally { f.store.close(); }
});

it('replaces, clears and discards drafts when an answer is saved', () => {
 const { f, engine, attempt } = setup();
 try {
  engine.saveDraft(attempt.id, 'q2', 'For', 2);
  expect(engine.saveDraft(attempt.id, 'q2', 'Force', 3).drafts).toEqual({ q2: 'Force' });
  expect(engine.saveDraft(attempt.id, 'q2', null, 4).drafts).toEqual({});
  engine.saveDraft(attempt.id, 'q2', 'Force', 5);
  const answered = engine.answer(attempt.id, 'q2', 'Force');
  expect(answered.drafts).toEqual({});
  expect(answered.answers).toEqual({ q2: 'Force' });
 } finally { f.store.close(); }
});

it('rejects invalid drafts and ignores drafts for committed questions', () => {
 const { f, engine, attempt } = setup();
 try {
  expect(() => engine.saveDraft(attempt.id, 'q1', 5, 6)).toThrow('review.invalid_answer');
  expect(() => engine.saveDraft(attempt.id, 'missing', 1, 7)).toThrow('review.item_unavailable');
  engine.answer(attempt.id, 'q1', 1);
  engine.commit(attempt.id, 'q1');
  expect(engine.saveDraft(attempt.id, 'q1', 0, 8).drafts).toEqual({});
  expect(engine.get(attempt.id).answers).toEqual({ q1: 1 });
 } finally { f.store.close(); }
});

it('fails backup validation for a draft that does not fit its question', () => {
 const { f, engine, attempt } = setup();
 try {
  engine.saveDraft(attempt.id, 'q1', 1, 9);
  f.store.db.prepare("UPDATE study_attempt_drafts SET draftJson='\"text\"'").run();
  expect(() => validateStudyData(f.store.db)).toThrow('storage.invalid_backup');
 } finally { f.store.close(); }
});

it('ignores a draft write that is older than the stored one', () => {
 const { f, engine, attempt } = setup();
 try {
  engine.saveDraft(attempt.id, 'q1', 1, 7);
  expect(engine.saveDraft(attempt.id, 'q1', 0, 6).drafts).toEqual({ q1: 1 });
  expect(engine.saveDraft(attempt.id, 'q1', null, 3).drafts).toEqual({ q1: 1 });
  expect(engine.saveDraft(attempt.id, 'q1', 1, 7).drafts).toEqual({ q1: 1 });
  const newer = engine.saveDraft(attempt.id, 'q1', 0, 8);
  expect(newer.drafts).toEqual({ q1: 0 });
  expect(newer.draftSeqs).toEqual({ q1: 8 });
  expect(engine.saveDraft(attempt.id, 'q2', 'Force', 1).drafts).toEqual({ q1: 0, q2: 'Force' });
 } finally { f.store.close(); }
});

it('removes drafts with their attempt', () => {
 const { f, engine, attempt } = setup();
 try {
  engine.saveDraft(attempt.id, 'q1', 1, 10);
  f.store.db.prepare('DELETE FROM study_attempts WHERE id=?').run(attempt.id);
  expect(f.store.db.prepare('SELECT COUNT(*) AS n FROM study_attempt_drafts').get()?.n).toBe(0);
 } finally { f.store.close(); }
});
