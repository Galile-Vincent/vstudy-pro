import type { IpcResponse } from "../../shared/ipc";
import type { StudyTest } from "../../shared/review-artifacts";
import { tr } from "../../shared/i18n";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Progress } from "../components/ui/progress";
import { useExamFormat } from "./format";
import { useEffect, useRef } from "react";
type Artifact = NonNullable<IpcResponse<"review:artifact:get">>;
type Attempt = IpcResponse<"review:attempt:start">;
type Answer = Attempt["answers"][string];
type Item = NonNullable<Artifact["test"]>["items"][number];
type Feedback = StudyTest["items"][number];

function answerLabel(
  item: Item | Feedback,
  answer: Answer | undefined,
): string {
  if (answer === null || answer === undefined || answer === "")
    return tr("exams:unanswered");
  if (item.type === "mcq" || item.type === "multi_select") {
    const indices = Array.isArray(answer) ? answer : [answer];
    return indices
      .map((index) =>
        typeof index === "number" ? item.options[index] : String(index),
      )
      .join(" · ");
  }
  if (typeof answer === "boolean")
    return tr(answer ? "review:answer_true" : "review:answer_false");
  return `${answer}${item.type === "calculation" && typeof answer === "number" && item.unit ? " " + item.unit : ""}`;
}
function AnswerReview({
  item,
  answer,
  correct,
}: {
  item: Feedback;
  answer: Answer | undefined;
  correct: boolean | null;
}) {
  return (
    <dl className="exam-answer-comparison">
      <div>
        <dt>{tr("review:your_answer")}</dt>
        <dd data-correct={correct}>{answerLabel(item, answer)}</dd>
      </div>
      <div>
        <dt>{tr("review:correct_answer")}</dt>
        <dd>{answerLabel(item, item.answer)}</dd>
      </div>
    </dl>
  );
}
function State({ correct }: { correct: boolean | null }) {
  const Icon = correct ? CheckCircle2 : XCircle;
  return (
    <Badge
      variant="outline"
      className="exam-answer-state"
      data-correct={correct}
    >
      <Icon aria-hidden="true" />
      {tr(correct ? "exams:correct" : "exams:incorrect")}
    </Badge>
  );
}
export function ExamPlayer({
  artifact,
  attempt,
  index,
  draft,
  results,
  busy,
  failed,
  draftError,
  explanations,
  gradedEarlier,
  onDraft,
  onMove,
  onSubmit,
  onResults,
  onExplain,
  onRetry,
  onReport,
}: {
  artifact: Artifact;
  attempt: Attempt | null;
  index: number;
  draft: Answer;
  results: boolean;
  busy: boolean;
  failed: boolean;
  draftError: boolean;
  explanations: Record<string, string>;
  gradedEarlier: boolean;
  onDraft: (value: Answer) => void;
  onMove: (index: number) => void;
  onSubmit: () => void;
  onResults: (value: boolean) => void;
  onExplain: (id: string) => void;
  onRetry: () => void;
  onReport: (id: string) => void;
}) {
  const format = useExamFormat();
  const items = artifact.test?.items ?? [],
    item = items[index];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [index, results, attempt?.id]);
  const committed =
    attempt?.results.filter((r) => r.correct !== null).length ?? 0;
  const correct = attempt?.results.filter((r) => r.correct).length ?? 0;
  const feedback = attempt?.results.find((r) => r.itemId === item?.id);
  const locked = feedback?.correct !== null && feedback?.correct !== undefined;
  const feedbackRegion=useRef<HTMLElement>(null);
  useEffect(()=>{if(locked)feedbackRegion.current?.focus();},[locked]);
  const explain = (id: string) => (
    <>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => onExplain(id)}
      >
        <Sparkles aria-hidden="true" />
        {tr("exams:ask_ai")}
      </Button>
      {explanations[id] && (
        <div className="exam-explanation" role="status">
          {explanations[id]}
        </div>
      )}
    </>
  );
  return (
    <section className="exam-player" aria-busy={busy}>
      {attempt && (
        <div role="status">
          {draftError && <p>{tr("review:draft_save_failed")}</p>}
        </div>
      )}
      {failed && (
        <p role="alert">
          {tr("review:error")}{" "}
          <Button variant="secondary" disabled={busy} onClick={onRetry}>
            {tr("review:retry")}
          </Button>
        </p>
      )}
      {!attempt && !failed && <p role="status">{tr("review:loading")}</p>}
      {attempt && results ? (
        <>
          <header className="exam-score-header">
            <div>
              <h3 ref={heading} tabIndex={-1}>
                {tr("exams:results")}
              </h3>
              <p className="exam-score-copy">
                {tr("exams:score_summary", { correct, total: items.length })}
              </p>
              <p className="exam-muted exam-duration">
                <Clock3 size={15} aria-hidden="true" />
                {tr("exams:duration", {
                  minutes: Math.max(
                    0,
                    Math.round(
                      (Date.parse(attempt.committedAt ?? attempt.startedAt) -
                        Date.parse(attempt.startedAt)) /
                        60000,
                    ),
                  ),
                })}
              </p>
            </div>
            <div className="exam-score-value">
              <strong>
                {format
                  .percentParts(items.length ? correct / items.length : 0)
                  .map((part, i) =>
                    part.type === "percentSign" ? (
                      <span key={i}>{part.value}</span>
                    ) : (
                      part.value
                    ),
                  )}
              </strong>
              <span>{tr("exams:accuracy")}</span>
            </div>
          </header>
          <section
            className="exam-type-accuracy"
            aria-label={tr("exams:accuracy_by_type")}
          >
            <h4>{tr("exams:accuracy_by_type")}</h4>
            {[...new Set(items.map((i) => i.type))].map((type) => {
              const rows = attempt.results.filter(
                  (r) => items.find((i) => i.id === r.itemId)?.type === type,
                ),
                matched = rows.filter((r) => r.correct).length,
                ratio = rows.length ? matched / rows.length : 0,
                value = Math.round(ratio * 100);
              return (
                <div className="exam-accuracy-row" key={type}>
                  <div>
                    <span>{tr(`exams:${type}`)}</span>
                    <span>
                      {matched}/{rows.length}{" "}
                      <span className="exam-muted">
                        · {format.percent(ratio)}
                      </span>
                    </span>
                  </div>
                  <Progress
                    value={value}
                    aria-label={tr(`exams:${type}`)}
                    aria-valuenow={value}
                    aria-valuetext={`${matched}/${rows.length}`}
                  />
                </div>
              );
            })}
          </section>
          <section
            className="exam-question-results"
            aria-label={tr("exams:question_breakdown")}
          >
            <h4>{tr("exams:question_breakdown")}</h4>
            <ol>
              {items.map((question, i) => {
                const result = attempt.results.find(
                    (r) => r.itemId === question.id,
                  ),
                  full = result?.feedback;
                return (
                  <li key={question.id}>
                    <article>
                      <header>
                        <span className="exam-muted">
                          {tr("exams:question_number", { number: i + 1 })} ·{" "}
                          {tr(`exams:${question.type}`)}
                        </span>
                        <State correct={result?.correct ?? null} />
                      </header>
                      <h5>
                        {question.stem.replaceAll("{{blank}}", "_____").trim()}
                      </h5>
                      {full && (
                        <>
                          <AnswerReview
                            item={full}
                            answer={attempt.answers[question.id]}
                            correct={result?.correct ?? null}
                          />
                          <div className="exam-built-in">
                            <h6>{tr("exams:explanation")}</h6>
                            <p>{full.explanation}</p>
                          </div>
                          {explain(question.id)}
                        </>
                      )}
                    </article>
                  </li>
                );
              })}
            </ol>
          </section>
          <Button
            variant="secondary"
            className="exam-review-navigation"
            onClick={() => onResults(false)}
          >
            <ArrowLeft aria-hidden="true" />
            {tr("review:review_answers")}
          </Button>
        </>
      ) : (
        attempt &&
        item && (
          <>
            <header className="exam-progress-header">
              <div>
                <span>
                  {tr("review:item_progress", {
                    current: index + 1,
                    total: items.length,
                  })}
                </span>
                <Badge variant="secondary">{tr(`exams:${item.type}`)}</Badge>
              </div>
              <Progress
                value={(committed / items.length) * 100}
                aria-label={tr("exams:progress")}
                aria-valuenow={Math.round((committed / items.length) * 100)}
                aria-valuetext={`${committed}/${items.length}`}
              />
              <p className="exam-muted">
                {tr("exams:answered", {
                  answered: committed,
                  total: items.length,
                })}
              </p>
            </header>
            <h3 ref={heading} tabIndex={-1} className="exam-question-stem">
              {item.stem.replaceAll("{{blank}}", "_____").trim()}
            </h3>
            {!locked ? (
              <form
                className="exam-answer-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmit();
                }}
              >
                <fieldset disabled={busy}>
                  <legend>{tr("review:your_answer")}</legend>
                  {(item.type === "mcq" || item.type === "multi_select") && (
                    <div className="exam-answer-options">
                      {item.options.map((option, i) => {
                        const selected =
                          item.type === "mcq"
                            ? draft === i
                            : Array.isArray(draft) && draft.includes(i);
                        return (
                          <label
                            className="exam-option"
                            data-selected={selected}
                            key={i}
                          >
                            <input
                              type={item.type === "mcq" ? "radio" : "checkbox"}
                              name={`answer-${artifact.id}`}
                              checked={selected}
                              onChange={(event) =>
                                onDraft(
                                  item.type === "mcq"
                                    ? i
                                    : event.target.checked
                                      ? [
                                          ...(Array.isArray(draft)
                                            ? draft
                                            : []),
                                          i,
                                        ]
                                      : (Array.isArray(draft)
                                          ? draft
                                          : []
                                        ).filter((n) => n !== i),
                                )
                              }
                            />
                            <span className="exam-option-letter">
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span>{option}</span>
                            {selected && (
                              <Check
                                className="exam-option-check"
                                size={18}
                                aria-hidden="true"
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {item.type === "true_false" && (
                    <div className="exam-answer-options">
                      {[true, false].map((value) => (
                        <label
                          className="exam-option"
                          data-selected={draft === value}
                          key={String(value)}
                        >
                          <input
                            type="radio"
                            name={`answer-${artifact.id}`}
                            checked={draft === value}
                            onChange={() => onDraft(value)}
                          />
                          <span>
                            {tr(
                              value
                                ? "review:answer_true"
                                : "review:answer_false",
                            )}
                          </span>
                          {draft === value && (
                            <Check
                              className="exam-option-check"
                              size={18}
                              aria-hidden="true"
                            />
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                  {(item.type === "cloze" || item.type === "calculation") && (
                    <label className="exam-text-answer">
                      {tr(
                        item.type === "calculation"
                          ? "exams:numeric_answer"
                          : "exams:blank_answer",
                      )}
                      <div className="exam-input-unit">
                        <Input
                          autoComplete="off"
                          inputMode={
                            item.type === "calculation" ? "decimal" : "text"
                          }
                          maxLength={2000}
                          value={typeof draft === "string" ? draft : ""}
                          placeholder={tr(
                            item.type === "calculation"
                              ? "exams:numeric_hint"
                              : "exams:blank_hint",
                          )}
                          onChange={(e) => onDraft(e.target.value)}
                        />
                        {item.type === "calculation" && item.unit && (
                          <span>{item.unit}</span>
                        )}
                      </div>
                    </label>
                  )}
                  {item.type === "multi_select" && (
                    <p className="exam-muted">{tr("exams:select_all")}</p>
                  )}
                </fieldset>
                <p className="exam-muted exam-commit-notice">
                  {tr("review:commit_notice")}
                </p>
                <Button
                  variant="secondary"
                  type="submit"
                  disabled={
                    busy ||
                    draft === null ||
                    draft === "" ||
                    (Array.isArray(draft) && !draft.length)
                  }
                >
                  {tr(
                    index === items.length - 1
                      ? "review:finish_test"
                      : "review:answer_next",
                  )}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </form>
            ) : (
              <section
                ref={feedbackRegion}
                tabIndex={-1}
                className="exam-item-feedback"
                aria-label={tr("review:item_feedback")}
              >
                <State correct={feedback?.correct ?? null} />
                {gradedEarlier && (
                  <p className="exam-muted">{tr("review:graded_earlier")}</p>
                )}
                {feedback?.feedback && (
                  <>
                    <AnswerReview
                      item={feedback.feedback}
                      answer={attempt.answers[item.id]}
                      correct={feedback.correct}
                    />
                    <div className="exam-built-in">
                      <h4>{tr("exams:explanation")}</h4>
                      <p>{feedback.feedback.explanation}</p>
                    </div>
                    {explain(item.id)}
                    <details className="exam-source">
                      <summary>
                        {tr("review:source_reference", {
                          document:
                            artifact.resolvedScope.sourceTitles?.[
                              feedback.feedback.source.documentId
                            ] ?? feedback.feedback.source.documentId,
                          version: feedback.feedback.source.version,
                        })}
                      </summary>
                      <blockquote>{feedback.feedback.source.quote}</blockquote>
                    </details>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy || feedback.reportedBad}
                      onClick={() => onReport(item.id)}
                    >
                      {tr(
                        feedback.reportedBad
                          ? "review:question_reported"
                          : "review:report_bad_question",
                      )}
                    </Button>
                  </>
                )}
              </section>
            )}
            <nav
              className="exam-player-navigation"
              aria-label={tr("exams:question_navigation")}
            >
              <Button
                variant="ghost"
                disabled={busy || index === 0}
                onClick={() => onMove(index - 1)}
              >
                <ArrowLeft aria-hidden="true" />
                {tr("review:previous_item")}
              </Button>
              {locked && index < items.length - 1 && (
                <Button variant="secondary" onClick={() => onMove(index + 1)}>
                  {tr("review:next_item")}
                  <ArrowRight aria-hidden="true" />
                </Button>
              )}
              {attempt.phase !== "answering" && (
                <Button variant="secondary" onClick={() => onResults(true)}>
                  {tr("review:view_results")}
                  <ArrowRight aria-hidden="true" />
                </Button>
              )}
            </nav>
          </>
        )
      )}
    </section>
  );
}
