import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  chatRequestSchema, settingsSchema,
  documentSchema,
  documentTransitions,
  selectionSchema,
  transitionDocument,
} from "./domain";
const document = documentSchema.parse({
  id: randomUUID(),
  title: "Study",
  sourceName: "study.pdf",
  sourceHash: "a".repeat(64),
  sourcePath: "/library/source.pdf",
  markdownPath: "/library/content.md",
  mime: "application/pdf",
  status: "converting",
  createdAt: new Date().toISOString(),
});
describe("document lifecycle", () => {
  it("allows only the transition table, including failed retries", () => {
    for (const from of ["converting", "ready", "failed"] as const) {
      const current = documentSchema.parse({
        ...document,
        status: from,
        ...(from === "failed" ? { error: "conversion failed" } : {}),
      });
      for (const to of ["converting", "ready", "failed"] as const) {
        const run = () =>
          transitionDocument(
            current,
            to === "failed" ? { status: to, error: "failure" } : { status: to },
          );
        if (documentTransitions[from].includes(to))
          expect(run().status).toBe(to);
        else expect(run).toThrow("Invalid document transition");
      }
    }
    const failed = transitionDocument(document, {
      status: "failed",
      error: "failure",
    });
    expect(
      transitionDocument(failed, { status: "converting" }),
    ).not.toHaveProperty("error");
  });
  it("rejects failed documents without errors and invalid selections", () => {
    expect(
      documentSchema.safeParse({ ...document, status: "failed" }).success,
    ).toBe(false);
    expect(
      selectionSchema.safeParse({
        documentId: document.id,
        startOffset: 10,
        endOffset: 2,
        text: "",
        headingPath: [],
      }).success,
    ).toBe(false);
    expect(
      chatRequestSchema.safeParse({
        requestId: randomUUID(),
        conversationId: randomUUID(),
        documentId: document.id,
        providerId: "openai-api",
        modelId: "test",
        userMessage: "hello",
        selection: {
          documentId: randomUUID(),
          startOffset: 0,
          endOffset: 1,
          text: "x",
          headingPath: [],
        },
      }).success,
    ).toBe(false);
  });
});

it("loads preexisting settings with a default last document", () => {
  expect(settingsSchema.parse({ chatSide: "left", lastProviderId: "claude-cli", lastModelId: "haiku" })).toEqual({ uiScale:100,density:"comfortable",accent:"neutral",readerFont:"system",readerSize:"m",material:"glass",welcomeSeen: false, language:"auto", replyLanguage:"auto", chatSide: "left", lastProviderId: "claude-cli", lastModelId: "haiku", lastDocumentId: null, warnAtPercent: 80, priceOverrides: {}, converterIdleMinutes:5,converterOffline:false,enableGenerativeUI:false, modelDisplayNames:{} });
});
