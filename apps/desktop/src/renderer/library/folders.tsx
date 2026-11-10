import { type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Files, FolderClosed } from "lucide-react";
import { tr } from "../../shared/i18n";
import { Button } from "../components/ui/button";
import { uncategorizedKey, type CourseGroup, type LibraryMode } from "./model";

const tones = ["info", "success", "warning", "chart-2", "chart-3", "chart-4"];

function toneFor(key: string) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length]!;
}

export function LibraryModeToggle({ mode, onChange }: { mode: LibraryMode; onChange: (mode: LibraryMode) => void }) {
  return (
    <div className="library-mode" role="group" aria-label={tr("library:viewMode")}>
      <Button variant="ghost" aria-pressed={mode === "files"} onClick={() => onChange("files")}>
        <Files aria-hidden="true" />
        {tr("library:viewFiles")}
      </Button>
      <Button variant="ghost" aria-pressed={mode === "folders"} onClick={() => onChange("folders")}>
        <FolderClosed aria-hidden="true" />
        {tr("library:viewFolders")}
      </Button>
    </div>
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
      <Button variant="ghost" className="folder-back-button" onClick={onBack} aria-label={tr("library:backToFolders")}>
        <ChevronLeft aria-hidden="true" />
      </Button>
      <button type="button" className="folder-crumb-root" onClick={onBack}>{tr("library:viewFolders")}</button>
      <ChevronRight className="folder-crumb-separator" aria-hidden="true" />
      <span className="folder-crumb-current" aria-current="page">{name}</span>
    </nav>
  );
}
