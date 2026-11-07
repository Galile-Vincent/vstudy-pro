/** Course detail header: one left edge, title with grouped actions, and a single quiet meta line. */
import type { Ref } from "react";
import { ArrowUpRight, ChevronLeft, CloudCheck, MoreHorizontal, RefreshCw, Unplug } from "lucide-react";
import { tr } from "../../shared/i18n";
import { Button } from "../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import "./course-head.css";

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
      <header className="course-head">
        <button type="button" className="course-head-back" onClick={onBack}>
          <ChevronLeft aria-hidden="true" />
          {tr("moodle:all_courses")}
        </button>
        <div className="course-head-title">
          <h1>{title}</h1>
          <div className="course-head-actions" role="group" aria-label={tr("moodle:course_actions")}>
            <Button variant="outline" className="course-head-open" onClick={onOpen}>
              {tr("webview:open")}
              <ArrowUpRight aria-hidden="true" />
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="course-head-icon" aria-label={tr("moodle:refresh")} disabled={syncing} aria-busy={syncing} onClick={onRefresh}>
                  <RefreshCw aria-hidden="true" className={syncing ? "moodle-spin" : ""} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tr("moodle:refresh")}</TooltipContent>
            </Tooltip>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button ref={menuTrigger} variant="outline" size="icon" className="course-head-icon" aria-label={tr("moodle:course_more")} title={tr("moodle:course_more")} data-course-overflow>
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="course-head-menu">
                <DropdownMenuLabel className="course-head-menu-label">{tr("moodle:original_name")}</DropdownMenuLabel>
                <p className="moodle-raw-name">{fullName}</p>
                <DropdownMenuItem variant="destructive" onSelect={onDisconnect}>
                  <Unplug aria-hidden="true" />
                  {tr("moodle:disconnect")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="course-head-meta">
          {chip && <span className="course-head-chip">{chip}</span>}
          {people.map(value => <span key={value} className="course-head-fact">{value}</span>)}
          <span className="course-head-fact course-head-sync" data-testid="course-cache-state">
            <CloudCheck aria-hidden="true" />
            {sync}
          </span>
        </p>
      </header>
    </TooltipProvider>
  );
}
