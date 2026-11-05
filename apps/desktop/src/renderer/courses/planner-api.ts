/** Renderer planner gateway. Main owns validation, SQLite transactions, native notifications, and export destinations. */
import { desktop } from "../bridge";
import { plannerSnapshotSchema, type PlannerAction, type PlannerSnapshot, type PlannerTask } from "../../shared/planner";
import type { IpcRequest } from "../../shared/ipc";
export interface PlannerApi {
  snapshot(): Promise<PlannerSnapshot>;
  quickAdd(input: IpcRequest<"planner:quick-add">): Promise<PlannerTask>;
  approve(approvalId: string, action: PlannerAction, courseId?: string): Promise<{ ok: true; replayed: boolean }>;
  exportCalendar(input: IpcRequest<"planner:export-calendar">): Promise<{ saved: boolean }>;
}
export const plannerApi: PlannerApi = {
  snapshot: async () => plannerSnapshotSchema.parse(await desktop.invoke("planner:snapshot", {})),
  quickAdd: input => desktop.invoke("planner:quick-add", input),
  approve: (approvalId, action, courseId) => desktop.invoke("planner:approve", { approvalId, action, ...(courseId ? { courseId } : {}) }),
  exportCalendar: input => desktop.invoke("planner:export-calendar", input),
};
