/** Planner IPC is an explicit approval boundary. Model streaming never calls these handlers. */
import { dialog, Notification } from "electron";
import type { Store } from "../db";
import type { IpcChannel } from "../../shared/ipc";
import { plannerIpc } from "../../shared/planner";
import type { createIpcRegistrar } from "./register";
import { PlannerRepository } from "../planner/repository";
import { plannerCalendar } from "../planner/calendar";
import { firePlannerReminders } from "../planner/reminders";
import { exportText } from "../services/export-file";

export function registerPlannerIpc(registrar: ReturnType<typeof createIpcRegistrar>, store: Store, implemented: Set<IpcChannel>) {
  const repository = new PlannerRepository(store.db);
  for (const channel of Object.keys(plannerIpc) as (keyof typeof plannerIpc)[]) implemented.add(channel);
  registrar.handle("planner:snapshot", () => repository.snapshot());
  registrar.handle("planner:quick-add", input => repository.quickAdd(input));
  registrar.handle("planner:approve", ({ approvalId, action, courseId }) => repository.approve(approvalId, action, courseId));
  registrar.handle("planner:export-calendar", async selection => {
    const context = repository.context();
    const text = plannerCalendar(context.snapshot, context.deadlines, selection);
    const result = await dialog.showSaveDialog({ defaultPath: "vstudy-study-plan.ics", filters: [{ name: "Calendar", extensions: ["ics"] }] });
    if (result.canceled || !result.filePath) return { saved: false };
    await exportText(text, result.filePath);
    return { saved: true };
  });
  const tick = () => firePlannerReminders(repository, (title, body) => {
    if (!Notification.isSupported()) return false;
    new Notification({ title, body }).show();
    return true;
  });
  tick();
  const timer = setInterval(tick, 15_000);
  timer.unref();
  return () => clearInterval(timer);
}
