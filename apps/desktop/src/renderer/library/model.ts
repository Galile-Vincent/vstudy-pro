import type { IpcResponse } from "../../shared/ipc";
import { displayTitle } from "../../shared/moodle-course-display";
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

export type LibraryMode = 'folders' | 'files';
const modeStorageKey = 'library-mode';
export function readMode(): LibraryMode {
  try { return localStorage.getItem(modeStorageKey) === 'files' ? 'files' : 'folders'; }
  catch { return 'folders'; }
}
export function writeMode(mode: LibraryMode) {
  try { localStorage.setItem(modeStorageKey, mode); }
  catch { /* A blocked preference store only loses the remembered view. */ }
}

export function courseName(item: Item, language: string): string | null {
  const course = item.course;
  if (!course) return null;
  return displayTitle({ ...course.identity, teachers: course.identity.teachers ?? [] } as Parameters<typeof displayTitle>[0], language, course.fullName) || null;
}

export type CourseGroup = { key: string; courseId: string | null; name: string | null; items: Item[]; pages: number; latest: string };
export const uncategorizedKey = 'uncategorized';

export function groupByCourse(items: Item[], language: string): CourseGroup[] {
  const groups = new Map<string, CourseGroup>();
  for (const item of items) {
    const key = item.course?.id ?? uncategorizedKey;
    let group = groups.get(key);
    if (!group) {
      group = { key, courseId: item.course?.id ?? null, name: courseName(item, language), items: [], pages: 0, latest: '' };
      groups.set(key, group);
    }
    group.items.push(item);
    group.pages += item.pageCount ?? 0;
    if (item.document.createdAt > group.latest) group.latest = item.document.createdAt;
  }
  return [...groups.values()].sort((a, b) => (a.courseId === null ? 1 : 0) - (b.courseId === null ? 1 : 0) || b.latest.localeCompare(a.latest) || (a.name ?? '').localeCompare(b.name ?? ''));
}
