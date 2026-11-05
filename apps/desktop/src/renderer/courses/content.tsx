import { useMoodleWebview } from './webview';
import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  FileText,
  Folder,
  Link,
  LockKeyhole,
  MessageSquare,
} from "lucide-react";
import type { MoodleCourseDetail } from "../../shared/moodle";
import type {
  MoodleAnnouncement,
  MoodleModule,
  MoodleModuleKind,
  MoodleSection,
} from "../../shared/moodle-course";
import { externalUrlSchema } from "../../shared/ipc";
import { tr, i18n } from "../../shared/i18n";
import { desktop } from "../bridge";
import { Button } from "../components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../components/ui/sheet";

export function openCourseUrl(url: string, onError: () => void) {
  const parsed = externalUrlSchema.safeParse(url);
  if (!parsed.success) onError();
  if (parsed.success)
    void desktop
      .invoke("shell:openExternal", { url: parsed.data })
      .catch(onError);
}
const allowed = new Set([
  "P",
  "BR",
  "STRONG",
  "EM",
  "B",
  "I",
  "UL",
  "OL",
  "LI",
  "H2",
  "H3",
  "H4",
  "BLOCKQUOTE",
  "PRE",
  "CODE",
  "TABLE",
  "THEAD",
  "TBODY",
  "TR",
  "TH",
  "TD",
  "HR",
  "SPAN",
  "DIV",
]);
const dropped = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "SVG",
  "MATH",
  "IMG",
  "VIDEO",
  "AUDIO",
  "FORM",
  "INPUT",
  "TEMPLATE",
]);
export function courseHtmlPreview(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  document
    .querySelectorAll([...dropped].join(","))
    .forEach((node) => node.remove());
  return document.body.textContent?.replace(/\s+/g, " ").trim() || "";
}
export function SafeCourseHtml({ html, onLink }: { html: string; onLink?: ((url:string)=>void) | undefined }) {
  const [failed, setFailed] = useState(false);
  const document = new DOMParser().parseFromString(html, "text/html");
  function render(node: Node, key: number): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (!(node instanceof Element) || dropped.has(node.tagName)) return null;
    const children = Array.from(node.childNodes).map(render);
    if (node.tagName === "A") {
      const href = node.getAttribute("href");
      if (href && externalUrlSchema.safeParse(href).success)
        return (
          <a
            key={key}
            href={href}
            onClick={(event) => {
              event.preventDefault();
              if (onLink) onLink(href); else openCourseUrl(href, () => setFailed(true));
            }}
          >
            {children}
          </a>
        );
    }
    return allowed.has(node.tagName)
      ? createElement(node.tagName.toLowerCase(), { key }, children)
      : children;
  }
  return (
    <div className="moodle-safe-html">
      {document.querySelector("img,video,audio,iframe,object,embed") && <p role="note">{tr("moodle:media_notice")}</p>}
      {failed && <p role="alert">{tr("moodle:link_failed")}</p>}
      {Array.from(document.body.childNodes).map(render)}
    </div>
  );
}
const icons: Partial<Record<MoodleModuleKind, typeof BookOpen>> = {
  resource: FileText,
  folder: Folder,
  url: Link,
  forum: MessageSquare,
  assign: CalendarDays,
  quiz: CheckCircle2,
};
const date = (value: string) =>
  new Date(value).toLocaleString(i18n.resolvedLanguage, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
function WeeklySection({
  section,
  onModule,
}: {
  section: MoodleSection;
  onModule: (module: MoodleModule) => void;
}) {
  const [open, setOpen] = useState(section.current);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (section.current) {
      setOpen(true);
      ref.current?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
    }
  }, [section.current]);
  return (
    <section ref={ref} className="moodle-week" data-current={section.current}>
      <button
        className="moodle-week-heading"
        aria-expanded={section.accessible ? open : false}
        aria-controls={`week-${section.id}`}
        onClick={() => section.accessible && setOpen(!open)}
        disabled={!section.accessible}
      >
        {section.accessible ? (
          <ChevronRight className={open ? "moodle-rotate" : ""} />
        ) : (
          <LockKeyhole />
        )}
        <span>
          <strong>{section.name}</strong>
          <small>
            {section.accessible
              ? tr("moodle:module_count", { count: section.modules.length })
              : tr("moodle:section_locked")}
          </small>
        </span>
        {section.current && (
          <span className="moodle-chip">{tr("moodle:this_week")}</span>
        )}
      </button>
      {open && section.accessible && (
        <div id={`week-${section.id}`}>
          {section.summaryHtml && <SafeCourseHtml html={section.summaryHtml} />}
          {section.modules.map((module) => {
            const Icon = icons[module.kind] ?? BookOpen;
            return (
              <button
                key={module.id}
                className="moodle-module"
                onClick={() => onModule(module)}
                disabled={!module.accessible}
              >
                <span className="moodle-row-icon">
                  <Icon />
                </span>
                <span className="moodle-row-main">
                  <strong>{module.name}</strong>
                  <small>
                    {tr(`moodle:kind_${module.kind}`)}
                    {module.dueAt && <> · {date(module.dueAt)}</>}
                    {module.fileIds.length > 0 && (
                      <>
                        {" "}
                        ·{" "}
                        {tr("moodle:attachment_count", {
                          count: module.fileIds.length,
                        })}
                      </>
                    )}
                  </small>
                </span>
                {!module.accessible ? (
                  <LockKeyhole aria-label={tr("moodle:section_locked")} />
                ) : (
                  module.completion !== "none" &&
                  (["complete", "pass"].includes(module.completion) ? (
                    <CheckCircle2 aria-label={tr("moodle:complete")} />
                  ) : (
                    <Circle
                      aria-label={tr(`moodle:completion_${module.completion}`)}
                    />
                  ))
                )}
                <ChevronRight />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
export function CourseContent({
  detail,
  openFile,
}: {
  detail: MoodleCourseDetail;
  openFile: (id: string) => Promise<void>;
  onError: () => void;
}) {
  const openMoodle = useMoodleWebview();
  const original = (url:string) => {setSelected(undefined);openMoodle(detail.course.accountId,{kind:"page",url},trigger.current);};
  const [selected, setSelected] = useState<MoodleModule>();
  const trigger = useRef<HTMLElement | null>(null);
  const [opening, setOpening] = useState(false);
  return (
    <>
      <div className="moodle-weeks">
        {detail.sections.length ? (
          detail.sections.map((section) => (
            <WeeklySection
              key={section.id}
              section={section}
              onModule={(module) => {
                trigger.current = document.activeElement as HTMLElement;
                setSelected(module);
              }}
            />
          ))
        ) : (
          <p className="moodle-empty-inline">{tr((detail.panels?.contents ?? detail.fetchState) === "loading" ? "moodle:loading" : (detail.panels?.contents ?? detail.fetchState) === "error" ? `moodle:panel_error_${detail.panelErrors?.contents ?? "service"}` : "moodle:no_sections")}</p>
        )}
      </div>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <SheetContent
          className="moodle-detail-sheet"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>
              {selected && tr(`moodle:kind_${selected.kind}`)}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="moodle-sheet-body">
              {selected.descriptionHtml && (
                <SafeCourseHtml html={selected.descriptionHtml} onLink={original} />
              )}
              {selected.dueAt && (
                <p>
                  {tr("moodle:due")} · {date(selected.dueAt)}
                </p>
              )}
              {selected.submitted !== null && (
                <p>
                  {tr(
                    selected.submitted
                      ? "moodle:submitted"
                      : "moodle:not_submitted",
                  )}
                </p>
              )}
              {selected.fileIds.map((id) => {
                const file = detail.files.find((f) => f.id === id);
                return (
                  file && (
                    <Button
                      key={id}
                      variant="outline"
                      disabled={opening}
                      onClick={async () => {
                        setOpening(true);
                        try {
                          await openFile(id);
                        } finally {
                          setOpening(false);
                        }
                      }}
                    >
                      <FileText />
                      {file.name}
                    </Button>
                  )
                );
              })}
              {selected.url && (
                <Button
                  variant="outline"
                  onClick={() => original(selected.url!)}
                >
                  <Link />
                  {tr('webview:original')}
                </Button>
              )}
              {[
                "forum",
                "quiz",
                "assign",
                "other",
                "h5p",
                "video",
                "subsection",
              ].includes(selected.kind) && (
                <p className="moodle-panel-description">
                  {tr("moodle:activity_details")}
                </p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
export function Announcements({ items, accountId }: { items: MoodleAnnouncement[]; accountId?:string }) {
  const openMoodle = useMoodleWebview();
  const original = (url:string) => {setSelected(undefined);if (accountId) openMoodle(accountId,{kind:"page",url},trigger.current);};
  const [selected, setSelected] = useState<MoodleAnnouncement>();
  const trigger = useRef<HTMLElement | null>(null);
  return (
    <section className="moodle-panel">
      <h2>{tr("moodle:announcements")}</h2>
      {items.length ? (
        [...items]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((item) => (
            <button
              className="moodle-announcement"
              key={item.id}
              onClick={() => {
                trigger.current = document.activeElement as HTMLElement;
                setSelected(item);
              }}
            >
              <strong>{item.subject}</strong>
              <small>
                {item.author} · {date(item.createdAt)}
              </small>
              <p>{courseHtmlPreview(item.bodyHtml).slice(0, 220)}</p>
              <ChevronRight />
            </button>
          ))
      ) : (
        <p>{tr("moodle:no_announcements")}</p>
      )}
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <SheetContent
          className="moodle-detail-sheet"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>{selected?.subject}</SheetTitle>
            <SheetDescription>
              {selected?.author}
              {selected && <> · {date(selected.createdAt)}</>}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="moodle-sheet-body">
              <SafeCourseHtml html={selected.bodyHtml} onLink={accountId ? original : undefined} />
              {accountId && selected.url && <Button variant="outline" onClick={() => original(selected.url!)}><Link />{tr('webview:original')}</Button>}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
