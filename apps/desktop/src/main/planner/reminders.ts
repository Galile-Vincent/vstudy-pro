/** Pending planner reminders survive restart. Missing or completed targets do not fire. */
import { targetInfo } from "../../shared/planner-policy";
import type { PlannerRepository } from "./repository";
export function firePlannerReminders(repository: PlannerRepository, notify: (title: string, body: string) => boolean) {
  const context = repository.context();
  for (const reminder of context.snapshot.reminders) {
    if (reminder.fired || Date.parse(reminder.remindAt) > context.now) continue;
    let title: string;
    try { title = targetInfo(reminder.target, context).title; }
    catch { continue; }
    if (notify(title, reminder.note)) repository.fired(reminder.id);
  }
}
