import { useState } from "react";
import { ArrowUpRight, Clock3, FileText, Trash2 } from "lucide-react";
import type { IpcResponse } from "../../shared/ipc";
import { tr } from "../../shared/i18n";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useExamFormat } from "./format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/ui/dialog";
type Row = IpcResponse<"review:exam:history">["items"][number];
export function ExamHistory({
  items,
  busy,
  documentTitle,
  onOpen,
  onDelete,
}: {
  items: Row[];
  busy: boolean;
  documentTitle: (id: string) => string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const format = useExamFormat();
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);
  return (
    <>
      <ul className="exam-history">
        {items.map(({ artifact, attempt }) => {
          const graded = attempt && attempt.phase !== "answering",
            correct = attempt?.results.filter((r) => r.correct).length ?? 0,
            total = attempt?.results.length ?? 0;
          return (
            <li key={artifact.id}>
              <div className="exam-history-main">
                <h3>
                  <Button
                    variant="ghost"
                    className="exam-history-title"
                    disabled={busy}
                    onClick={() => onOpen(artifact.id)}
                  >
                    {artifact.title}
                  </Button>
                </h3>
                <time dateTime={artifact.createdAt}>
                  {format.dateTime(artifact.createdAt)}
                </time>
                <p className="exam-history-sources">
                  <FileText size={15} aria-hidden="true" />
                  <span>
                    {artifact.resolvedScope.documentIds
                      .map(
                        (id) =>
                          artifact.resolvedScope.sourceTitles?.[id] ??
                          documentTitle(id),
                      )
                      .join(" · ")}
                  </span>
                </p>
              </div>
              <div className="exam-history-metrics">
                {graded ? (
                  <>
                    <strong>
                      {format.percent(correct / Math.max(1, total))}
                    </strong>
                    <span>{tr("exams:score_summary", { correct, total })}</span>
                    <span className="exam-duration">
                      <Clock3 size={14} aria-hidden="true" />
                      {tr("exams:duration", {
                        minutes: Math.max(
                          0,
                          Math.round(
                            (Date.parse(
                              attempt.committedAt ?? attempt.startedAt,
                            ) -
                              Date.parse(attempt.startedAt)) /
                              60000,
                          ),
                        ),
                      })}
                    </span>
                  </>
                ) : (
                  <Badge variant="secondary">
                    {tr(
                      attempt
                        ? "exams:in_progress"
                        : `review:artifact_${artifact.status}`,
                    )}
                  </Badge>
                )}
              </div>
              <div className="exam-history-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onOpen(artifact.id)}
                  aria-label={tr("exams:reopen_named", {
                    title: artifact.title,
                  })}
                >
                  {tr("exams:reopen")}
                  <ArrowUpRight aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  onClick={() => {
                    setDeleteFailed(false);
                    setDeleting(
                      items.find((row) => row.artifact.id === artifact.id) ??
                        null,
                    );
                  }}
                  aria-label={tr("exams:delete_named", {
                    title: artifact.title,
                  })}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDeleting(null);
            setDeleteFailed(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("exams:delete_title")}</DialogTitle>
            <DialogDescription>
              {tr("exams:delete_description", {
                title: deleting?.artifact.title ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          {deleteFailed && <p role="alert">{tr("review:error")}</p>}
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              {tr("review:cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (deleting)
                  void onDelete(deleting.artifact.id)
                    .then(() => setDeleting(null))
                    .catch(() => setDeleteFailed(true));
              }}
            >
              {tr("review:delete_confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
