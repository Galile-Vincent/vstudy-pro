import { Breadcrumbs, BreadcrumbItem, Heading, MetadataList, MetadataListItem } from "@astryxdesign/core";
import { IconButton } from "@astryxdesign/core";
import { Button } from "@astryxdesign/core";
import type { Ref } from "react";
import { RefreshCw, Unplug } from "lucide-react";
import { tr } from "../../shared/i18n";

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

export function CourseHead({ title, chip, people, sync, syncing, onBack, onOpen, onRefresh, onDisconnect }: CourseHeadProps) {
  return <div className="variant-b-header">
    <Breadcrumbs label={tr("moodle:all_courses")}><BreadcrumbItem onClick={onBack}>{tr("moodle:all_courses")}</BreadcrumbItem><BreadcrumbItem>{title}</BreadcrumbItem></Breadcrumbs>
    <Heading level={1}>{title}</Heading>
    <MetadataList>
      <MetadataListItem label={tr("moodle:course_sections")}>{chip}</MetadataListItem>
      <MetadataListItem label={tr("moodle:your_courses")}>{people.join(" · ")}</MetadataListItem>
      <MetadataListItem label={tr("moodle:refresh")}>{sync}</MetadataListItem>
    </MetadataList>
    <div className="variant-b-card-actions">
      <Button label={tr("webview:open")} onClick={onOpen} />
      <IconButton label={tr("moodle:refresh")} variant="secondary" isDisabled={syncing} onClick={onRefresh} icon={<RefreshCw />} />
      <IconButton label={tr("moodle:disconnect")} variant="secondary" onClick={onDisconnect} icon={<Unplug />} />
    </div>
  </div>;
}
