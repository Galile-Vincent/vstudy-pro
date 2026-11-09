import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { IpcResponse } from "../../shared/ipc";
import { tr } from "../../shared/i18n";
import { Badge, Button, ListRow } from "../components/ui";
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
      <ul className="exam-history grid gap-[var(--space-2)]">
        {items.map((row) => {
          const { artifact, attempt } = row,
            graded = attempt && attempt.phase !== "answering",
            correct = attempt?.results.filter((r) => r.correct).length ?? 0,
            total = attempt?.results.length ?? 0;
          return (
            <li key={artifact.id}>
              <ListRow
                title={artifact.title}
                subtitle={
                  <>
                    {artifact.resolvedScope.documentIds
                      .map(
                        (id) =>
                          artifact.resolvedScope.sourceTitles?.[id] ??
                          documentTitle(id),
                      )
                      .join(" · ")}
                    {" · "}
                    <time dateTime={artifact.createdAt}>
                      {format.dateTime(artifact.createdAt)}
                    </time>
                  </>
                }
                meta={
                  graded ? (
                    <span className="block">
                      <strong className="block text-[length:var(--type-lg)] font-medium text-[var(--ink)]">
                        {format.percent(correct / Math.max(1, total))}
                      </strong>
                      {tr("exams:score_summary", { correct, total })} ·{" "}
                      {tr("exams:duration", {
                        minutes: format.minutes(
                          attempt.startedAt,
                          attempt.committedAt ?? attempt.startedAt,
                        ),
                      })}
                    </span>
                  ) : (
                    <Badge variant="secondary">
                      {tr(
                        attempt
                          ? "exams:in_progress"
                          : `review:artifact_${artifact.status}`,
                      )}
                    </Badge>
                  )
                }
                disabled={busy}
                onClick={() => onOpen(artifact.id)}
                actions={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    onClick={() => {
                      setDeleteFailed(false);
                      setDeleting(row);
                    }}
                    aria-label={tr("exams:delete_named", {
                      title: artifact.title,
                    })}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                }
              />
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
