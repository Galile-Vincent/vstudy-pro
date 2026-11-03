// @vitest-environment jsdom
import { act, createElement, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DocumentMarkdown } from "../../renderer/markdown";
import type { Document } from "../../shared/domain";

const timings = vi.hoisted(() => ({ offsets: 0 }));
vi.mock("../../renderer/selection", async original => {
  const actual = await original<typeof import("../../renderer/selection")>();
  return { ...actual, sourceOffsets: () => {
    const transform = actual.sourceOffsets();
    return (...args: Parameters<typeof transform>) => {
      const start = performance.now();
      try { return transform(...args); } finally { timings.offsets += performance.now()-start; }
    };
  } };
});
it("profiles the real Markdown pipeline and stamps offsets on 50k+ characters", async () => {
  const source = Array.from({length: 600}, (_, n) => `## Heading ${n}\n\nParagraph **bold** with a [link](https://example.com), words for selection offsets and $x=2$.\n\n`).join("");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let renderMs = 0;
  const start = performance.now();
  try {
    await act(async () => root.render(createElement(Profiler, { id: "converter-markdown", onRender: (_id, _phase, duration) => { renderMs += duration; } },
      createElement(DocumentMarkdown, {source, documentId: "profile" as Document["id"], onSelect: () => undefined, onNotice: () => undefined}))));
    expect(source.length).toBeGreaterThan(50000);
    expect(container.querySelectorAll("[data-start]").length).toBeGreaterThan(1000);
    console.log(JSON.stringify({markdownChars: source.length, reactPipelineMs: renderMs, selectionOffsetMs: timings.offsets, renderAndCommitMs: performance.now()-start}));
  } finally { await act(async () => root.unmount()); container.remove(); }
});
