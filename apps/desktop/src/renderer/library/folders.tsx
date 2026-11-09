import { useId, type CSSProperties } from "react";
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

function FolderArt() {
  const id = useId();
  return (
    <svg className="folder-art" viewBox="0 0 112 88" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--folder-front-hi)" }} />
          <stop offset="1" style={{ stopColor: "var(--folder-front)" }} />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" style={{ stopColor: "var(--surface)", stopOpacity: 0.5 }} />
          <stop offset="0.55" style={{ stopColor: "var(--surface)", stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient id={`${id}-back`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--folder-back-hi)" }} />
          <stop offset="1" style={{ stopColor: "var(--folder-back)" }} />
        </linearGradient>
      </defs>
      <path className="folder-back" fill={`url(#${id}-back)`} d="M6 14a8 8 0 0 1 8-8h25a8 8 0 0 1 5.7 2.4l4.2 4.2a8 8 0 0 0 5.7 2.4H98a8 8 0 0 1 8 8V72a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8Z" />
      <g className="folder-papers">
        <rect className="folder-paper folder-paper-back" x="15" y="20" width="82" height="42" rx="4" />
        <rect className="folder-paper folder-paper-front" x="12" y="25" width="86" height="42" rx="4" />
      </g>
      <path className="folder-front" fill={`url(#${id}-front)`} d="M6 38a8 8 0 0 1 8-8h84a8 8 0 0 1 8 8v34a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8Z" />
      <path className="folder-sheen" fill={`url(#${id}-sheen)`} d="M6 38a8 8 0 0 1 8-8h84a8 8 0 0 1 8 8v34a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8Z" />
      <path className="folder-edge" d="M14.5 30.75h83" />
    </svg>
  );
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
              className="course-folder"
              data-uncategorized={group.key === uncategorizedKey}
              style={group.courseId ? ({ "--folder-tone": `var(--${toneFor(group.key)})` } as CSSProperties) : undefined}
              aria-label={tr("library:openFolder", { name })}
              onClick={() => onOpen(group.key)}
            >
              <span className="course-folder-stage">
                <FolderArt />
              </span>
              <span className="course-folder-name">{name}</span>
              <span className="course-folder-meta">
                {tr("library:folderFiles", { count: group.items.length, formatted: formatNumber(group.items.length) })}
                {group.pages > 0 && <span>{tr("library:pages", { count: group.pages, formatted: formatNumber(group.pages) })}</span>}
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
