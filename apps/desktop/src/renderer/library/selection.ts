import type { LibraryQuery } from '../../shared/library';

export function provesExistence(query: LibraryQuery, cursor: unknown) {
  return !cursor && Object.entries(query).every(([key, value]) =>
    value === undefined || ["sort", "direction", "limit", "cursor"].includes(key) ||
    (key === "view" && value === "all"));
}
