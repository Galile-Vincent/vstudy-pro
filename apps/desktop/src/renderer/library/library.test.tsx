// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import { Snippet, formatSize } from "./index";
import { reorderDestination, selectedRange, visibleFolders, type Item, type Folder } from "./model";
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

it.each(['all','recent','pinned','unfiled','search','folder'])('reorders safely in %s views with an anchor in the destination folder',()=>{
 const items=[{document:{id:'a'},folderId:'x'},{document:{id:'b'},folderId:'y'},{document:{id:'c'},folderId:'z'},{document:{id:'d'},folderId:'y'}] as Item[];
 expect(reorderDestination(items,1,-1)).toEqual({folderId:'x',beforeId:'a'});
 expect(reorderDestination(items,0,1)).toEqual({folderId:'y',beforeId:'d'});
 expect(reorderDestination(items,3,1)).toBeNull();
});

it('uses plural byte units in library metadata', () => {
 expect(formatSize(1,'en')).toBe('1 byte');
 expect(formatSize(800,'en')).toBe('800 bytes');
});
