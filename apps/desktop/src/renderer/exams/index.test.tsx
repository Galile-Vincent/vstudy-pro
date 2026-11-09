// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
  fireEvent.click(screen.getByRole("checkbox", { name: /First/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Third/ }));
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
  expect(await screen.findByText("exams:results")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "review:update_review_list" }),
  ).toBeNull();
});
it("reopens saved results with source documents, score, duration and per-type accuracy", async () => {
  setup(true);
  render(<ExamsView />);
  fireEvent.click(screen.getByRole("button", { name: "exams:history" }));
  fireEvent.click(await screen.findByRole("button", { name: "Practice" }));
  expect(await screen.findByText("exams:results")).toBeTruthy();
  expect(screen.getAllByText(/exams:score_summary/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/exams:duration/).length).toBeGreaterThan(0);
  fireEvent.click(
    screen.getByRole("button", { name: "review:review_answers" }),
  );
  expect(
    await screen.findByText("First and third follow from the source."),
  ).toBeTruthy();
});

it("shows answer comparisons, explanations and an AI action on the results page", async () => {
  setup(true);
  render(<ExamsView />);
  fireEvent.click(screen.getByRole("button", { name: "exams:history" }));
  fireEvent.click(await screen.findByRole("button", { name: "Practice" }));
  expect(await screen.findByText("exams:results")).toBeTruthy();
  expect(screen.getByText("100")).toBeTruthy();
  expect(screen.getByText("exams:correct")).toBeTruthy();
  expect(screen.getByText("review:your_answer")).toBeTruthy();
  expect(screen.getByText("review:correct_answer")).toBeTruthy();
  expect(screen.getByText("First · Third")).toBeTruthy();
  expect(
    screen
      .getByRole("progressbar", { name: "exams:multi_select" })
      .getAttribute("aria-valuenow"),
  ).toBe("100");
  fireEvent.click(screen.getByRole("button", { name: "exams:ask_ai" }));
  expect(await screen.findByText("AI follow-up reasoning")).toBeTruthy();
});
it("confirms deletion and calls the existing artifact deletion channel", async () => {
  setup(true);
  render(<ExamsView />);
  fireEvent.click(screen.getByRole("button", { name: "exams:history" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "exams:delete_named" }),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(invoke).not.toHaveBeenCalledWith(
    "review:artifact:delete",
    expect.anything(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "review:delete_confirm" }),
  );
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("review:artifact:delete", {
      artifactId: "exam",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it.each(["calculation", "cloze"])(
  "supports a clear %s text input without revealing the key",
  async (type) => {
    setup();
    const base = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
      if (
        channel === "review:artifact:generate" ||
        channel === "review:artifact:get"
      )
        return {
          ...artifact,
          test: {
            version: 1,
            items: [
              {
                id: "q1",
                conceptKey: "doc",
                type,
                stem: "Compute the answer",
                ...(type === "calculation" ? { unit: "m" } : {}),
              },
            ],
          },
        };
      return base(channel, ...args);
    });
    render(<ExamsView />);
    fireEvent.click(await screen.findByLabelText("Physics PDF"));
    fireEvent.click(screen.getByRole("button", { name: "exams:generate" }));
    await screen.findByText("Compute the answer");
    const input = await screen.findByRole("textbox");
    expect(input.getAttribute("inputmode")).toBe(
      type === "calculation" ? "decimal" : "text",
    );
    expect(screen.queryByText("exams:explanation")).toBeNull();
    fireEvent.change(input, {
      target: { value: type === "calculation" ? "2.5" : "force" },
    });
    fireEvent.click(screen.getByRole("button", { name: "review:finish_test" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "review:attempt:answer",
        expect.objectContaining({
          answer: type === "calculation" ? "2.5" : "force",
        }),
      ),
    );
  },
);
it("shows an incorrect answer beside the expected answer on results", async () => {
  setup(true);
  const base = invoke.getMockImplementation()!;
  invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
    const value = await base(channel, ...args);
    if (channel === "review:attempt:start" || channel === "review:attempt:get")
      return {
        ...value,
        answers: { q1: [1] },
        results: value.results.map((r: Record<string, unknown>) => ({
          ...r,
          correct: false,
        })),
      };
    return value;
  });
  render(<ExamsView />);
  fireEvent.click(screen.getByRole("button", { name: "exams:history" }));
  fireEvent.click(await screen.findByRole("button", { name: "Practice" }));
  expect(await screen.findByText("exams:incorrect")).toBeTruthy();
  expect(screen.getByText("Second")).toBeTruthy();
  expect(screen.getByText("First · Third")).toBeTruthy();
  expect(screen.getByText("0")).toBeTruthy();
});

it("keeps a failed deletion recoverable inside the dialog", async () => {
  setup(true);
  const base = invoke.getMockImplementation()!;
  invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
    if (channel === "review:artifact:delete") throw new Error("Storage busy");
    return base(channel, ...args);
  });
  render(<ExamsView />);
  fireEvent.click(screen.getByRole("button", { name: "exams:history" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "exams:delete_named" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "review:delete_confirm" }),
  );
  expect(
    await within(screen.getByRole("dialog")).findByRole("alert"),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "review:cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "exams:delete_named" }));
  expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull();
});

it("guides to the Library and hides configuration until a document is ready", async () => {
  setup();
  const base = invoke.getMockImplementation()!;
  invoke.mockImplementation(async (channel: string, ...args: unknown[]) =>
    channel === "documents:list"
      ? [{ id: "doc", title: "Physics PDF", status: "converting" }]
      : base(channel, ...args),
  );
  const onOpenLibrary = vi.fn();
  render(<ExamsView onOpenLibrary={onOpenLibrary} />);
  expect(
    (await screen.findByRole("heading", { level: 2 })).textContent,
  ).toBe("exams:empty_title");
  expect(screen.queryByLabelText("exams:prompt")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "common:library" }));
  expect(onOpenLibrary).toHaveBeenCalledTimes(1);
});
