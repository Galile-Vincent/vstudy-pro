// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Courses, deadlineGroup } from "./index";
import { CourseAgentPanel } from "./agent";
import { createMockMoodleApi } from "../dev-mock";
import { i18n } from "../../shared/i18n";
import type { MoodleApi } from "./api";
import type { MoodleAgentAction } from "../../shared/moodle";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
let root: Root;
let host: HTMLDivElement;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(async () => {
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function mount(api: MoodleApi, courseId?: string, onDocument = vi.fn()) {
  await act(async () =>
    root.render(
      <Courses
        api={api}
        courseId={courseId}
        onCourse={() => {}}
        onDocument={onDocument}
      />,
    ),
  );
}
async function click(text: string, scope: ParentNode = document) {
  const button = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.includes(text),
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}
async function tab(name: string) {
  const trigger = [...host.querySelectorAll<HTMLElement>("[role=tab]")].find(
    (b) => b.textContent === name,
  );
  if (!trigger) throw new Error(`Tab not found: ${name}`);
  await act(async () => trigger.focus());
}

describe("Courses", () => {
  it("shows course progress, due-soon cards, and per-course unread counts", async () => {
    const api = createMockMoodleApi(),
      overview = await api.overview();
    api.overview = async () => ({
      ...overview,
      upcoming: [...overview.upcoming].reverse(),
    });
    await mount(api);
    expect(host.querySelector(".moodle-due-link")?.textContent).toBe(
      "Binary tree practice",
    );
    expect(host.querySelectorAll(".moodle-course-card")).toHaveLength(3);
    expect(host.querySelector(".moodle-course-card")?.textContent).toContain(
      "資料結構與演算法",
    );
    expect(host.querySelector(".moodle-course-card")?.textContent).toContain(
      "64%",
    );
    expect(host.querySelector(".moodle-course-card")?.textContent).toContain(
      "2 unread",
    );
    expect(host.querySelector(".moodle-due-strip")?.textContent).toContain(
      "Binary tree practice",
    );
  });
  it("opens a course file and hands its document ID to workspace navigation", async () => {
    const api = createMockMoodleApi(),
      onDocument = vi.fn();
    const courseId = (await api.overview()).courses[0]!.id;
    await mount(api, courseId, onDocument);
    await tab("Files");
    expect(
      host.querySelector("[role=tabpanel][data-state=active]")?.textContent,
    ).toContain("Practice worksheet.docx");
    await click("Binary trees & traversal.pdf");
    const detail = await api.course(courseId);
    expect(onDocument.mock.calls).toEqual([[detail.files[0]!.documentId]]);
    expect(detail.files[0]!.documentId).toMatch(/^[a-f\d-]{36}$/);
  });
  it("marks notifications read and exports a selected deadline", async () => {
    const api = createMockMoodleApi();
    const courseId = (await api.overview()).courses[0]!.id;
    const exported = vi
      .fn<MoodleApi["exportCalendar"]>()
      .mockResolvedValue({saved:true});
    api.exportCalendar = exported;
    await mount(api, courseId);
    await tab("Notifications");
    await click("Mark as read");
    expect((await api.course(courseId)).notifications[0]!.read).toBe(true);
    expect(host.querySelectorAll(".moodle-unread")).toHaveLength(1);
    await click("Explain what I need to prepare");
    expect(host.querySelector(".moodle-agent")?.textContent).toContain(
      "Explain what I need to prepare",
    );
    await tab("Deadlines");
    expect(host.querySelector(".moodle-deadline-group")?.textContent).toContain(
      "Weekly reflection",
    );
    const calendar = host.querySelector<HTMLButtonElement>(
      '[aria-label="Add Weekly reflection to calendar"]',
    )!;
    await act(async () => calendar.click());
    expect(exported.mock.calls).toEqual([
      [[(await api.course(courseId)).deadlines[2]!.id]],
    ]);
    expect(host.textContent).toContain("Calendar export requested.");
  });
  it("saves and removes a reminder through the popover", async () => {
    const api = createMockMoodleApi(),
      courseId = (await api.overview()).courses[0]!.id;
    await mount(api, courseId);
    await tab("Deadlines");
    const bell = host.querySelector<HTMLButtonElement>(
      '[aria-label="Set reminder for Binary tree practice"]',
    )!;
    await act(async () => bell.click());
    await click(
      "1 hour",
      document.querySelector("[data-slot=popover-content]")!,
    );
    const reminder = (await api.course(courseId)).reminders[0]!;
    expect(reminder.deadlineId).toBe(
      (await api.course(courseId)).deadlines[0]!.id,
    );
    expect(Date.parse(reminder.remindAt)).toBe(
      Date.parse((await api.course(courseId)).deadlines[0]!.dueAt) - 3600000,
    );
    await act(async () => bell.click());
    await click(
      "Remove",
      document.querySelector("[data-slot=popover-content]")!,
    );
    expect((await api.course(courseId)).reminders).toEqual([]);
  });
  it("keeps stale data after a refresh fails", async () => {
    const api = createMockMoodleApi();
    await mount(api);
    api.sync = async () => {
      throw new Error("offline");
    };
    const refresh = host.querySelector<HTMLButtonElement>(
      '[aria-label="Refresh courses"]',
    )!;
    await act(async () => refresh.click());
    expect(host.querySelector("[role=alert]")?.textContent).toContain(
      "Showing your last synced courses.",
    );
    expect(host.querySelectorAll(".moodle-course-card")).toHaveLength(3);
  });
  it("connects an empty account through the school dialog without password inputs", async () => {
    const api = createMockMoodleApi();
    await api.disconnect((await api.overview()).accounts[0]!.id);
    await mount(api);
    expect(host.textContent).toContain("Your next chapter starts here");
    await click("Connect school");
    expect(document.querySelector("[role=dialog]")?.textContent).toContain(
      "Chung Yuan Christian University",
    );
    expect(document.querySelector("input[type=password]")).toBeNull();
    await click("Sign in with school account");
    expect(host.querySelectorAll(".moodle-course-card")).toHaveLength(3);
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });
  it("shows loading and expired sessions explicitly", async () => {
    const api = createMockMoodleApi(),
      overview = await api.overview();
    let resolve!: (value: typeof overview) => void;
    api.overview = () =>
      new Promise((done) => {
        resolve = done;
      });
    await mount(api);
    expect(host.querySelectorAll(".moodle-skeleton")).toHaveLength(3);
    await act(async () =>
      resolve({
        ...overview,
        accounts: overview.accounts.map((a) => ({ ...a, status: "expired" })),
      }),
    );
    expect(host.querySelector(".moodle-expired")?.textContent).toContain(
      "Your school session has expired.",
    );
    expect(host.querySelectorAll(".moodle-course-card")).toHaveLength(3);
  });
  it("returns to courses after disconnecting the account for the open course", async () => {
    const api = createMockMoodleApi(),
      courseId = (await api.overview()).courses[0]!.id;
    const onCourse = vi.fn();
    await act(async () =>
      root.render(
        <Courses
          api={api}
          courseId={courseId}
          onCourse={onCourse}
          onDocument={() => {}}
        />,
      ),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Disconnect school"]')!
        .click(),
    );
    expect(onCourse.mock.calls).toEqual([[]]);
    expect(host.querySelector("[role=status]")?.textContent).toBe("");
    expect((await api.overview()).accounts).toEqual([]);
  });
  it("reports a failed file opening and lets the student retry", async () => {
    const api = createMockMoodleApi();
    const courseId = (await api.overview()).courses[0]!.id;
    const original = api.openFile;
    api.openFile = async () => {
      throw new Error("conversion failed");
    };
    const onDocument = vi.fn();
    await mount(api, courseId, onDocument);
    await tab("Files");
    await click("Binary trees & traversal.pdf");
    expect(host.querySelector("[role=status]")?.textContent).toContain(
      "That action could not be completed.",
    );
    expect(
      host.querySelector<HTMLButtonElement>(".moodle-file-row")?.disabled,
    ).toBe(false);
    api.openFile = original;
    await click("Binary trees & traversal.pdf");
    expect(onDocument.mock.calls).toEqual([
      [(await api.course(courseId)).files[0]!.documentId],
    ]);
  });
  it("rejects agent proposals that refer to another course", async () => {
    const api = createMockMoodleApi(),
      overview = await api.overview();
    const detail = await api.course(overview.courses[0]!.id);
    const other = await api.course(overview.courses[1]!.id);
    const onError = vi.fn();
    const agent = async (): Promise<MoodleAgentAction[]> => [
      { type: "export-calendar", deadlineIds: [other.deadlines[0]!.id] },
    ];
    await act(async () =>
      root.render(
        <CourseAgentPanel
          detail={detail}
          api={api}
          agent={agent}
          requested={0}
          onChange={async () => {}}
          onError={onError}
        />,
      ),
    );
    await click("Explain what I need to prepare");
    expect(onError.mock.calls).toEqual([[]]);
    expect(host.querySelectorAll(".moodle-proposal")).toHaveLength(0);
    expect(host.textContent).toContain("Walk into class prepared.");
  });
  it("requires approval before an agent action writes a reminder", async () => {
    const api = createMockMoodleApi(),
      detail = await api.course((await api.overview()).courses[0]!.id);
    const action: MoodleAgentAction = {
      type: "create-reminder",
      deadlineId: detail.deadlines[0]!.id,
      remindAt: new Date(Date.now() + 3600000).toISOString(),
      note: "Review trees",
    };
    const agent = vi.fn(async () => [action]);
    await act(async () =>
      root.render(
        <CourseAgentPanel
          detail={detail}
          api={api}
          agent={agent}
          requested={0}
          onChange={async () => {}}
          onError={() => {}}
        />,
      ),
    );
    await click("Explain what I need to prepare");
    expect(host.textContent).toContain("Review this suggested action");
    expect((await api.course(detail.course.id)).reminders).toHaveLength(0);
    expect(agent.mock.calls).toEqual([
      [{ intent: "prepare", context: { trust: "untrusted", course: detail } }],
    ]);
    await click("Approve action");
    expect((await api.course(detail.course.id)).reminders[0]?.note).toBe(
      "Review trees",
    );
    expect((await api.course(detail.course.id)).reminders[0]?.createdBy).toBe("agent");
    expect(host.textContent).toContain("Action completed.");
  });
});

it("groups overdue, soon, later, and submitted deadlines", () => {
  const base = {
    id: "deadline",
    courseId: "course",
    title: "Essay",
    kind: "assignment" as const,
    dueAt: "2026-11-03T00:00:00Z",
    url: null,
    submitted: false,
  };
  const now = Date.parse("2026-11-04T00:00:00Z");
  expect(deadlineGroup(base, now)).toBe("overdue");
  expect(deadlineGroup({ ...base, dueAt: "2026-11-06T00:00:00Z" }, now)).toBe(
    "this_week",
  );
  expect(deadlineGroup({ ...base, dueAt: "2026-12-01T00:00:00Z" }, now)).toBe(
    "later",
  );
  expect(deadlineGroup({ ...base, submitted: true }, now)).toBe("done");
});
it('shows an upcoming deadline in Up next instead of an overdue item',async () => {
  const api = createMockMoodleApi(); const overview = await api.overview();
  const detail = await api.course(overview.courses[0]!.id);
  api.course = async () => ({...detail,deadlines:[{...detail.deadlines[0]!,title:'Old overdue',dueAt:'2020-01-01T00:00:00.000Z',submitted:false},{...detail.deadlines[0]!,title:'Next upcoming',dueAt:'2099-01-01T00:00:00.000Z',submitted:false}]});
  await mount(api,detail.course.id);
  const panel = [...host.querySelectorAll('section')].find(section => section.textContent?.includes('Up next'))!;
  expect(panel.textContent).toContain('Next upcoming');
  expect(panel.textContent).not.toContain('Old overdue');
});
it('keeps the calendar proposal when export is cancelled',async () => {
  const api = createMockMoodleApi();
  const detail = await api.course((await api.overview()).courses[0]!.id);
  api.exportCalendar = vi.fn(async () => ({saved:false}));
  await act(async () => root.render(<CourseAgentPanel detail={detail} api={api} agent={async () => [{type:'export-calendar',deadlineIds:[detail.deadlines[0]!.id]}]} requested={0} onChange={async () => {}} onError={() => {}} />));
  await click('Explain what I need to prepare'); await click('Approve action');
  expect(host.querySelectorAll('.moodle-proposal')).toHaveLength(1);
  expect(host.textContent).not.toContain('Action completed.');
});
