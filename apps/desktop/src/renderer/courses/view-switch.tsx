import { LayoutGrid, List } from "lucide-react";
import { tr } from "../../shared/i18n";
import { COURSE_VIEW_MODES, type CourseViewMode } from "./view-mode";

const ICONS = { list: List, cards: LayoutGrid } satisfies Record<CourseViewMode, typeof List>;

export function CourseViewSwitch({ value, onChange }: { value: CourseViewMode; onChange: (mode: CourseViewMode) => void }) {
  return (
    <div className="course-view-switch" role="group" aria-label={tr("moodle:view_label")}>
      {COURSE_VIEW_MODES.map(mode => {
        const Icon = ICONS[mode];
        const label = tr(`moodle:view_${mode}`);
        return (
          <button key={mode} type="button" aria-pressed={value === mode} aria-label={label} title={label} onClick={() => onChange(mode)}>
            <Icon aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
