// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ExamsView } from "./index";
import { EXAM_COURSE_ID } from "../../shared/review-artifacts";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../bridge", () => ({ desktop: { invoke } }));
vi.mock("../../shared/i18n", () => ({ tr: (key: string) => key }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const artifact = {
  id: "exam",
  courseId: EXAM_COURSE_ID,
  title: "Practice",
  status: "ready",
  createdAt: "2026-11-08T00:00:00Z",
  resolvedScope: { documentIds: ["doc"] },
  test: {
    version: 1,
    items: [
      {
        id: "q1",
        conceptKey: "doc",
        type: "multi_select",
        stem: "Pick two",
        options: ["First", "Second", "Third"],
      },
    ],
  },
};
function setup(saved = false) {
  const feedback = {
    ...artifact.test.items[0],
    source: { documentId: "doc", version: "original", quote: "Source text" },
    answer: [0, 2],
    explanation: "First and third follow from the source.",
  };
  const attempt = {
    id: "attempt",
    artifactId: "exam",
    phase: saved ? "graded" : "answering",
    answers: {},
    startedAt: "2026-11-08T00:00:00Z",
    committedAt: saved ? "2026-11-08T00:02:00Z" : null,
    results: [
      {
        itemId: "q1",
        conceptKey: "doc",
        correct: saved ? true : null,
        reportedBad: false,
        ...(saved ? { feedback } : {}),
      },
    ],
  };
  invoke.mockImplementation(async (channel: string) => {
    if (channel === "documents:list")
      return [{ id: "doc", title: "Physics PDF", status: "ready" }];
    if (channel === "providers:list")
      return [
        {
          config: { id: "openai-api", enabled: true },
          availability: { available: true },
          models: [{ id: "model", name: "Model" }],
        },
      ];
    if (channel === "review:exam:history")
      return {
        items: saved
          ? [
              {
                artifact,
                attempt: {
                  ...attempt,
                  results: [
                    { itemId: "q1", correct: true, type: "multi_select" },
                  ],
                },
              },
            ]
          : [],
        nextCursor: null,
      };
    if (
      channel === "review:artifact:generate" ||
      channel === "review:artifact:get"
    )
      return artifact;
    if (channel === "review:attempt:explain")
      return { text: "AI follow-up reasoning" };
    if (channel === "review:attempt:commit")
      return {
        ...attempt,
        phase: "graded",
        results: [{ ...attempt.results[0], correct: true, feedback }],
      };
    return attempt;
  });
}
it("requires a document and sends per-type counts, custom prompt and language", async () => {
  setup();
  render(<ExamsView />);
  await screen.findByText("Physics PDF");
  const generate = screen.getByRole("button", { name: "exams:generate" });
  expect(generate.hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByLabelText("Physics PDF"));
  fireEvent.change(screen.getByLabelText("exams:prompt"), {
    target: { value: "Focus on motion" },
  });
  fireEvent.change(screen.getByLabelText("exams:calculation"), {
    target: { value: "4" },
  });
  fireEvent.change(screen.getByLabelText("exams:language"), {
    target: { value: "ja" },
  });
  fireEvent.click(generate);
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith(
      "review:artifact:generate",
      expect.objectContaining({
        courseId: EXAM_COURSE_ID,
        scope: { kind: "documents", documentIds: ["doc"] },
        locale: "ja",
        exam: expect.objectContaining({
          prompt: "Focus on motion",
          counts: expect.objectContaining({ calculation: 4 }),
        }),
      }),
    ),
  );
  expect(await screen.findByText("Pick two")).toBeTruthy();
  expect(
    screen.queryByText("First and third follow from the source."),
  ).toBeNull();
  fireEvent.click(screen.getByLabelText("First"));
  fireEvent.click(screen.getByLabelText("Third"));
  fireEvent.click(screen.getByRole("button", { name: "review:finish_test" }));
  expect(
    await screen.findByText("First and third follow from the source."),
  ).toBeTruthy();
  expect(invoke).toHaveBeenCalledWith(
    "review:attempt:answer",
    expect.objectContaining({ answer: [0, 2] }),
  );
  fireEvent.click(screen.getByRole("button", { name: "exams:ask_ai" }));
  expect(await screen.findByText("AI follow-up reasoning")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "review:view_results" }));
  expect(await screen.findByText("review:results_title")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "review:update_review_list" }),
  ).toBeNull();
});
it("reopens saved results with source documents, score, duration and per-type accuracy", async () => {
  setup(true);
  render(<ExamsView />);
  fireEvent.click(await screen.findByRole("button", { name: /Practice ·/ }));
  expect(await screen.findByText("review:results_title")).toBeTruthy();
  expect(screen.getAllByText(/exams:score/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/exams:duration/).length).toBeGreaterThan(0);
  fireEvent.click(
    screen.getByRole("button", { name: "review:review_answers" }),
  );
  expect(
    await screen.findByText("First and third follow from the source."),
  ).toBeTruthy();
});
