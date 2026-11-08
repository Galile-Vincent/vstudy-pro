import { DatabaseSync } from "node:sqlite";
import { migrations } from "../db/migrations";
import { expect, it } from "vitest";
import { fixture } from "./regression-fixture";
import { gradeAnswer } from "./grade";
import { Attempts } from "./attempts";
import { GenerationService } from "./generate";
import { FakeAdmission } from "./admission-port";
import { validateStudyData } from "../db/study-validation";
import {
  EXAM_COURSE_ID,
  examConfigSchema,
  studyTestItemSchema,
} from "../../shared/review-artifacts";
import { rendererArtifact } from "../../shared/review-generate";
import { validateTest } from "./test-validate";
const common = {
  id: "q1",
  conceptKey: "force",
  stem: "Question",
  explanation: "Force causes acceleration, using the stated relationship.",
  source: {
    documentId: "10000000-0000-4000-8000-000000000001",
    version: "original" as const,
    excerptHash: "a".repeat(64),
    quote: "Force",
  },
};
it.each([
  [{ type: "mcq", options: ["A", "B"], answer: 1 }, 1, true],
  [{ type: "mcq", options: ["A", "B"], answer: 1 }, 0, false],
  [{ type: "true_false", answer: false }, false, true],
  [{ type: "true_false", answer: false }, null, false],
  [
    { type: "cloze", answer: "Force", alternatives: ["push"] },
    " ＰＵＳＨ ",
    true,
  ],
  [{ type: "cloze", answer: "Force", alternatives: [] }, "near force", false],
  [
    { type: "multi_select", options: ["A", "B", "C"], answer: [0, 2] },
    [2, 0],
    true,
  ],
  [
    { type: "multi_select", options: ["A", "B", "C"], answer: [0, 2] },
    [0],
    false,
  ],
  [
    { type: "multi_select", options: ["A", "B", "C"], answer: [0, 2] },
    [0, 0],
    false,
  ],
  [
    { type: "calculation", answer: 2, tolerance: 0.01, unit: "m" },
    "2.01 m",
    true,
  ],
  [{ type: "calculation", answer: 2, tolerance: 0.01, unit: "m" }, "2e0", true],
  [{ type: "calculation", answer: 1e-12, tolerance: 1e-18, unit: "C" }, "1.0001e-12 C", false],
  [{ type: "calculation", answer: 1e-12, tolerance: 1e-18, unit: "C" }, "1e-12 C", true],
  [
    { type: "calculation", answer: 2, tolerance: 0.01, unit: "m" },
    "2 cm",
    false,
  ],
  [
    { type: "calculation", answer: 2, tolerance: 0.01, unit: "m" },
    "2.02 m",
    false,
  ],
  [{ type: "calculation", answer: 2, tolerance: 0, unit: "" }, "2+0", false],
  [
    { type: "calculation", answer: 2, tolerance: 0, unit: "" },
    "Infinity",
    false,
  ],
] as const)("grades deterministically: %j / %j", (spec, answer, correct) =>
  expect(
    gradeAnswer(studyTestItemSchema.parse({ ...common, ...spec }), answer),
  ).toBe(correct),
);
it("rejects invalid generation configuration and malformed keys", () => {
  expect(
    examConfigSchema.safeParse({
      prompt: "",
      difficulty: "medium",
      counts: {
        mcq: 0,
        multi_select: 0,
        calculation: 0,
        cloze: 0,
        true_false: 0,
      },
    }).success,
  ).toBe(false);
  expect(
    studyTestItemSchema.safeParse({
      ...common,
      type: "calculation",
      answer: 2,
      tolerance: -1,
      unit: "m",
    }).success,
  ).toBe(false);
  const item = {
    ...common,
    type: "multi_select",
    options: ["A", "B"],
    answer: [2],
  };
  expect(
    validateTest({ version: 1, items: [item] }, [
      { ...common.source, text: "Force" },
    ]).items,
  ).toEqual([]);
});
it("generates from independent library documents, keeps keys private, persists history, restores and excludes mastery", async () => {
  const f = fixture(),
    admission = new FakeAdmission();
  const exam = examConfigSchema.parse({
    prompt: "Focus on force",
    difficulty: "hard",
    counts: {
      mcq: 0,
      multi_select: 1,
      calculation: 1,
      cloze: 1,
      true_false: 1,
    },
  });
  const request = { ...f.request, courseId: EXAM_COURSE_ID, exam };
  const service = new GenerationService(f.a, {
    admission,
    estimate: () => ({ inputTokens: 1, outputTokens: 1, costUsd: 1 }),
    readExcerpt: async () => ({
      ...f.source,
      text: "Force causes acceleration.",
    }),
    call: async (prompt) => {
      if (!prompt.includes("Focus on force"))
        return "A detailed explanation of the force relationship.";
      expect(prompt).toContain("Focus on force");
      const data = JSON.parse(
        prompt
          .split("<UNTRUSTED_REVIEW_DATA>\n")[1]!
          .split("\n</UNTRUSTED_REVIEW_DATA>")[0]!,
      );
      return JSON.stringify({
        version: 1,
        items: data.blueprint.map((slot: { type: string; id: string }) => ({
          ...common,
          ...slot,
          stem: `Question ${slot.id}`,
          source: { ...f.source, quote: "Force" },
          ...(slot.type === "multi_select"
            ? { options: ["A", "B", "C"], answer: [0, 2] }
            : slot.type === "calculation"
              ? { answer: 2, tolerance: 0.01, unit: "m" }
              : slot.type === "cloze"
                ? { answer: "force", alternatives: ["push"] }
                : { answer: true }),
        })),
      });
    },
  });
  try {
    const artifact = service.generate(request);
    await service.waitForIdle();
    const ready = f.a.find(artifact.id)!;
    expect(ready.status).toBe("ready");
    expect(ready.test?.items).toHaveLength(4);
    expect(JSON.stringify(rendererArtifact(ready))).not.toContain(
      "explanation",
    );
    const engine = new Attempts(f.a);
    let attempt = engine.start(ready.id);
    expect(attempt.results.every((r) => !r.feedback)).toBe(true);
    for (const item of ready.test!.items)
      engine.answer(
        attempt.id,
        item.id,
        item.type === "multi_select"
          ? [2, 0]
          : item.type === "calculation"
            ? "2 m"
            : item.type === "cloze"
              ? "push"
              : true,
      );
    attempt = engine.commit(attempt.id);
    expect(attempt.results.every((r) => r.correct)).toBe(true);
    expect(engine.start(ready.id).id).toBe(attempt.id);
    expect(() => engine.confirm(attempt.id)).toThrow("exam_no_mastery");
    expect(() => validateStudyData(f.store.db)).not.toThrow();
    expect(
      f.a.list({ courseId: EXAM_COURSE_ID }).items[0]?.resolvedScope.exam,
    ).toEqual(exam);
    expect(admission.pending.size).toBe(0);
    const reply = await service.explain(attempt.id, "q1", "en");
    expect(reply.text).toBeTruthy();
  } finally {
    await service.dispose();
    f.store.close();
  }
});
it("forward migration preserves populated prior stores", () => {
  const f = fixture();
  try {
    expect(
      f.store.db
        .prepare("SELECT title FROM study_courses WHERE id=?")
        .get(f.c.id)?.title,
    ).toBe("Physics");
    expect(f.store.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(
      f.store.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='study_exam_history'",
        )
        .get(),
    ).toBeTruthy();
  } finally {
    f.store.close();
  }
});

it("upgrades a populated v25 database without rewriting applied migrations", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const m of migrations.filter((m) => m.version <= 25)) db.exec(m.sql);
    db.prepare(
      "INSERT INTO study_courses(id,title,createdAt) VALUES(?,'Prior course',?)",
    ).run(EXAM_COURSE_ID, "2026-11-08T00:00:00Z");
    db.exec(migrations.find((m) => m.version === 26)!.sql);
    expect(
      db
        .prepare("SELECT title FROM study_courses WHERE id=?")
        .get(EXAM_COURSE_ID)?.title,
    ).toBe("Prior course");
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    db.close();
  }
});
