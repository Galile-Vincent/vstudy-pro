// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import { Snippet } from "./index";
import { selectedRange, visibleFolders, type Item, type Folder } from "./model";
vi.mock("../bridge", () => ({ desktop: { invoke: vi.fn() } }));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
describe("library interaction rules", () => {
  it("selects a contiguous range in either direction", () => {
    const items = ["a", "b", "c", "d"].map((id) => ({
      document: { id },
    })) as Item[];
    expect(selectedRange(items, "d", "b")).toEqual(["b", "c", "d"]);
    expect(selectedRange(items, "missing", "c")).toEqual(["c"]);
  });
  it("keeps descendants hidden until their parent is expanded", () => {
    const folders = [
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
    ] as Folder[];
    expect(visibleFolders(folders, []).map((n) => n.folder.id)).toEqual(["a"]);
    expect(visibleFolders(folders, ["a", "b"]).map((n) => n.level)).toEqual([
      1, 2, 3,
    ]);
  });
  it("highlights FTS markers while preserving hostile content as text", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <Snippet
          text={"<img src=x onerror=alert(1)> [mark]資料[/mark] 通信"}
        />,
      ),
    );
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("mark")?.textContent).toBe("資料");
    expect(host.textContent).toContain("通信");
    await act(async () => root.unmount());
  });
});
