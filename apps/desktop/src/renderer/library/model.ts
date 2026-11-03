import type { IpcResponse } from "../../shared/ipc";
import { desktop } from "../bridge";
export type Folder = IpcResponse<"library:tree">[number];
export type Item = IpcResponse<"library:documents:list">["items"][number];
export const changed = () => window.dispatchEvent(new Event("library-changed"));
export async function importFiles(
  folderId: Folder["id"] | null,
  files?: File[],
) {
  if (files) {
    const paths = files.map((file) => desktop.getPathForFile?.(file) ?? "");
    const results = await desktop.invoke("documents:importPaths", { paths, folderId });
    changed();
    const failed = results.find(result => !result.ok);
    if (failed && !failed.ok) throw new Error(failed.error);
  } else await desktop.invoke("documents:import", { folderId });
  changed();
}
export function visibleFolders(
  folders: Folder[],
  expanded: string[],
  parent: Folder["id"] | null = null,
  level = 1,
): { folder: Folder; level: number }[] {
  return folders
    .filter((f) => f.parentId === parent)
    .flatMap((folder) => [
      { folder, level },
      ...(expanded.includes(folder.id)
        ? visibleFolders(folders, expanded, folder.id, level + 1)
        : []),
    ]);
}
export function selectedRange(items: Item[], anchor: string, id: string) {
  const a = items.findIndex((i) => i.document.id === anchor),
    b = items.findIndex((i) => i.document.id === id);
  return items
    .slice(Math.min(a < 0 ? b : a, b), Math.max(a, b) + 1)
    .map((i) => i.document.id);
}

export async function moveDocuments(
  documentIds: Item["document"]["id"][],
  folderId: Folder["id"] | null,
  beforeId?: Item["document"]["id"],
) {
  for (let offset = 0; offset < documentIds.length; offset += 500)
    await desktop.invoke("library:documents:move", {
      documentIds: documentIds.slice(offset, offset + 500),
      folderId,
      ...(beforeId ? { beforeId } : {}),
    });
}

export function reorderDestination(items: Item[], index: number, delta: number) {
  const target = items[index + delta];
  if (!target) return null;
  const before = delta < 0 ? target : items.slice(index + delta + 1).find(row => row.folderId === target.folderId);
  return { folderId: target.folderId, ...(before ? { beforeId: before.document.id } : {}) };
}
