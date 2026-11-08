import type { StudyTest } from "../../shared/review-artifacts";
import { normalizeStem } from "./test-validate";
/** Deterministic exact-set, accepted-text, and absolute numeric tolerance grading. */
export function gradeAnswer(
  item: StudyTest["items"][number],
  answer: unknown,
): boolean {
  if (item.type === "cloze")
    return (
      typeof answer === "string" &&
      [item.answer, ...item.alternatives].some(
        (a) => normalizeStem(a) === normalizeStem(answer),
      )
    );
  if (item.type === "multi_select")
    return (
      Array.isArray(answer) &&
      answer.length === item.answer.length &&
      new Set(answer).size === answer.length &&
      item.answer.every((a) => answer.includes(a))
    );
  if (item.type === "calculation") {
    if (typeof answer !== "string") return false;
    let value = answer.trim();
    if (item.unit && value.endsWith(item.unit))
      value = value.slice(0, -item.unit.length).trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value))
      return false;
    const number = Number(value);
    return (
      Number.isFinite(number) &&
      Math.abs(number - item.answer) <=
        item.tolerance + Number.EPSILON * Math.abs(item.answer) * 4
    );
  }
  return answer === item.answer;
}
