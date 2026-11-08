import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardCheck, FileText } from "lucide-react";
import { EXAM_COURSE_ID } from "../../shared/review-artifacts";
import type { IpcResponse } from "../../shared/ipc";
import { tr } from "../../shared/i18n";
import { desktop } from "../bridge";
import { Button } from "../components/ui/button";
import { ExamHistory } from "./history";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { TestPlayer } from "../review/test-player";
import { useReviewPage, type Cursor } from "../review/paging";
import "../review/artifacts.css";
import "./exams.css";
type Artifact = NonNullable<IpcResponse<"review:artifact:get">>;
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
  return (
    <main className="exams-view review-artifacts">
      <header className="exams-heading">
        <ClipboardCheck size={28} />
        <div>
          <h1>{tr("exams:title")}</h1>
          <p>{tr("exams:subtitle")}</p>
        </div>
        <nav
          className="exam-view-navigation"
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
      </header>
      {error && <p role="alert">{error}</p>}
      {!artifact && mode === "setup" && (
        <form
          className="exam-setup"
          onSubmit={(e) => {
            e.preventDefault();
            void run(generate);
          }}
        >
          <fieldset disabled={busy}>
            <legend>{tr("exams:sources")}</legend>
            <p>{tr("exams:source_hint")}</p>
            <div className="exam-documents">
              {documents
                .filter((d) => d.status === "ready")
                .map((d) => (
                  <label key={d.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(d.id)}
                      disabled={
                        !selected.includes(d.id) && selected.length >= 8
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, d.id]
                            : selected.filter((id) => id !== d.id),
                        )
                      }
                    />
                    <FileText size={16} />
                    <span>{d.title}</span>
                  </label>
                ))}
            </div>
            {!documents.some((d) => d.status === "ready") && (
              <p>{tr("exams:no_documents")}</p>
            )}
          </fieldset>
          <label>
            {tr("exams:prompt")}
            <Textarea
              maxLength={4000}
              rows={3}
              value={prompt}
              placeholder={tr("exams:prompt_hint")}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <fieldset disabled={busy}>
            <legend>{tr("exams:question_types")}</legend>
            <div className="exam-counts">
              {Object.entries(counts).map(([type, count]) => (
                <label key={type}>
                  {tr(`exams:${type}`)}
                  <Input
                    type="number"
                    min={0}
                    max={40}
                    value={count}
                    onChange={(e) =>
                      setCounts({
                        ...counts,
                        [type]: Math.max(
                          0,
                          Math.min(40, Math.trunc(Number(e.target.value))),
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <p>{tr("exams:total", { count: total })}</p>
          </fieldset>
          <div className="exam-options">
            <label>
              {tr("exams:difficulty")}
              <select
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
            </label>
            <label>
              {tr("exams:language")}
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as typeof language)}
              >
                <option value="en">English</option>
                <option value="zh-Hant">繁體中文</option>
                <option value="ja">日本語</option>
              </select>
            </label>
            <label>
              {tr("review:generation_model")}
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {choices.map((c, i) => (
                  <option key={c.providerId + c.modelId} value={i}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!choices.length && <p>{tr("review:choose_provider")}</p>}
          <Button
            variant="secondary"
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
            <Button onClick={history.retry}>{tr("review:retry")}</Button>
          )}
          {!history.items.length && !history.loading && (
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
      <p className="review-footnote">
        {tr("review:validation_notice")} · {tr("exams:grading_notice")}
      </p>
    </main>
  );
}
