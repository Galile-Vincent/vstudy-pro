import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import type { IpcResponse } from "../../shared/ipc";
import type { Document } from "../../shared/domain";
import { MAX_REVIEW_CONCEPTS } from "../../shared/review-artifacts";
import type { studyScopeSchema } from "../../shared/review-artifacts";
import { tr } from "../../shared/i18n";
import { describeAssumption } from "../../shared/review-assumptions";
import { useFormat } from "../i18n";
import { desktop } from "../bridge";
import { DocumentMarkdown } from "../lazy-reader";
import { Button } from "@astryxdesign/core";
import { Select } from "../components/select";
import { useReviewPage, type Cursor } from "./paging";
import { ScopePicker } from "./scope-picker";
import { TestPlayer } from "./test-player";
import type { ReviewSelection } from "./review-selection";
import "./artifacts.css";
type Artifact = NonNullable<IpcResponse<"review:artifact:get">>;
type Scope = z.infer<typeof studyScopeSchema>;
export function ArtifactPanel({
  courseId,
  kind,
  selection,
  onConfirmed,
  onBoundedChange,
  revision = 0,
}: {
  courseId: string;
  kind: "note" | "test";
  selection: ReviewSelection | null;
  revision?: number;
  onBoundedChange?: (message: string) => void;
  onConfirmed?: (() => void) | undefined;
}) {
  const { i18n } = useTranslation();
  const format = useFormat();
  const page = useReviewPage(
    useCallback(
      (cursor?: Cursor) =>
        desktop.invoke("review:artifact:list", {
          courseId,
          limit: 20,
          ...(cursor ? { cursor } : {}),
        }),
      [courseId],
    ),
  );
  const [scope, setScope] = useState<Scope | null>(null),
    [artifact, setArtifact] = useState<Artifact | null>(null),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    [stage, setStage] = useState("generating"),
    [deleting, setDeleting] = useState(false),
    [notice, setNotice] = useState("");
  const [size, setSize] = useState<"short" | "standard" | "long">("standard");
  const [providers, setProviders] = useState<IpcResponse<"providers:list">>([]),
    [model, setModel] = useState("");
  const active = useRef<{
    artifactId: string | null;
    requestId: string | null;
  }>({ artifactId: null, requestId: null });
  const epoch = useRef(0),
    mounted = useRef(true),
    operation = useRef(false),
    recovery = useRef(0);
  const [replyLanguage, setReplyLanguage] = useState<string>("auto");
  const uiLanguage = i18n.language.startsWith("zh")
    ? "zh-Hant"
    : i18n.language.startsWith("ja")
      ? "ja"
      : "en";
  const locale =
    replyLanguage === "zh-Hant" ||
    replyLanguage === "ja" ||
    replyLanguage === "en"
      ? replyLanguage
      : uiLanguage;
  useEffect(() => {
    let current = true;
    void desktop
      .invoke("settings:get", {})
      .then((settings) => {
        if (current) setReplyLanguage(settings.replyLanguage ?? "auto");
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);
  const recover = useCallback(async (id: string) => {
    const version = epoch.current,
      sequence = ++recovery.current;
    const value = await desktop.invoke("review:artifact:get", {
      artifactId: id,
    });
    if (
      mounted.current &&
      version === epoch.current &&
      sequence === recovery.current &&
      active.current.artifactId === id
    ) {
      setArtifact(value);
      if (value)
        setStage(value.status === "generating" ? "generating" : value.status);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = desktop.onReviewProgress?.((event) => {
      const current = active.current;
      if (
        current.requestId
          ? event.requestId !== current.requestId ||
            (current.artifactId !== null &&
              event.artifactId !== current.artifactId)
          : event.artifactId !== current.artifactId
      )
        return;
      current.artifactId = event.artifactId;
      setStage(event.stage);
      if (["ready", "failed", "interrupted"].includes(event.stage))
        void recover(event.artifactId).catch(() => setFailed(true));
    });
    const reconnect = () => {
      const id = active.current.artifactId;
      if (id) void recover(id).catch(() => setFailed(true));
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    return () => {
      mounted.current = false;
      epoch.current++;
      unsubscribe?.();
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
    };
  }, [recover]);
  const loadProviders = useCallback(
    () =>
      desktop
        .invoke("providers:list", {})
        .then((value) => {
          if (mounted.current) setProviders(value);
        })
        .catch(() => {
          if (mounted.current) setFailed(true);
        }),
    [],
  );
  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);
  useEffect(() => {
    if (artifact?.status !== "generating") return;
    const timer = window.setInterval(() => {
      void recover(artifact.id).catch(() => setFailed(true));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [artifact?.id, artifact?.status, recover]);
  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await action();
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const choose = async (id: string) => {
    if (active.current.artifactId === id && artifact) return;
    epoch.current++;
    active.current = { artifactId: id, requestId: null };
    setArtifact(null);
    setDeleting(false);
    setNotice("");
    await recover(id);
  };
  const generate = async (retakeAttemptId?: string) => {
    if (!scope && !retakeAttemptId) return;
    const choices = providers.flatMap((p) =>
      p.config.enabled && p.availability.available
        ? p.models.map((m) => ({ providerId: p.config.id, modelId: m.id }))
        : [],
    );
    const choice = choices[Number(model || 0)];
    if (!choice) {
      setFailed(true);
      return;
    }
    epoch.current++;
    const requestId = crypto.randomUUID();
    active.current = { requestId, artifactId: null };
    setStage("queued");
    setDeleting(false);
    const value = await desktop.invoke("review:artifact:generate", {
      requestId,
      courseId,
      kind,
      title: tr(kind === "note" ? "review:notes" : "review:tests"),
      scope: scope ?? { kind: "weak" },
      idempotencyKey: crypto.randomUUID(),
      ...choice,
      locale,
      size,
      ...(retakeAttemptId ? { retakeAttemptId } : {}),
    });
    if (!mounted.current || active.current.requestId !== requestId) return;
    active.current.artifactId = value.id;
    setArtifact(value);
    await recover(value.id);
    page.retry();
  };
  const retry = async () => {
    if (!artifact) return;
    epoch.current++;
    const requestId = crypto.randomUUID();
    active.current = { artifactId: artifact.id, requestId };
    setStage("queued");
    const value = await desktop.invoke("review:artifact:retry", {
      artifactId: artifact.id,
      requestId,
      locale,
    });
    if (mounted.current) {
      setArtifact(value);
      await recover(value.id);
      page.retry();
    }
  };
  const choices = providers.flatMap((p) =>
    p.config.enabled && p.availability.available
      ? p.models.map((m) => ({
          key: p.config.id + ":" + m.id,
          label: m.name || m.id,
        }))
      : [],
  );
  const errorKey = artifact?.errorCode?.includes("needs_source_selection")
    ? "needs_sources"
    : artifact?.errorCode?.match(/budget|admission|price/)
      ? "generation_budget"
      : artifact?.errorCode?.match(/offline|network|provider/)
        ? "generation_offline"
        : artifact?.errorCode?.includes("infeasible")
          ? "generation_infeasible"
          : "generation_failed";
  return (
    <section className="review-artifacts">
      <h2 id={`review-${kind}-heading`} tabIndex={-1}>{tr(kind === "note" ? "review:notes" : "review:tests")}</h2>
      <ScopePicker
        courseId={courseId}
        selection={selection}
        onChange={setScope}
        onBoundedChange={onBoundedChange}
        revision={revision}
        size={size}
        onSizeChange={setSize}
        needsSourceSelection={
          artifact?.errorCode === "review.needs_source_selection"
        }
      />
      <div className="review-actions">
        <Select
          aria-label={tr("review:generation_model")}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {choices.map((m, index) => (
            <option key={m.key} value={index}>
              {m.label}
            </option>
          ))}
        </Select>
        <Button
          variant="primary"
          isDisabled={
            busy ||
            artifact?.status === "generating" ||
            !scope ||
            !choices.length
          }
          label={tr(
            kind === "note" ? "review:generate_note" : "review:generate_test",
          )}
          onClick={() => void run(() => generate())}
        />
      </div>
      {!scope && <p role="status">{tr("review:scope_required", { max: MAX_REVIEW_CONCEPTS })}</p>}
      {!choices.length && (
        <p>
          {tr("review:choose_provider")}{" "}
          <Button variant="secondary" label={tr("review:retry")} onClick={() => void loadProviders()} />
        </p>
      )}
      {failed && (
        <p role="alert">
          {tr("review:error")}{" "}
          <Button
            variant="secondary"
            label={tr("review:retry")}
            onClick={() =>
              void run(async () => {
                if (active.current.artifactId)
                  await recover(active.current.artifactId);
                else {
                  await loadProviders();
                  page.retry();
                }
              })
            }
          />
        </p>
      )}
      {busy && <p role="status">{tr("review:loading")}</p>}
      {artifact && (
        <article className="review-artifact-reader" aria-label={artifact.title}>
          <h3>{artifact.title}</h3>
          <ResolvedScope artifact={artifact} />
          {artifact.status === "generating" ? (
            <div role="status">
              <p>{tr(`review:stage_${stage}`)}</p>
              <Button
                variant="secondary"
                isDisabled={busy}
                label={tr("review:cancel")}
                onClick={() =>
                  void run(async () => {
                    await desktop.invoke("review:artifact:cancel", {
                      artifactId: artifact.id,
                    });
                    await recover(artifact.id);
                    page.retry();
                  })
                }
              />
            </div>
          ) : artifact.status !== "ready" ? (
            <div role="status">
              <p>
                {tr(
                  `review:${artifact.status === "interrupted" ? "interrupted" : errorKey}`,
                )}
              </p>
              <Button variant="secondary" isDisabled={busy} label={tr("review:retry")} onClick={() => void run(retry)} />
            </div>
          ) : kind === "note" ? (
            <>
              <DocumentMarkdown
                source={artifact.bodyMarkdown ?? ""}
                documentId={artifact.id as Document["id"]}
                decorative
                onSelect={() => {}}
                onNotice={setNotice}
              />
              <div className="review-actions">
                <Button
                  variant="secondary"
                  isDisabled={busy}
                  label={tr("review:export_note")}
                  onClick={() =>
                    void run(async () => {
                      const result = await desktop.invoke(
                        "review:artifact:export",
                        { artifactId: artifact.id },
                      );
                      setNotice(
                        tr(
                          result.saved
                            ? "review:export_saved"
                            : "review:export_cancelled",
                        ),
                      );
                    })
                  }
                />
              </div>
            </>
          ) : (
            <TestPlayer
              key={artifact.id}
              artifact={artifact}
              onConfirmed={onConfirmed}
              onRetake={(id) => void run(() => generate(id))}
            />
          )}
          <div className="review-actions">
            <Button
              variant="secondary"
              isDisabled={busy || artifact.status === "generating"}
              label={tr("review:delete_artifact")}
              onClick={() => setDeleting(true)}
            />
          </div>
          {deleting && (
            <div
              role="alertdialog"
              aria-label={tr("review:delete_artifact")}
              aria-describedby="review-delete-copy"
            >
              <p id="review-delete-copy">{tr("review:delete_artifact_copy")}</p>
              <Button variant="secondary" label={tr("review:cancel")} onClick={() => setDeleting(false)} />
              <Button
                variant="secondary"
                isDisabled={busy}
                label={tr("review:delete_confirm")}
                onClick={() =>
                  void run(async () => {
                    await desktop.invoke("review:artifact:delete", {
                      artifactId: artifact.id,
                    });
                    active.current = { artifactId: null, requestId: null };
                    epoch.current++;
                    setArtifact(null);
                    setDeleting(false);
                    page.retry();
                  })
                }
              />
            </div>
          )}
        </article>
      )}
      {notice && <p role="status">{notice}</p>}
      <p className="review-footnote">
        {tr("review:validation_notice")} · {tr("review:materials_only")}
      </p>
      <h3>{tr("review:saved_artifacts")}</h3>
      {page.loading && <p role="status">{tr("review:loading")}</p>}
      {page.error && (
        <p role="alert">
          {tr("review:error")}{" "}
          <Button variant="secondary" label={tr("review:retry")} onClick={page.retry} />
        </p>
      )}
      {!page.loading &&
        !page.error &&
        !page.items.some((a) => a.kind === kind) && (
          <p>{tr("review:artifacts_empty")}</p>
        )}
      <ul className="review-list">
        {page.items
          .filter((a) => a.kind === kind)
          .map((a) => (
            <li key={a.id}>
              <Button
                variant="secondary"
                isDisabled={busy}
                label={a.title}
                onClick={() => void run(() => choose(a.id))}
              />{" "}
              <span>
                {tr(
                  `review:artifact_${artifact?.id === a.id ? artifact.status : a.status}`,
                )}
              </span>
              <time dateTime={a.createdAt}>
                {format.date(a.createdAt)}
              </time>
            </li>
          ))}
      </ul>
      {page.cursor && (
        <Button variant="secondary" isDisabled={page.loading} label={tr("review:load_more")} onClick={page.more} />
      )}
    </section>
  );
}
function ResolvedScope({ artifact }: { artifact: Artifact }) {
  const format = useFormat();
  const scope = artifact.resolvedScope;
  const units = useReviewPage(
    useCallback(
      (cursor?: Cursor) =>
        desktop.invoke("review:courses:units", {
          courseId: artifact.courseId,
          limit: 50,
          ...(cursor ? { cursor } : {}),
        }),
      [artifact.courseId],
    ),
  );
  const [documents, setDocuments] = useState<IpcResponse<"documents:list">>([]);
  useEffect(() => {
    let current = true;
    void desktop
      .invoke("documents:list", {})
      .then((rows) => {
        if (current) setDocuments(rows);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);
  const documentTitle = (id: string) =>
    documents.find((d) => d.id === id)?.title ?? id;
  return (
    <details className="review-resolved" open>
      <summary>{tr("review:resolved_scope")}</summary>
      <p>
        {tr("review:resolved_units")}:{" "}
        {scope.unitIds
          .map((id) => units.items.find((u) => u.id === id)?.title ?? id)
          .join(", ") || tr("review:none")}
        <br />
        {tr("review:resolved_documents")}:{" "}
        {scope.documentIds.map(documentTitle).join(", ") || tr("review:none")}
      </p>
      {scope.from && (
        <p>
          <time dateTime={scope.from}>{format.date(scope.from, { timeZone: scope.timeZone })}</time> → <time dateTime={scope.to ?? undefined}>{scope.to && format.date(scope.to, { timeZone: scope.timeZone })}</time> ({scope.timeZone})
        </p>
      )}
      <ul>
        {scope.assumptions.flatMap((raw, i) => {
          const view = describeAssumption(raw);
          if (!view) return [];
          if (view.key === "assumption_excerpt_limited")
            return [
              <li key={i}>
                {tr("review:assumption_excerpt_limited", {
                  document: documentTitle(view.documentId!),
                })}
              </li>,
            ];
          if (view.key === "assumption_undated_units") {
            const titles = view.unitIds!.flatMap(
              (id) => units.items.find((u) => u.id === id)?.title ?? [],
            );
            return [
              <li key={i}>
                {titles.length
                  ? tr("review:assumption_undated_units", {
                      units: titles.join(", "),
                    })
                  : tr("review:asked_fallback")}
              </li>,
            ];
          }
          return [<li key={i}>{tr(`review:${view.key}`)}</li>];
        })}
      </ul>
      <div aria-label={tr("review:sources")}>
        {scope.sources.map((source) => (
          <span
            className="review-chip"
            key={source.documentId + source.version + source.excerptHash}
          >
            {documentTitle(source.documentId)} · {source.version}
          </span>
        ))}
      </div>
    </details>
  );
}
