import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { EXAM_COURSE_ID } from "../../shared/review-artifacts";
import type { IpcResponse } from "../../shared/ipc";
import { tr } from "../../shared/i18n";
import { desktop } from "../bridge";
import {
  EmptyState,
  PageContainer,
  PageHeader,
  Toolbar,
} from "../components/ui";
import { Button, NumberInput, Selector, TextArea } from "@astryxdesign/core";
import { Panel } from "../components/panel";
import { ExamHistory } from "./history";
import { useFooterInset } from "./footer-inset";
import { TestPlayer } from "../review/test-player";
import { useReviewPage, type Cursor } from "../review/paging";
import "./exams.css";
type Artifact = NonNullable<IpcResponse<"review:artifact:get">>;
const initialCounts = {
  mcq: 3,
  multi_select: 2,
  calculation: 1,
  cloze: 2,
  true_false: 2,
};
export function ExamsView({ onOpenLibrary }: { onOpenLibrary?: () => void }) {
  const { i18n } = useTranslation();
  const footerInset = useFooterInset();
  const [documents, setDocuments] = useState<IpcResponse<
      "documents:list"
    > | null>(null),
    [providers, setProviders] = useState<IpcResponse<"providers:list">>([]);
  const [selected, setSelected] = useState<string[]>([]),
    [prompt, setPrompt] = useState(""),
    [counts, setCounts] = useState(initialCounts),
    [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
      "medium",
    ),
    [language, setLanguage] = useState<"en" | "zh-Hant" | "ja">(
      i18n.language.startsWith("zh")
        ? "zh-Hant"
        : i18n.language.startsWith("ja")
          ? "ja"
          : "en",
    ),
    [model, setModel] = useState("0");
  const [mode, setMode] = useState<"setup" | "history">("setup");
  const [artifact, setArtifact] = useState<Artifact | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const history = useReviewPage(
    useCallback(
      (cursor?: Cursor) =>
        desktop.invoke("review:exam:history", {
          limit: 20,
          ...(cursor ? { cursor } : {}),
        }),
      [],
    ),
  );
  const choices = providers.flatMap((p) =>
    p.config.enabled && p.availability.available
      ? p.models.map((m) => ({
          providerId: p.config.id,
          modelId: m.id,
          label: m.name || m.id,
        }))
      : [],
  );
  useEffect(() => {
    let live = true;
    void Promise.all([
      desktop.invoke("documents:list", {}),
      desktop.invoke("providers:list", {}),
    ])
      .then(([docs, models]) => {
        if (live) {
          setDocuments(docs);
          setProviders(models);
        }
      })
      .catch(() => {
        if (live) setError(tr("review:error"));
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (artifact?.status !== "generating") return;
    let live = true;
    const timer = window.setInterval(() => {
      void desktop
        .invoke("review:artifact:get", { artifactId: artifact.id })
        .then((value) => {
          if (live) {
            setArtifact(value);
            if (value?.status !== "generating") history.retry();
          }
        })
        .catch(() => {
          if (live) setError(tr("review:error"));
        });
    }, 1500);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [artifact?.id, artifact?.status]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch {
      setError(tr("review:error"));
    } finally {
      setBusy(false);
    }
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const generate = async () => {
    const choice = choices[Number(model)];
    if (!choice) return;
    const value = await desktop.invoke("review:artifact:generate", {
      requestId: crypto.randomUUID(),
      courseId: EXAM_COURSE_ID,
      kind: "test",
      title: tr("exams:title"),
      scope: { kind: "documents", documentIds: selected },
      idempotencyKey: crypto.randomUUID(),
      providerId: choice.providerId,
      modelId: choice.modelId,
      locale: language,
      exam: { prompt, counts, difficulty },
    });
    setArtifact(value);
    history.retry();
  };
  const leave = (
    <Button
      variant="ghost"
      isDisabled={busy}
      label={tr("exams:back")}
      onClick={() => {
        setArtifact(null);
        setMode("setup");
        history.retry();
      }}
    />
  );
  const ready = documents?.filter((d) => d.status === "ready") ?? [];
  return (
    <PageContainer as="main" className="exams-view" data-tab-scroll="">
      <PageHeader
        title={tr("exams:title")}
        description={tr("exams:subtitle")}
        actions={
          <nav
            className="flex gap-[var(--space-1)]"
            aria-label={tr("exams:navigation")}
          >
            <Button
              variant={mode === "setup" && !artifact ? "secondary" : "ghost"}
              isDisabled={busy}
              aria-pressed={mode === "setup" && !artifact}
              label={tr("exams:new_exam")}
              onClick={() => {
                setArtifact(null);
                setMode("setup");
                history.retry();
              }}
            />
            <Button
              variant={mode === "history" && !artifact ? "secondary" : "ghost"}
              isDisabled={busy}
              aria-pressed={mode === "history" && !artifact}
              label={tr("exams:history")}
              onClick={() => {
                setArtifact(null);
                setMode("history");
                history.retry();
              }}
            />
          </nav>
        }
      />
      {error && <p role="alert">{error}</p>}
      {!artifact && mode === "setup" && !documents && !error && <p role="status">{tr("review:loading")}</p>}
      {!artifact && mode === "setup" && documents && !ready.length && (
        <EmptyState
          headingLevel={2}
          icon={<FileText size={32} />}
          title={tr("exams:empty_title")}
          description={tr("exams:no_documents")}
          action={onOpenLibrary ? <Button variant="primary" label={tr("common:library")} onClick={onOpenLibrary} /> : undefined}
        />
      )}
      {!artifact && mode === "setup" && ready.length > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(generate);
          }}
        >
          <fieldset
            disabled={busy}
            className="flex min-w-0 flex-col gap-[var(--space-6)]"
          >
            <Panel title={tr("exams:sources")}>
              <p className="text-[var(--muted)]">{tr("exams:source_hint")}</p>
              <div className="exam-documents">
                {ready.map((d) => (
                  <label className="exam-choice" key={d.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(d.id)}
                      disabled={!selected.includes(d.id) && selected.length >= 8}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, d.id]
                            : selected.filter((id) => id !== d.id),
                        )
                      }
                    />
                    <FileText size={16} aria-hidden="true" />
                    <span>{d.title}</span>
                  </label>
                ))}
              </div>
            </Panel>
            <Panel title={tr("exams:configuration")}>
              <TextArea
                label={tr("exams:prompt")}
                maxLength={4000}
                rows={2}
                value={prompt}
                placeholder={tr("exams:prompt_hint")}
                onChange={(val) => setPrompt(val)}
              />
              <fieldset className="flex flex-col gap-[var(--space-3)]">
                <legend className="mb-[var(--space-3)] font-medium">
                  {tr("exams:question_types")}
                </legend>
                <div className="exam-fields">
                  {Object.entries(counts).map(([type, count]) => (
                    <NumberInput
                      key={type}
                      label={tr(`exams:${type}`)}
                      min={0}
                      max={40}
                      isIntegerOnly
                      value={count}
                      onChange={(value) => setCounts({ ...counts, [type]: value })}
                    />
                  ))}
                </div>
                <p className="text-[var(--muted)]">
                  {tr("exams:total", { count: total })}
                </p>
              </fieldset>
              <div className="exam-fields">
                <Selector
                  label={tr("exams:difficulty")}
                  value={difficulty}
                  onChange={(value) => setDifficulty(value as typeof difficulty)}
                  options={(["easy", "medium", "hard"] as const).map(id => ({ value: id, label: tr(`exams:${id}`) }))}
                />
                <Selector
                  label={tr("exams:language")}
                  value={language}
                  onChange={(value) => setLanguage(value as typeof language)}
                  options={[
                    { value: "en", label: "English" },
                    { value: "zh-Hant", label: "繁體中文" },
                    { value: "ja", label: "日本語" },
                  ]}
                />
                <Selector
                  label={tr("review:generation_model")}
                  value={model}
                  onChange={setModel}
                  options={choices.map((c, i) => ({ value: String(i), label: c.label }))}
                />
              </div>
              {!choices.length && <p>{tr("review:choose_provider")}</p>}
            </Panel>
            <div className="exam-footer" ref={footerInset}>
              <Button
                type="submit"
                variant="primary"
                isDisabled={
                  busy ||
                  !selected.length ||
                  total < 1 ||
                  total > 40 ||
                  !choices.length
                }
                label={tr("exams:generate")}
              />
            </div>
          </fieldset>
        </form>
      )}
      {artifact && artifact.status === "ready" && (
        <TestPlayer
          key={artifact.id}
          artifact={artifact}
          onRetake={() => {}}
          actions={leave}
        />
      )}
      {artifact && artifact.status !== "ready" && (
        <>
          <Toolbar
            left={
              <h2 className="text-[length:var(--type-lg)] font-medium">
                {artifact.title}
              </h2>
            }
            right={leave}
          />
          {artifact.status === "generating" ? (
            <div role="status">
              <p>{tr("review:stage_generating")}</p>
              <Button
                variant="secondary"
                isDisabled={busy}
                label={tr("review:cancel")}
                onClick={() =>
                  void run(async () => {
                    await desktop.invoke("review:artifact:cancel", {
                      artifactId: artifact.id,
                    });
                    setArtifact(
                      await desktop.invoke("review:artifact:get", {
                        artifactId: artifact.id,
                      }),
                    );
                    history.retry();
                  })
                }
              />
            </div>
          ) : (
            <p role="alert">
              {tr("review:generation_failed")} ({artifact.errorCode})
            </p>
          )}
        </>
      )}
      {!artifact && mode === "history" && (
        <Panel title={tr("exams:history")}>
          {history.loading && <p role="status">{tr("review:loading")}</p>}
          {history.error && (
            <p role="alert">
              {tr("exams:history_error")}{" "}
              <Button variant="secondary" label={tr("review:retry")} onClick={history.retry} />
            </p>
          )}
          {!history.items.length && !history.loading && !history.error && (
            <EmptyState headingLevel={3} title={tr("exams:history_empty")} description={tr("exams:source_hint")} action={<Button variant="primary" label={tr("exams:new_exam")} onClick={() => setMode("setup")} />} />
          )}
          <ExamHistory
            items={history.items}
            busy={busy}
            documentTitle={(id) =>
              documents?.find((d) => d.id === id)?.title ?? id
            }
            onOpen={(id) =>
              void run(async () =>
                setArtifact(
                  await desktop.invoke("review:artifact:get", {
                    artifactId: id,
                  }),
                ),
              )
            }
            onDelete={async (id) => {
              setBusy(true);
              setError("");
              try {
                await desktop.invoke("review:artifact:delete", {
                  artifactId: id,
                });
                history.retry();
              } catch (error) {
                setError(tr("review:error"));
                throw error;
              } finally {
                setBusy(false);
              }
            }}
          />
          {history.cursor && (
            <Button variant="secondary" label={tr("review:load_more")} onClick={history.more} />
          )}
        </Panel>
      )}
      <aside className="exam-notices">
        <p>{tr("review:validation_notice")}</p>
        <p>{tr("exams:grading_notice")}</p>
      </aside>
    </PageContainer>
  );
}
