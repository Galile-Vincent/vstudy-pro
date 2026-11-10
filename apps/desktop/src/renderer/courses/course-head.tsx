import { IconButton } from "@astryxdesign/core";
import { DropdownMenu, DropdownMenuItem, Tooltip, Button } from "@astryxdesign/core";
import type { Ref } from "react";
import { ArrowUpRight, ChevronLeft, CloudCheck, MoreHorizontal, RefreshCw, Unplug } from "lucide-react";
import { tr } from "../../shared/i18n";
import { PageHeader } from "../components/ui";

export interface CourseHeadProps {
  title: string;
  chip: string;
  people: string[];
  sync: string;
  fullName: string;
  syncing: boolean;
  menuTrigger: Ref<HTMLButtonElement>;
  onBack: () => void;
  onOpen: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
}

export function CourseHead({ title, chip, people, sync, fullName, syncing, menuTrigger, onBack, onOpen, onRefresh, onDisconnect }: CourseHeadProps) {
  return (
    <PageHeader
        title={title}
        className="course-head [&_h1]:break-words"
        leading={
        <button type="button" className="inline-flex items-center gap-1 text-[var(--muted)]" onClick={onBack}>
          <ChevronLeft aria-hidden="true" />
          {tr("moodle:all_courses")}
        </button>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={tr("moodle:course_actions")}>
            <Button endContent={<ArrowUpRight aria-hidden="true" />} label={tr("webview:open")} variant="primary" onClick={onOpen}>
              {tr("webview:open")}

            </Button>
            <Tooltip  content={<>{tr("moodle:refresh")}</>}><IconButton label={tr("moodle:refresh")} variant="secondary"  size="md" aria-label={tr("moodle:refresh")}  isDisabled={syncing} aria-busy={syncing} onClick={onRefresh} icon={<RefreshCw aria-hidden="true" className={syncing ? "moodle-spin" : ""} />} /></Tooltip>
            <DropdownMenu alignment="end" renderTrigger={triggerProps => <><IconButton {...triggerProps} label={tr("moodle:course_more")} ref={node => { triggerProps.ref(node); if (typeof menuTrigger === "function") menuTrigger(node); else if (menuTrigger) menuTrigger.current = node; }} variant="secondary"  size="md" aria-label={tr("moodle:course_more")} {...{title:tr("moodle:course_more")}} data-course-overflow icon={<MoreHorizontal aria-hidden="true" />} /></>}><h3>{tr("moodle:original_name")}</h3><p className="moodle-raw-name max-w-80 break-words px-2 text-sm">{fullName}</p><DropdownMenuItem variant="destructive" onClick={() => queueMicrotask(onDisconnect)} label={<><Unplug aria-hidden="true" />{tr("moodle:disconnect")}</>} /></DropdownMenu>
          </div>
        }
        meta={<div className="flex flex-col gap-2 text-[var(--muted)]">
        <p className="course-head-meta flex flex-wrap gap-x-4 gap-y-1">
          {chip && <span >{chip}</span>}
          {people.map(value => <span key={value} >{value}</span>)}
        </p>
          <p className="flex items-center gap-2" data-testid="course-cache-state">
            <CloudCheck aria-hidden="true" />
            {sync}
          </p>
        </div>}
      />
  );
}
