// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Suggestions } from "./suggestions";

it("exposes pressed state only for toggle suggestions", () => {
  const props = { suggestions: ["One"], cycle: 0, onSuggestion: vi.fn() };
  expect(renderToStaticMarkup(<Suggestions {...props} />)).not.toContain("aria-pressed");
  expect(renderToStaticMarkup(<Suggestions {...props} selectedSuggestion="One" />)).toContain('aria-pressed="true"');
  expect(renderToStaticMarkup(<Suggestions {...props} selectedSuggestion={null} />)).toContain('aria-pressed="false"');
});

it("dispatches distinct action IDs even when labels match, and disables every action", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const onSuggestion = vi.fn();
  const props = {
    suggestions: [{ id: "plan_week", label: "Same translation" }, { id: "summarize_notifications", label: "Same translation" }],
    cycle: 0,
    onSuggestion,
  };
  try {
    await act(async () => root.render(<Suggestions {...props} />));
    await act(async () => host.querySelectorAll("button").forEach(button => button.click()));
    expect(onSuggestion.mock.calls).toEqual([["plan_week"], ["summarize_notifications"]]);
    await act(async () => root.render(<Suggestions {...props} disabled />));
    await act(async () => host.querySelectorAll("button").forEach(button => button.click()));
    expect(onSuggestion).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
