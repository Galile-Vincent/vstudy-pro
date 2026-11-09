import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import {
  MAX_REVIEW_CONCEPTS,
  studyScopeSchema,
} from "../../shared/review-artifacts";
import type { IpcResponse } from "../../shared/ipc";
import { tr } from "../../shared/i18n";
import { desktop } from "../bridge";
import { Button } from "../components/ui/button";
import { useReviewPage, type Cursor } from "./paging";

export type ReviewScope = z.infer<typeof studyScopeSchema>;
type Selection = { courseId: string; conceptKeys: string[]; labels: string[] };
export function ScopePicker({
  courseId,
  selection,
  onChange,
  needsSourceSelection,
  size = "standard",
  onSizeChange,
}: {
  courseId: string;
  selection: Selection | null;
  onChange: (scope: ReviewScope | null) => void;
  needsSourceSelection?: boolean;
  size?: "short" | "standard" | "long";
  onSizeChange?: (size: "short" | "standard" | "long") => void;
}) {
  const preselected = selection?.courseId === courseId ? selection : null;
  const [kind, setKind] = useState<ReviewScope["kind"]>(
    preselected ? "concepts" : "units",
  );
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [conceptKeys, setConceptKeys] = useState<string[]>(
    preselected?.conceptKeys ?? [],
  );
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [zone, setZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [documents, setDocuments] = useState<IpcResponse<"documents:list">>([]);
  const [documentError, setDocumentError] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const change = useRef(onChange);
  change.current = onChange;
  const units = useReviewPage(
    useCallback(
      (cursor?: Cursor) =>
        desktop.invoke("review:courses:units", {
          courseId,
          limit: 50,
          ...(cursor ? { cursor } : {}),
        }),
      [courseId],
    ),
  );
  const concepts = useReviewPage(
    useCallback(
      (cursor?: Cursor) =>
        desktop.invoke("review:concepts:list", {
          courseId,
          limit: 50,
          ...(cursor ? { cursor } : {}),
        }),
      [courseId],
    ),
  );
  useEffect(() => {
    setKind(preselected ? "concepts" : "units");
    setUnitIds([]);
    setDocumentIds([]);
    setConceptKeys(preselected?.conceptKeys ?? []);
  }, [courseId, selection]);
  useEffect(() => {
    if (needsSourceSelection) setKind("documents");
  }, [needsSourceSelection]);
  useEffect(() => {
    let current = true;
    setDocumentsLoading(true);
    setDocumentError(false);
    desktop
      .invoke("documents:list", {})
      .then((rows) => {
        if (current) setDocuments(rows.filter((row) => row.status === "ready"));
      })
      .catch(() => {
        if (current) setDocumentError(true);
      })
      .finally(() => {
        if (current) setDocumentsLoading(false);
      });
    desktop
      .invoke("review:prefs:get", {})
      .then((prefs) => {
        if (current) setZone(prefs.timeZone);
      })
      .catch(() => {
        /* The device's IANA zone remains visible when preferences are unavailable. */
      });
    return () => {
      current = false;
    };
  }, [courseId, reload]);
  const scope = useMemo(() => {
    let candidate: unknown;
    if (kind === "units") candidate = { kind, unitIds };
    else if (kind === "documents") candidate = { kind, documentIds };
    else if (kind === "concepts") candidate = { kind, conceptKeys };
    else if (kind === "dates") {
      const days = (Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000;
      if (!(days > 0 && days <= 366)) return null;
      candidate = { kind, fromDate, toDate, timeZone: zone };
    } else candidate = { kind };
    const parsed = studyScopeSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  }, [kind, unitIds, documentIds, conceptKeys, fromDate, toDate, zone]);
  useEffect(() => {
    change.current(scope);
  }, [scope]);
  function toggle(
    value: string,
    old: string[],
    update: (values: string[]) => void,
  ) {
    update(
      old.includes(value)
        ? old.filter((item) => item !== value)
        : [...old, value],
    );
  }
  const page = kind === "units" ? units : kind === "concepts" ? concepts : null;
  const choices =
    kind === "units"
      ? units.items.map((row) => ({ key: row.id, label: row.title }))
      : kind === "concepts"
        ? [
            ...concepts.items.map((row) => ({
              key: row.key,
              label: row.label,
            })),
            ...(preselected?.conceptKeys
              .map((key, index) => ({
                key,
                label: preselected.labels[index] ?? key,
              }))
              .filter(
                (row) =>
                  !concepts.items.some((concept) => concept.key === row.key),
              ) ?? []),
          ]
        : documents.map((row) => ({ key: row.id, label: row.title }));
  const selected =
    kind === "units"
      ? unitIds
      : kind === "concepts"
        ? conceptKeys
        : documentIds;
  const update =
    kind === "units"
      ? setUnitIds
      : kind === "concepts"
        ? setConceptKeys
        : setDocumentIds;
  const loading = page?.loading ?? (kind === "documents" && documentsLoading);
  const error = page?.error ?? (kind === "documents" && documentError);
  return (
    <fieldset className="review-scope">
      <legend>{tr("review:scope_title")}</legend>
      {kind === "concepts" && selected.length >= MAX_REVIEW_CONCEPTS && (
        <p role="status">
          {tr("review:scope_limit", { count: MAX_REVIEW_CONCEPTS })}
        </p>
      )}
      <label>
        {tr("review:scope_kind")}
        <select
          value={kind}
          onChange={(event) =>
            setKind(event.target.value as ReviewScope["kind"])
          }
        >
          {(["units", "documents", "dates", "concepts", "weak"] as const).map(
            (value) => (
              <option key={value} value={value}>
                {tr(`review:scope_${value}`)}
              </option>
            ),
          )}
        </select>
      </label>
      {kind === "dates" ? (
        <div className="review-actions">
          <label>
            {tr("review:scope_from")}
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label>
            {tr("review:scope_to")}
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
          <span>{zone}</span>
          <p>{tr("review:scope_dates_help")}</p>
          {fromDate && toDate && !scope && (
            <p role="status">{tr("review:scope_dates_invalid")}</p>
          )}
        </div>
      ) : kind === "weak" ? (
        <p>{tr("review:scope_weak_help")}</p>
      ) : (
        <>
          {kind === "documents" && <p>{tr("review:scope_documents_help")}</p>}
          {loading && <p role="status">{tr("review:loading")}</p>}
          {error && (
            <p role="alert">
              {tr("review:error")}{" "}
              <Button
                type="button"
                onClick={() =>
                  page ? page.retry() : setReload((value) => value + 1)
                }
              >
                {tr("review:retry")}
              </Button>
            </p>
          )}
          <div className="review-scope-choices">
            {choices.map((row) => (
              <label key={row.key}>
                <input
                  type="checkbox"
                  checked={selected.includes(row.key)}
                  disabled={
                    !selected.includes(row.key) &&
                    selected.length >= MAX_REVIEW_CONCEPTS
                  }
                  onChange={() => toggle(row.key, selected, update)}
                />
                {row.label}
              </label>
            ))}
          </div>
          {!loading && !error && !choices.length && (
            <p>{tr("review:scope_empty")}</p>
          )}
          {page?.cursor && (
            <Button type="button" disabled={page.loading} onClick={page.more}>
              {tr("review:load_more")}
            </Button>
          )}
        </>
      )}
      <label>
        {tr("review:scope_size")}
        <select
          value={size}
          onChange={(event) =>
            onSizeChange?.(event.target.value as "short" | "standard" | "long")
          }
        >
          {(["short", "standard", "long"] as const).map((value) => (
            <option key={value} value={value}>
              {tr(`review:scope_${value}`)}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}
