import type { Ref } from "react";
import { ArrowUpRight, ChevronLeft, CloudCheck, MoreHorizontal, RefreshCw, Unplug } from "lucide-react";
import { tr } from "../../shared/i18n";
import { Button } from "../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
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
    <TooltipProvider delayDuration={400}>
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
            <Button variant="outline" onClick={onOpen}>
              {tr("webview:open")}
              <ArrowUpRight aria-hidden="true" />
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" aria-label={tr("moodle:refresh")} disabled={syncing} aria-busy={syncing} onClick={onRefresh}>
                  <RefreshCw aria-hidden="true" className={syncing ? "moodle-spin" : ""} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tr("moodle:refresh")}</TooltipContent>
            </Tooltip>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button ref={menuTrigger} variant="outline" size="icon" aria-label={tr("moodle:course_more")} title={tr("moodle:course_more")} data-course-overflow>
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8}>
                <DropdownMenuLabel>{tr("moodle:original_name")}</DropdownMenuLabel>
                <p className="moodle-raw-name max-w-80 break-words px-2 text-sm">{fullName}</p>
                <DropdownMenuItem variant="destructive" onSelect={onDisconnect}>
                  <Unplug aria-hidden="true" />
                  {tr("moodle:disconnect")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
    </TooltipProvider>
  );
}
