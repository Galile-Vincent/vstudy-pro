// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Planner } from "./planner";
import type { PlannerApi } from "./planner-api";
import { openStore } from "../../main/db";
import { PlannerRepository } from "../../main/planner/repository";
import { seedStudent, now } from "../../main/planner/__fixtures__/student";
import { i18n } from "../../shared/i18n";
let root: Root, host: HTMLDivElement, store: ReturnType<typeof openStore>;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
beforeEach(async () => { await i18n.changeLanguage("en"); host = document.createElement("div"); document.body.append(host); root = createRoot(host); store = openStore(":memory:"); });
afterEach(async () => { await act(async () => root.unmount()); store.close(); host.remove(); });
async function mount() {
  const { detail } = seedStudent(store), repo = new PlannerRepository(store.db, () => now);
  const approve = vi.fn<PlannerApi["approve"]>(async (...args) => repo.approve(...args));
  const api: PlannerApi = { snapshot: async () => repo.snapshot(), quickAdd: async input => repo.quickAdd(input), approve, exportCalendar: vi.fn(async () => ({ saved: true })) };
  await act(async () => root.render(<Planner courses={[detail.course]} deadlines={detail.deadlines} api={api} clock={() => now} />));
  return { api, repo, approve };
}
async function click(text: string, scope: ParentNode = host) {
  const button = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === text);
  if (!button) throw new Error(`Missing button ${text}`);
  await act(async () => button.click());
}
async function fill(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(selector)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
}
it("teaches the empty state and adds a student task with its estimate", async () => {
  const { repo } = await mount();
  expect(host.textContent).toContain("Add one task");
  await fill('input[name="title"]', "Review vectors");
  await fill('input[name="estimate"]', "45");
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(repo.snapshot().tasks[0]).toMatchObject({ title: "Review vectors", source: "user", estimateMinutes: 45 });
  expect(host.textContent).toContain("Saved to your planner");
});
it("shows draft assumptions and dates without writing until approval, and supports dismissal", async () => {
  const { repo, approve } = await mount();
  await click("Plan my week");
  expect(host.querySelector(".planner-proposal")?.textContent).toContain("Assumptions");
  expect(host.querySelectorAll(".planner-proposed-blocks time").length).toBeGreaterThan(0);
  expect(repo.snapshot().blocks).toEqual([]);
  await click("Dismiss", host.querySelector(".planner-proposal")!);
  expect(repo.snapshot().blocks).toEqual([]);
  await click("Plan my week");
  const button = [...host.querySelectorAll<HTMLButtonElement>(".planner-proposal button")].find(b => b.textContent === "Approve and save")!;
  await act(async () => { button.click(); button.click(); });
  expect(approve).toHaveBeenCalledTimes(1);
  expect(repo.snapshot().blocks.length).toBeGreaterThan(0);
  expect(host.querySelector(".planner-proposal")).toBeNull();
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("[role=tab]")].find(b => b.textContent === "Next 7 days")!.focus());
  expect(host.querySelectorAll(".planner-day")).toHaveLength(7);
  const active = host.querySelector('[role="tab"][aria-selected="true"]')!;
  expect(document.getElementById(active.getAttribute("aria-controls")!)?.getAttribute("role")).toBe("tabpanel");
}, 15000);
it("a changed deadline rejects approval and leaves the proposal reviewable", async () => {
  const { api, repo } = await mount();
  await click("Plan my week");
  api.approve = async () => { throw new Error("Changed by sync"); };
  await click("Approve and save");
  expect(repo.snapshot().blocks).toEqual([]);
  expect(host.querySelector(".planner-proposal")).not.toBeNull();
  expect(host.textContent).toContain("changed deadline");
});

it('shows a submitted-linked task as done and keeps it out of the proposal',async()=>{
  const {detail}=seedStudent(store),repo=new PlannerRepository(store.db,()=>now);
  const task=repo.quickAdd({title:'Submitted lab',courseId:detail.course.id,deadlineId:detail.deadlines[0]!.id,dueAt:detail.deadlines[0]!.dueAt,estimateMinutes:60});
  detail.deadlines[0]!.submitted=true;
  const api:PlannerApi={snapshot:async()=>repo.snapshot(),quickAdd:async input=>repo.quickAdd(input),approve:vi.fn(),exportCalendar:vi.fn()};
  await act(async()=>root.render(<Planner courses={[detail.course]} deadlines={detail.deadlines} api={api} clock={()=>now}/>));
  expect(host.querySelector('[data-completed-tasks]')?.textContent).toContain(task.title);
  expect(host.querySelector('[data-completed-tasks]')?.textContent).toContain('Done');
  await click('Plan my week');expect(host.querySelector('.planner-proposal')).toBeNull();
});
