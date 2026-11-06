// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { COURSE_VIEW_STORAGE_KEY, loadCourseViewMode, parseCourseViewMode, saveCourseViewMode } from "./view-mode";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("course view mode", () => {
  it.each([
    ["list", "list"],
    ["cards", "cards"],
    ["grid", "list"],
    ["", "list"],
    [null, "list"],
    [42, "list"],
  ])("parses %j as %s", (raw, expected) => {
    expect(parseCourseViewMode(raw)).toBe(expected);
  });

  it("round-trips a saved choice and defaults to list", () => {
    expect(loadCourseViewMode()).toBe("list");
    saveCourseViewMode("cards");
    expect(localStorage.getItem(COURSE_VIEW_STORAGE_KEY)).toBe("cards");
    expect(loadCourseViewMode()).toBe("cards");
  });

  it("falls back to list and keeps working when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadCourseViewMode()).toBe("list");
    expect(() => saveCourseViewMode("cards")).not.toThrow();
  });
});
