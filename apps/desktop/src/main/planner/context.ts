/** Ranked course context with a conservative UTF-8 token budget. Cached rows invalidate on local writes and external SQLite commits. */
import type { DatabaseSync } from "node:sqlite";
import { displayTitle } from "../../shared/moodle-course-display";
import type { MoodleCourseDetail } from "../../shared/moodle";
import { emptyPlanner, type PlannerSnapshot } from "../../shared/planner";
import { localDay } from "../../shared/planner-policy";
import { MoodleRepository } from "../moodle/repository";
import { PlannerRepository } from "./repository";

export const quoteUntrusted = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
export interface ContextOptions {
  now: Date;
  timeZone: string;
  locale: string;
  maxTokens?: number;
  fileState?: (id: string) => string;
}
interface RankedItem { group: string; value: unknown; score: number }
export function budgetContext(base: Record<string, unknown>, items: RankedItem[], maxTokens: number) {
  if (!Number.isInteger(maxTokens) || maxTokens < 512) throw new Error("Context budget must be at least 512 tokens");
  const result: Record<string, unknown> = { ...base, omitted: items.length };
  const encoded = () => quoteUntrusted(result);
  if (Buffer.byteLength(encoded(), "utf8") > maxTokens) throw new Error("Context header exceeds budget");
  let included = 0;
  for (const item of [...items].sort((a, b) => b.score - a.score)) {
    const existed = Object.hasOwn(result, item.group);
    const group = (result[item.group] ?? []) as unknown[];
    result[item.group] = [...group, item.value];
    result.omitted = items.length - included - 1;
    if (Buffer.byteLength(encoded(), "utf8") <= maxTokens) included++;
    else { if (existed) result[item.group] = group; else delete result[item.group]; result.omitted = items.length - included; }
  }
  const json = encoded();
  return { json, estimatedTokens: Buffer.byteLength(json, "utf8"), omitted: items.length - included };
}
export function buildPlanningContext(detail: MoodleCourseDetail, planner: PlannerSnapshot = emptyPlanner(), options: ContextOptions) {
  const clip = (text: string, length = 160) => text.slice(0, length);
  const now = options.now.getTime(), horizon = now + 14 * 86400000;
  const locale = options.locale === "auto" ? new Intl.DateTimeFormat().resolvedOptions().locale : options.locale;
  const date = (value: string) => new Intl.DateTimeFormat(locale, { timeZone: options.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const inHorizon = (value: string | null) => !value || Date.parse(value) <= horizon;
  const items: RankedItem[] = [];
  const add = (group: string, value: unknown, score: number) => items.push({ group, value, score });
  for (const d of detail.deadlines.filter(d => !d.submitted && !d.orphaned && inHorizon(d.dueAt)).sort((a, b) => a.dueAt.localeCompare(b.dueAt)))
    add("deadlines", { id: d.id, title: clip(d.title), dueAt: d.dueAt, overdue: Date.parse(d.dueAt) < now, submissionUnknown: d.submitted === null, dueLocal: date(d.dueAt) }, Date.parse(d.dueAt) < now ? 100 : Date.parse(d.dueAt) < now + 2 * 86400000 ? 95 : 80);
  for (const task of planner.tasks.filter(t => t.status !== "done" && inHorizon(t.dueAt)))
    add("tasks", { ...task, title: clip(task.title) }, task.dueAt && localDay(task.dueAt, options.timeZone) <= localDay(now, options.timeZone) ? 99 : 75);
  for (const exam of planner.exams.filter(e => Date.parse(e.date) >= now && inHorizon(e.date)))
    add("exams", { ...exam, title: clip(exam.title), scopeTopics: exam.scopeTopics.slice(0, 8).map(t => clip(t)) }, 94);
  for (const block of planner.blocks.filter(b => Date.parse(b.startsAt) + b.durationMinutes * 60000 >= now && inHorizon(b.startsAt)))
    add("blocks", block, localDay(block.startsAt, options.timeZone) === localDay(now, options.timeZone) ? 98 : 78);
  for (const goal of planner.goals.filter(g => g.status === "active")) add("goals", goal, 40);
  for (const a of [...detail.announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12))
    add("announcements", { subject: clip(a.subject), author: clip(a.author), createdAt: a.createdAt, body: clip(a.bodyHtml, 400) }, 60);
  for (const n of [...detail.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12))
    add("notifications", { id: n.id, subject: clip(n.subject), body: clip(n.body, 400), createdAt: n.createdAt, read: n.read }, n.read ? 30 : 55);
  for (const g of detail.grades.slice(0, 30)) add("grades", { name: clip(g.name), grade: g.grade === null ? null : clip(g.grade), max: g.max, percentage: g.percentage, gradedAt: g.gradedAt }, 25);
  for (const s of detail.sections.slice(0, 30)) add("sections", { name: clip(s.name), number: s.number, weekStart: s.weekStart, current: s.current, modules: s.modules.slice(0, 8).map(m => ({ name: clip(m.name), kind: m.kind, dueAt: m.dueAt, submitted: m.submitted, accessible: m.accessible })) }, s.current ? 65 : 10);
  for (const f of detail.files.slice(0, 40)) add("files", { id: f.id, documentId: f.documentId, name: clip(f.name), state: f.documentId ? options.fileState?.(f.documentId) ?? "unknown" : "not-opened" }, 50);
  for (const r of detail.reminders.slice(0, 30)) add("reminders", { ...r, note: clip(r.note) }, 45);
  return budgetContext({ course: { id: detail.course.id, name: clip(displayTitle(detail.course.identity, options.locale, detail.course.fullName)) }, now: options.now.toISOString(), timezone: options.timeZone, locale }, items, options.maxTokens ?? 6000);
}
export class CourseContextCache {
  private revision = "";
  private readonly entries = new Map<string, { detail: MoodleCourseDetail; planner: PlannerSnapshot; syncedAt: string | null }>();
  constructor(private readonly db: DatabaseSync) {}
  get(courseId: string) {
    const revision = JSON.stringify([this.db.prepare("SELECT total_changes() AS revision").get(), this.db.prepare("PRAGMA data_version").get()]);
    if (revision !== this.revision) { this.entries.clear(); this.revision = revision; }
    const existing = this.entries.get(courseId);
    if (existing) return existing;
    const moodle = new MoodleRepository(this.db);
    const detail = moodle.course(courseId);
    const value = { detail, planner: new PlannerRepository(this.db).snapshot(), syncedAt: moodle.account(detail.course.accountId).syncedAt };
    if (this.entries.size >= 8) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(courseId, value);
    return value;
  }
}
