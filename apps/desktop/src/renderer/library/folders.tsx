import { IconButton } from "@astryxdesign/core";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core";
import { type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Files, FolderClosed } from "lucide-react";
import { tr } from "../../shared/i18n";
import { uncategorizedKey, type CourseGroup, type LibraryMode } from "./model";

const tones = ["info", "success", "warning", "chart-2", "chart-3", "chart-4"];

function toneFor(key: string) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length]!;
}

export function LibraryModeToggle({ mode, onChange }: { mode: LibraryMode; onChange: (mode: LibraryMode) => void }) {
  return (
    <SegmentedControl label={tr("library:viewMode")} value={mode} onChange={value => { if (value) onChange(value as LibraryMode); }} className="library-mode" aria-label={tr("library:viewMode")}>
      <SegmentedControlItem value="files" label={tr("library:viewFiles")} icon={<Files />} />
      <SegmentedControlItem value="folders" label={tr("library:viewFolders")} icon={<FolderClosed />} />
    </SegmentedControl>
  );
}

export function FolderGrid({ groups, formatNumber, onOpen }: { groups: CourseGroup[]; formatNumber: (n: number) => string; onOpen: (key: string) => void }) {
  return (
    <ul className="folder-grid" aria-label={tr("library:folderList")}>
      {groups.map((group) => {
        const name = group.name ?? tr("library:unfiled");
        return (
          <li key={group.key}>
            <button
              type="button"
              id={`library-folder-${encodeURIComponent(group.key)}`}
              className="course-folder folder-row"
              data-uncategorized={group.key === uncategorizedKey}
              style={group.courseId ? ({ "--folder-tone": `var(--${toneFor(group.key)})` } as CSSProperties) : undefined}
              aria-label={tr("library:openFolder", { name })}
              onClick={() => onOpen(group.key)}
            >
              <FolderClosed className="folder-row-icon" aria-hidden="true" />
              <span className="min-w-0">
              <span className="course-folder-name" title={name}>{name}</span>
              <span className="course-folder-meta">
                {tr("library:folderFiles", { count: group.items.length, formatted: formatNumber(group.items.length) })}
                {group.pages > 0 && <span>{tr("library:pages", { count: group.pages, formatted: formatNumber(group.pages) })}</span>}
              </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function FolderCrumbs({ name, onBack }: { name: string; onBack: () => void }) {
  return (
    <nav className="folder-crumbs" aria-label={tr("library:breadcrumb")}>
      <IconButton label={tr("library:backToFolders")} variant="ghost" className="folder-back-button" onClick={onBack} aria-label={tr("library:backToFolders")} icon={<ChevronLeft aria-hidden="true" />} />
      <button type="button" className="folder-crumb-root" onClick={onBack}>{tr("library:viewFolders")}</button>
      <ChevronRight className="folder-crumb-separator" aria-hidden="true" />
      <span className="folder-crumb-current" aria-current="page">{name}</span>
    </nav>
  );
}
