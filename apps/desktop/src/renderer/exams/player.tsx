import type { IpcResponse } from "../../shared/ipc";
import type { StudyTest } from "../../shared/review-artifacts";
import { tr } from "../../shared/i18n";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  Badge,
  FormField,
  Input,
  Stat,
  Toolbar,
} from "../components/ui";
import { Progress } from "../components/ui/progress";
import {
  Button,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  Tab,
  TabList,
} from "@astryxdesign/core";
import { useExamFormat } from "./format";
import { useFooterInset } from "./footer-inset";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  actions,
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
  actions?: ReactNode;
}) {
  const format = useExamFormat();
  const footerInset = useFooterInset();
  const items = artifact.test?.items ?? [],
    item = items[index];
  const heading = useRef<HTMLHeadingElement>(null);
  const [filter, setFilter] = useState<"all" | "incorrect">("all");
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
        isDisabled={busy}
        label={tr("exams:ask_ai")}
        icon={<Sparkles aria-hidden="true" size={16} />}
        onClick={() => onExplain(id)}
      />
      {explanations[id] && (
        <div className="exam-explanation" role="status">
          {explanations[id]}
        </div>
      )}
    </>
  );
  return (
    <section className="exam-player" aria-busy={busy}>
      <LayoutHeader>
        <Toolbar
          left={
            <h2 className="text-[length:var(--type-lg)] font-medium">
              {artifact.title}
            </h2>
          }
          center={
            attempt &&
            !results &&
            item && (
              <>
                <span className="font-medium">
                  {tr("review:item_progress", {
                    current: index + 1,
                    total: items.length,
                  })}
                </span>
                <Badge variant="secondary">{tr(`exams:${item.type}`)}</Badge>
                <Progress
                  className="h-1.5 w-24"
                  value={(committed / items.length) * 100}
                  aria-label={tr("exams:progress")}
                  aria-valuenow={Math.round((committed / items.length) * 100)}
                  aria-valuetext={`${committed}/${items.length}`}
                />
                <span className="text-[var(--muted)]">
                  {tr("exams:answered", {
                    answered: committed,
                    total: items.length,
                  })}
                </span>
              </>
            )
          }
          right={actions}
        />
      </LayoutHeader>
      {failed && (
        <p role="alert">
          {tr("review:error")}{" "}
          <Button variant="secondary" isDisabled={busy} label={tr("review:retry")} onClick={onRetry} />
        </p>
      )}
      {!attempt && !failed && <p role="status">{tr("review:loading")}</p>}
      {attempt && results ? (
        <>
          <h3
            ref={heading}
            tabIndex={-1}
            className="text-[length:var(--type-xl)] font-medium"
          >
            {tr("exams:results")}
          </h3>
          <div className="flex flex-wrap gap-x-[var(--space-8)] gap-y-[var(--space-4)]">
            <Stat
              label={tr("exams:accuracy")}
              value={format
                .percentParts(items.length ? correct / items.length : 0)
                .map((part, i) =>
                  part.type === "percentSign" ? (
                    <span key={i}>{part.value}</span>
                  ) : (
                    part.value
                  ),
                )}
            />
            <Stat
              label={tr("exams:correct_count")}
              value={correct}
              unit={`/ ${items.length}`}
            />
            <Stat
              label={tr("exams:duration_label")}
              value={tr("exams:duration", {
                minutes: format.minutes(
                  attempt.startedAt,
                  attempt.committedAt ?? attempt.startedAt,
                ),
              })}
            />
          </div>
          <section
            className="flex flex-col gap-[var(--space-3)]"
            aria-label={tr("exams:accuracy_by_type")}
          >
            <h4 className="text-[length:var(--type-lg)] font-medium">
              {tr("exams:accuracy_by_type")}
            </h4>
            {[...new Set(items.map((i) => i.type))].map((type) => {
              const rows = attempt.results.filter(
                  (r) => items.find((i) => i.id === r.itemId)?.type === type,
                ),
                matched = rows.filter((r) => r.correct).length,
                ratio = rows.length ? matched / rows.length : 0,
                value = Math.round(ratio * 100);
              return (
                <div
                  className="flex flex-wrap items-center gap-x-[var(--space-3)] gap-y-[var(--space-1)]"
                  key={type}
                >
                  <span className="flex-[1_1_8rem]">{tr(`exams:${type}`)}</span>
                  <Progress
                    className="flex-[2_1_12rem] [&>[data-slot=progress-indicator]]:bg-[var(--success)]"
                    value={value}
                    aria-label={tr(`exams:${type}`)}
                    aria-valuenow={value}
                    aria-valuetext={`${matched}/${rows.length}`}
                  />
                  <span className="min-w-[8ch] text-end tabular-nums">
                    {matched}/{rows.length}{" "}
                    <span className="text-[var(--muted)]">
                      · {format.percent(ratio)}
                    </span>
                  </span>
                </div>
              );
            })}
          </section>
          <section
            className="flex flex-col gap-[var(--space-3)]"
            aria-label={tr("exams:question_breakdown")}
          >
            <h4 className="text-[length:var(--type-lg)] font-medium">
              {tr("exams:question_breakdown")}
            </h4>
            <TabList
              role="tablist"
              value={filter}
              onChange={(value) => setFilter(value as typeof filter)}
              aria-label={tr("exams:question_breakdown")}
            >
              <Tab
                id="tab-all"
                value="all"
                label={tr("exams:filter_all")}
                panelId="panel-breakdown"
                onFocus={() => setFilter("all")}
                onMouseDown={() => setFilter("all")}
              />
              <Tab
                id="tab-incorrect"
                value="incorrect"
                label={tr("exams:filter_incorrect")}
                panelId="panel-breakdown"
                onFocus={() => setFilter("incorrect")}
                onMouseDown={() => setFilter("incorrect")}
              />
            </TabList>
            <div
              role="tabpanel"
              id="panel-breakdown"
              aria-labelledby={`tab-${filter}`}
            >
              <ol className="exam-breakdown">
                {items.map((question, i) => {
                  const result = attempt.results.find(
                      (r) => r.itemId === question.id,
                    ),
                    full = result?.feedback;
                  if (filter === "incorrect" && result?.correct !== false)
                    return null;
                  return (
                    <li key={question.id}>
                      <details className="group">
                        <summary>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[var(--muted)]">
                              {tr("exams:question_number", { number: i + 1 })}{" "}
                              · {tr(`exams:${question.type}`)}
                            </span>
                            <span className="block font-medium">
                              {question.stem
                                .replaceAll("{{blank}}", "_____")
                                .trim()}
                            </span>
                          </span>
                          <State correct={result?.correct ?? null} />
                          <ChevronDown
                            className="size-4 shrink-0 group-open:rotate-180"
                            aria-hidden="true"
                          />
                        </summary>
                        {full && (
                          <div>
                            <AnswerReview
                              item={full}
                              answer={attempt.answers[question.id]}
                              correct={result?.correct ?? null}
                            />
                            <div className="exam-built-in">
                              <h5>{tr("exams:explanation")}</h5>
                              <p>{full.explanation}</p>
                            </div>
                            {explain(question.id)}
                          </div>
                        )}
                      </details>
                    </li>
                  );
                })}
              </ol>
              {filter === "incorrect" &&
                !attempt.results.some((r) => r.correct === false) && (
                  <p className="text-[var(--muted)]">
                    {tr("exams:no_incorrect")}
                  </p>
                )}
            </div>
          </section>
          <Button
            variant="secondary"
            className="justify-self-start"
            label={tr("review:review_answers")}
            icon={<ArrowLeft aria-hidden="true" size={16} />}
            onClick={() => onResults(false)}
          />
        </>
      ) : (
        attempt &&
        item && (
          <>
            <LayoutContent className="max-w-2xl mx-auto w-full flex flex-col gap-[var(--space-6)]">
              <h3 ref={heading} tabIndex={-1} className="exam-question-stem">
              {item.stem.replaceAll("{{blank}}", "_____").trim()}
            </h3>
            {!locked ? (
              <form
                id="exam-answer"
                className="max-w-[65ch]"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmit();
                }}
              >
                <fieldset
                  disabled={busy}
                  className="flex min-w-0 flex-col gap-[var(--space-2)]"
                >
                  <legend className="mb-[var(--space-3)] font-medium">
                    {tr("review:your_answer")}
                  </legend>
                  {(item.type === "mcq" || item.type === "multi_select") &&
                    item.options.map((option, i) => (
                      <label className="exam-choice" key={i}>
                        <input
                          type={item.type === "mcq" ? "radio" : "checkbox"}
                          name={`answer-${artifact.id}`}
                          checked={
                            item.type === "mcq"
                              ? draft === i
                              : Array.isArray(draft) && draft.includes(i)
                          }
                          onChange={(event) =>
                            onDraft(
                              item.type === "mcq"
                                ? i
                                : event.target.checked
                                  ? [...(Array.isArray(draft) ? draft : []), i]
                                  : (Array.isArray(draft) ? draft : []).filter(
                                      (n) => n !== i,
                                    ),
                            )
                          }
                        />
                        <span className="text-[var(--muted)]">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span>{option}</span>
                      </label>
                    ))}
                  {item.type === "true_false" &&
                    [true, false].map((value) => (
                      <label className="exam-choice" key={String(value)}>
                        <input
                          type="radio"
                          name={`answer-${artifact.id}`}
                          checked={draft === value}
                          onChange={() => onDraft(value)}
                        />
                        <span>
                          {tr(
                            value ? "review:answer_true" : "review:answer_false",
                          )}
                        </span>
                      </label>
                    ))}
                  {(item.type === "cloze" || item.type === "calculation") && (
                    <FormField
                      label={tr(
                        item.type === "calculation"
                          ? "exams:numeric_answer"
                          : "exams:blank_answer",
                      )}
                    >
                      {(field) => (
                        <div className="flex items-center gap-[var(--space-3)]">
                          <Input
                            {...field}
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
                            <span className="text-[var(--muted)]">
                              {item.unit}
                            </span>
                          )}
                        </div>
                      )}
                    </FormField>
                  )}
                  {item.type === "multi_select" && (
                    <p className="text-[var(--muted)]">
                      {tr("exams:select_all")}
                    </p>
                  )}
                </fieldset>
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
                  <p className="text-[var(--muted)]">{tr("review:graded_earlier")}</p>
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
                      isDisabled={busy || Boolean(feedback.reportedBad)}
                      onClick={() => onReport(item.id)}
                      label={tr(
                        feedback.reportedBad
                          ? "review:question_reported"
                          : "review:report_bad_question",
                      )}
                    />
                  </>
                )}
              </section>
            )}
            </LayoutContent>
            <LayoutFooter>
              <footer className="exam-footer" ref={footerInset}>
                <div className="flex-[1_1_16rem] text-[var(--muted)]">
                  <div role="status">
                    {draftError && <p>{tr("review:draft_save_failed")}</p>}
                  </div>
                  {!locked && <p>{tr("review:commit_notice")}</p>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  isDisabled={busy || index === 0}
                  onClick={() => onMove(index - 1)}
                  icon={<ArrowLeft aria-hidden="true" />}
                  label={tr("review:previous_item")}
                />
                {attempt.phase !== "answering" && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onResults(true)}
                    endContent={<ArrowRight aria-hidden="true" />}
                    label={tr("review:view_results")}
                  />
                )}
                {locked && index < items.length - 1 && (
                  <Button
                    type="button"
                    onClick={() => onMove(index + 1)}
                    endContent={<ArrowRight aria-hidden="true" />}
                    label={tr("review:next_item")}
                  />
                )}
                {!locked && (
                  <Button
                    type="submit"
                    form="exam-answer"
                    isDisabled={
                      busy ||
                      draft === null ||
                      draft === "" ||
                      (Array.isArray(draft) && !draft.length)
                    }
                    endContent={<ArrowRight aria-hidden="true" />}
                    label={tr(
                      index === items.length - 1
                        ? "review:finish_test"
                        : "review:answer_next",
                    )}
                  />
                )}
              </footer>
            </LayoutFooter>
          </>
        )
      )}
    </section>
  );
}
