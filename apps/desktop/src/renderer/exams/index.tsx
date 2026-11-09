import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { EXAM_COURSE_ID } from "../../shared/review-artifacts";
import type { IpcResponse } from "../../shared/ipc";
import { tr } from "../../shared/i18n";
import { desktop } from "../bridge";
import {
  Button,
  FormField,
  Input,
  PageContainer,
  PageHeader,
  Section,
} from "../components/ui";
import { ExamHistory } from "./history";
import { Textarea } from "../components/ui/textarea";
import { TestPlayer } from "../review/test-player";
import { useReviewPage, type Cursor } from "../review/paging";
import "./exams.css";
type Artifact = NonNullable<IpcResponse<"review:artifact:get">>;
const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-base md:text-sm";
const initialCounts = {
  mcq: 3,
  multi_select: 2,
  calculation: 1,
  cloze: 2,
  true_false: 2,
};
export function ExamsView() {
  const { i18n } = useTranslation();
  const [documents, setDocuments] = useState<IpcResponse<"documents:list">>([]),
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
  const ready = documents.filter((d) => d.status === "ready");
  return (
    <PageContainer as="main" className="exams-view">
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
              aria-pressed={mode === "setup" && !artifact}
              onClick={() => {
                setArtifact(null);
                setMode("setup");
                history.retry();
              }}
            >
              {tr("exams:new_exam")}
            </Button>
            <Button
              variant={mode === "history" && !artifact ? "secondary" : "ghost"}
              aria-pressed={mode === "history" && !artifact}
              onClick={() => {
                setArtifact(null);
                setMode("history");
                history.retry();
              }}
            >
              {tr("exams:history")}
            </Button>
          </nav>
        }
      />
      {error && <p role="alert">{error}</p>}
      {!artifact && mode === "setup" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(generate);
          }}
        >
          <fieldset
            disabled={busy}
            className="flex min-w-0 flex-col gap-[var(--space-8)]"
          >
            <Section title={tr("exams:sources")}>
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
              {!ready.length && <p>{tr("exams:no_documents")}</p>}
            </Section>
            <Section title={tr("exams:configuration")}>
              <FormField label={tr("exams:prompt")}>
                {(field) => (
                  <Textarea
                    {...field}
                    maxLength={4000}
                    rows={2}
                    value={prompt}
                    placeholder={tr("exams:prompt_hint")}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                )}
              </FormField>
              <fieldset className="flex flex-col gap-[var(--space-3)]">
                <legend className="mb-[var(--space-3)] font-medium">
                  {tr("exams:question_types")}
                </legend>
                <div className="exam-fields">
                  {Object.entries(counts).map(([type, count]) => (
                    <FormField key={type} label={tr(`exams:${type}`)}>
                      {(field) => (
                        <Input
                          {...field}
                          type="number"
                          min={0}
                          max={40}
                          value={count}
                          onChange={(e) =>
                            setCounts({
                              ...counts,
                              [type]: Math.max(
                                0,
                                Math.min(
                                  40,
                                  Math.trunc(Number(e.target.value)),
                                ),
                              ),
                            })
                          }
                        />
                      )}
                    </FormField>
                  ))}
                </div>
                <p className="text-[var(--muted)]">
                  {tr("exams:total", { count: total })}
                </p>
              </fieldset>
              <div className="exam-fields">
                <FormField label={tr("exams:difficulty")}>
                  {(field) => (
                    <select
                      {...field}
                      className={selectClass}
                      value={difficulty}
                      onChange={(e) =>
                        setDifficulty(e.target.value as typeof difficulty)
                      }
                    >
                      {["easy", "medium", "hard"].map((v) => (
                        <option key={v} value={v}>
                          {tr(`exams:${v}`)}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
                <FormField label={tr("exams:language")}>
                  {(field) => (
                    <select
                      {...field}
                      className={selectClass}
                      value={language}
                      onChange={(e) =>
                        setLanguage(e.target.value as typeof language)
                      }
                    >
                      <option value="en">English</option>
                      <option value="zh-Hant">繁體中文</option>
                      <option value="ja">日本語</option>
                    </select>
                  )}
                </FormField>
                <FormField label={tr("review:generation_model")}>
                  {(field) => (
                    <select
                      {...field}
                      className={selectClass}
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                    >
                      {choices.map((c, i) => (
                        <option key={c.providerId + c.modelId} value={i}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
              </div>
              {!choices.length && <p>{tr("review:choose_provider")}</p>}
            </Section>
            <div className="exam-footer">
              <Button
                type="submit"
                disabled={
                  busy ||
                  !selected.length ||
                  total < 1 ||
                  total > 40 ||
                  !choices.length
                }
              >
                {tr("exams:generate")}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {artifact && (
        <article className="exam-active-artifact">
          <div className="exam-artifact-toolbar">
            <h2>{artifact.title}</h2>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setArtifact(null);
                setMode("setup");
                history.retry();
              }}
            >
              {tr("exams:back")}
            </Button>
          </div>
          {artifact.status === "ready" ? (
            <TestPlayer
              key={artifact.id}
              artifact={artifact}
              onRetake={() => {}}
            />
          ) : artifact.status === "generating" ? (
            <div role="status">
              <p>{tr("review:stage_generating")}</p>
              <Button
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
              >
                {tr("review:cancel")}
              </Button>
            </div>
          ) : (
            <p role="alert">
              {tr("review:generation_failed")} ({artifact.errorCode})
            </p>
          )}
        </article>
      )}
      {!artifact && mode === "history" && (
        <section
          className="exam-history-section"
          aria-label={tr("exams:history")}
        >
          <h2>{tr("exams:history")}</h2>
          {history.loading && <p role="status">{tr("review:loading")}</p>}
          {history.error && (
            <p role="alert">
              {tr("exams:history_error")}{" "}
              <Button onClick={history.retry}>{tr("review:retry")}</Button>
            </p>
          )}
          {!history.items.length && !history.loading && !history.error && (
            <p>{tr("exams:history_empty")}</p>
          )}
          <ExamHistory
            items={history.items}
            busy={busy}
            documentTitle={(id) =>
              documents.find((d) => d.id === id)?.title ?? id
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
            <Button onClick={history.more}>{tr("review:load_more")}</Button>
          )}
        </section>
      )}
      <p className="text-[length:var(--type-sm)] text-[var(--muted)]">
        {tr("review:validation_notice")} · {tr("exams:grading_notice")}
      </p>
    </PageContainer>
  );
}
