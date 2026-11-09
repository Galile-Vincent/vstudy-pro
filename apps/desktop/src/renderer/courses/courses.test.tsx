// @vitest-environment jsdom
import { act } from "react";
import { getByRole } from "@testing-library/dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Courses, deadlineGroup } from "./index";
import { CourseAgentPanel } from "./agent";
import { createMockMoodleApi } from "../dev-mock";
import { i18n } from "../../shared/i18n";
import { displayTitle } from "../../shared/moodle-course-display";
import type { MoodleApi } from "./api";
import type { MoodleAgentAction } from "../../shared/moodle";

const navigationMock = vi.hoisted(() => ({ value: null as null | {openTab: ReturnType<typeof vi.fn>} }));
vi.mock('../shell', async importOriginal => ({
  ...await importOriginal<typeof import('../shell')>(),
  useOptionalNavigation: () => navigationMock.value,
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
let root: Root;
let host: HTMLDivElement;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(async () => {
  navigationMock.value = null;
  vi.stubGlobal("matchMedia",vi.fn(() => ({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
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
async function openCourseMenu() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const trigger = getByRole(host, "button", { name: "More course actions" });
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  return trigger;
}
async function chooseDisconnect() {
  await openCourseMenu();
  await act(async () => getByRole(document.body, "menuitem", { name: "Disconnect school" }).click());
}
async function tab(name: string) {
  const trigger = [...host.querySelectorAll<HTMLElement>("[role=tab]")].find(
    (b) => b.textContent === name,
  );
  if (!trigger) throw new Error(`Tab not found: ${name}`);
  await act(async () => trigger.focus());
}

describe("Courses", () => {
  it("shows compact courses, deadline rows, and meaningful unread indicators", async () => {
    const api = createMockMoodleApi(),
      overview = await api.overview();
    overview.courses[0]!.progress = 64.4;
    api.overview = async () => ({
      ...overview,
      upcoming: [...overview.upcoming].reverse(),
    });
    await mount(api);
    expect(host.querySelector(".moodle-due-link")?.textContent).toBe(
      "Weekly reflection",
    );
    expect(host.querySelectorAll(".moodle-course-card")).toHaveLength(1);
    expect(host.querySelector(".moodle-course-card")?.textContent).toContain(
      "Electronics Laboratory",
    );
    expect(host.querySelector(".moodle-course-card progress")).toBeNull();
    expect(host.querySelector('.moodle-course-card [id$="-unread"]')?.textContent).toBe('2 unread');
    expect(host.textContent).toContain('Amplifier lab report');
    expect(host.textContent).not.toContain('No deadlines this week');
  });
  it("renders exactly one main landmark for the catalog", async () => {
    await mount(createMockMoodleApi());
    expect(host.querySelectorAll("main")).toHaveLength(1);
  });
  it("groups course header actions behind one primary action, refresh and an overflow menu", async () => {
    const api = createMockMoodleApi();
    const courseId = (await api.overview()).courses[0]!.id;
    const detail = await api.course(courseId);
    await mount(api, courseId);
    const head = host.querySelector<HTMLElement>(".course-head")!;
    expect(getByRole(head, "button", { name: "All courses" })).not.toBeNull();
    const group = getByRole(head, "group", { name: "Course actions" });
    expect([...group.querySelectorAll("button")].map(button => button.getAttribute("aria-label") ?? button.textContent)).toEqual(["Open in Moodle", "Refresh courses", "More course actions"]);
    expect(head.textContent).not.toContain("Connect school");
    expect(head.querySelector(".planner-entry")).toBeNull();
    expect(host.querySelector(".moodle-hero-next")).toBeNull();
    expect(head.querySelector(".course-head-meta")?.textContent).toContain("TANG, SONG-NIEN");
    expect(head.querySelector("[data-testid=course-cache-state]")).not.toBeNull();
    await openCourseMenu();
    expect(document.querySelector(".moodle-raw-name")?.textContent).toContain(detail.course.fullName);
    expect(getByRole(document.body, "menuitem", { name: "Disconnect school" })).not.toBeNull();
    const refresh = getByRole(group, "button", { name: "Refresh courses" }) as HTMLButtonElement;
    let finish!: () => void;
    const course = api.course;
    api.course = async (id, force) => {
      if (force) await new Promise<void>(resolve => { finish = resolve; });
      return course(id, force);
    };
    await act(async () => refresh.click());
    expect(refresh.disabled).toBe(true);
    expect(refresh.getAttribute("aria-busy")).toBe("true");
    expect(refresh.querySelector(".moodle-spin")).not.toBeNull();
    await act(async () => finish());
    expect(refresh.disabled).toBe(false);
    await mount(api);
    expect(host.querySelector(".planner-entry")).not.toBeNull();
    expect(host.querySelector("[data-slot=page-header]")?.textContent).not.toContain("Connect school");
    expect(host.textContent).toContain("Connect another school");
  });
  it("preserves detail tab selection, arrow navigation, and panel associations", async () => {
    const api = createMockMoodleApi();
    await mount(api, (await api.overview()).courses[0]!.id);
    const triggers = [...host.querySelectorAll<HTMLButtonElement>('.moodle-tabs [role="tab"]')];
    expect(triggers).toHaveLength(6);
    for (const trigger of triggers) {
      await act(async () => trigger.focus());
      expect(trigger.getAttribute("aria-selected")).toBe("true");
      const panel = document.getElementById(trigger.getAttribute("aria-controls")!);
      expect(panel?.getAttribute("role")).toBe("tabpanel");
      expect(panel?.getAttribute("aria-labelledby")).toBe(trigger.id);
    }
    await act(async () => triggers[0]!.focus());
    await act(async () => {
      triggers[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(document.activeElement).toBe(triggers[1]);
    expect(triggers[1]!.getAttribute("aria-selected")).toBe("true");
  });
  it("associates every term tab with its course panel", async () => {
    await mount(createMockMoodleApi());
    const tabs = [...host.querySelectorAll<HTMLElement>('.moodle-term-tabs [role=tab]')];
    expect(tabs).toHaveLength(4);
    for (const trigger of tabs) {
      await act(async () => trigger.focus());
      const panel = document.getElementById(trigger.getAttribute('aria-controls')!);
      expect(panel?.getAttribute('role')).toBe('tabpanel');
      expect(panel?.getAttribute('aria-labelledby')).toBe(trigger.id);
      expect(panel?.hidden).toBe(false);
    }
  });
  it("opens a course file and hands its document ID to workspace navigation", async () => {
    const api = createMockMoodleApi(),
      onDocument = vi.fn();
    const courseId = (await api.overview()).courses[0]!.id;
    await mount(api, courseId, onDocument);
    await tab("Files");
    const file = (await api.course(courseId)).files[0]!;
    const fileRow = getByRole(host, 'button', {name:`Open file: ${file.name}`});
    expect(fileRow.title).toBe(`Open file: ${file.name}`);
    expect(getByRole(host, 'button', {name:`Open in Moodle: ${file.name}`}).title).toBe('Open in Moodle');
    expect(
      host.querySelector("[role=tabpanel][data-state=active]")?.textContent,
    ).toContain("Practice worksheet.docx");
    await click("Operational amplifiers.pdf");
    const detail = await api.course(courseId);
    expect(onDocument.mock.calls).toEqual([[detail.files[0]!.documentId]]);
    expect(detail.files[0]!.documentId).toMatch(/^[a-f\d-]{36}$/);
  });
  it("marks notifications read and exports a selected deadline", async () => {
    const api = createMockMoodleApi();
    const courseId = (await api.overview()).courses[0]!.id;
    const exported = vi
      .fn<MoodleApi["exportCalendar"]>()
      .mockResolvedValue({ saved: true });
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
      '[aria-label="Set reminder for Amplifier lab report"]',
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
    const refresh = getByRole(host, 'button', {name: 'Refresh all schools'});
    await act(async () => refresh.click());
    expect(host.querySelector("[role=alert]")?.textContent).toContain(
      "Showing your last synced courses.",
    );
    expect(host.querySelectorAll(".moodle-course-card")).toHaveLength(1);
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
    await click("Chung Yuan Christian University");
    await click("Continue to sign in");
    await click("Continue with University ID");
    expect(host.querySelectorAll(".moodle-course-card")).toHaveLength(1);
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
    expect(host.querySelectorAll(".moodle-course-card")).toHaveLength(1);
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
    await chooseDisconnect();
    const dialog = document.querySelector("[role=dialog]")!;
    expect((await api.overview()).accounts).toHaveLength(1);
    expect(dialog.textContent).toContain("Disconnect 中原大學 CYCU?");
    expect(dialog.textContent).toContain("planner tasks, goals and exams");
    await click("Cancel", dialog);
    expect((await api.overview()).accounts).toHaveLength(1);
    expect(onCourse).not.toHaveBeenCalled();
    await chooseDisconnect();
    await click("Disconnect school", document.querySelector("[role=dialog]")!);
    expect(onCourse.mock.calls).toEqual([[]]);
    expect(host.querySelector("[role=status]")?.textContent).toBe("");
    expect((await api.overview()).accounts).toEqual([]);
  });
  it("returns focus to the course menu when Escape closes the disconnect dialog", async () => {
    const api = createMockMoodleApi(),
      courseId = (await api.overview()).courses[0]!.id;
    await mount(api, courseId);
    const trigger = await openCourseMenu();
    await act(async () => getByRole(document.body, "menuitem", { name: "Disconnect school" }).click());
    const dialog = document.querySelector("[role=dialog]")!;
    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(document.activeElement).toBe(trigger);
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
    await click("Operational amplifiers.pdf");
    expect(host.querySelector("[role=status]")?.textContent).toContain(
      "That action could not be completed.",
    );
    expect(
      host.querySelector<HTMLButtonElement>(".moodle-file-row")?.disabled,
    ).toBe(false);
    api.openFile = original;
    await click("Operational amplifiers.pdf");
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
    expect((await api.course(detail.course.id)).reminders[0]?.createdBy).toBe(
      "agent",
    );
    expect(host.textContent).toContain("Action completed.");
    expect(document.activeElement?.className).toBe("moodle-agent");
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
it("shows an upcoming deadline in Up next instead of an overdue item", async () => {
  const api = createMockMoodleApi();
  const overview = await api.overview();
  const detail = await api.course(overview.courses[0]!.id);
  api.course = async () => ({
    ...detail,
    deadlines: [
      {
        ...detail.deadlines[0]!,
        title: "Old overdue",
        dueAt: "2020-01-01T00:00:00.000Z",
        submitted: false,
      },
      {
        ...detail.deadlines[0]!,
        title: "Next upcoming",
        dueAt: "2099-01-01T00:00:00.000Z",
        submitted: false,
      },
    ],
  });
  await mount(api, detail.course.id);
  const panel = [...host.querySelectorAll("section")].find((section) =>
    section.textContent?.includes("Up next"),
  )!;
  expect(panel.textContent).toContain("Next upcoming");
  expect(panel.textContent).not.toContain("Old overdue");
});
it("keeps the calendar proposal when export is cancelled", async () => {
  const api = createMockMoodleApi();
  const detail = await api.course((await api.overview()).courses[0]!.id);
  api.exportCalendar = vi.fn(async () => ({ saved: false }));
  await act(async () =>
    root.render(
      <CourseAgentPanel
        detail={detail}
        api={api}
        agent={async () => [
          { type: "export-calendar", deadlineIds: [detail.deadlines[0]!.id] },
        ]}
        requested={0}
        onChange={async () => {}}
        onError={() => {}}
      />,
    ),
  );
  await click("Explain what I need to prepare");
  await click("Approve action");
  expect(host.querySelectorAll(".moodle-proposal")).toHaveLength(1);
  expect(host.textContent).not.toContain("Action completed.");
});
it("shows and marks account-wide notifications read on Courses home", async () => {
  const api = createMockMoodleApi();
  const original = await api.overview();
  const detail = await api.course(original.courses[0]!.id);
  let read = false;
  api.overview = async () => ({
    ...original,
    otherNotifications: [
      {
        ...detail.notifications[0]!,
        courseId: null,
        id: "00000000-0000-4000-a000-000000000999",
        subject: "School notice",
        read,
      },
    ],
    unreadNotifications: read ? 0 : 1,
  });
  api.markRead = async () => {
    read = true;
  };
  await mount(api);
  await click("Updates");
  expect(host.textContent).toContain("School notice");
  await click("School notice");
  expect(read).toBe(true);
  expect(document.querySelector(".update-reader")?.textContent).toContain("School notice");
});
it("does not replace newer refresh state with an older response", async () => {
  const api = createMockMoodleApi();
  const original = await api.overview();
  const detail = await api.course(original.courses[0]!.id);
  api.overview = async () => ({
    ...original,
    otherNotifications: [{ ...detail.notifications[0]!, courseId: null }],
  });
  let progressListener: Parameters<NonNullable<MoodleApi["onProgress"]>>[0] | undefined;
  api.onProgress = listener => {progressListener=listener;return () => {};};
  await mount(api);
  const pending: ((value: typeof original) => void)[] = [];
  api.overview = () => new Promise((resolve) => pending.push(resolve));
  await click("Show all");
  await act(async () => {progressListener?.({accountId:original.accounts[0]!.id,state:"idle",completed:0,total:0}); await new Promise(resolve => setTimeout(resolve,60));});
  await act(async () => {progressListener?.({accountId:original.accounts[0]!.id,state:"idle",completed:0,total:0}); await new Promise(resolve => setTimeout(resolve,60));});
  await act(async () =>
    pending[1]!({
      ...original,
      courses: [
        {
          ...original.courses[0]!,
          identity: {
            ...original.courses[0]!.identity,
            title: { zh: null, en: "New response" },
          },
        },
      ],
    }),
  );
  await act(async () =>
    pending[0]!({
      ...original,
      courses: [
        {
          ...original.courses[0]!,
          identity: {
            ...original.courses[0]!.identity,
            title: { zh: null, en: "Old response" },
          },
        },
      ],
    }),
  );
  expect(host.textContent).toContain("New response");
  expect(host.textContent).not.toContain("Old response");
});
it("reports a refresh failure separately after a successful mark-read", async () => {
  const api = createMockMoodleApi();
  const courseId = (await api.overview()).courses[0]!.id;
  await mount(api, courseId);
  await tab("Notifications");
  api.overview = async () => {
    throw new Error("offline");
  };
  await click("Mark as read");
  expect(host.textContent).not.toContain("Something went wrong");
  expect(host.querySelector("[role=alert]")?.textContent).toContain(
    "Showing your last synced courses.",
  );
});

it("uses semantic course cards and labels unread indicators", async () => {
  const api = createMockMoodleApi();
  await mount(api);
  expect(host.querySelectorAll("button h3, button progress")).toHaveLength(0);
  expect(
    host.querySelectorAll("li.moodle-course-card .course-open"),
  ).toHaveLength(1);
  await mount(api, (await api.overview()).courses[0]!.id);
  await tab("Notifications");
  expect(host.querySelector(".moodle-unread")?.getAttribute("role")).toBe(
    "img",
  );
  expect(host.querySelector(".moodle-unread")?.getAttribute("aria-label")).toBe(
    "Unread",
  );
});

it("filters term tabs and shows counts without unavailable progress text", async () => {
  const api = createMockMoodleApi();
  await mount(api);
  expect(host.querySelectorAll(".moodle-course-card")).toHaveLength(1);
  const terms = [
    ...host.querySelectorAll<HTMLButtonElement>(".moodle-term-tabs [role=tab]"),
  ];
  await act(async () => terms[1]!.focus());
  expect(host.querySelectorAll('.moodle-course-card')).toHaveLength(1);
  expect(host.querySelector('.moodle-course-card')?.textContent).toContain('Probability & Statistics (1)');
  await act(async () => terms[2]!.focus());
  expect(host.querySelectorAll(".moodle-course-card")).toHaveLength(2);
  expect(host.textContent).toContain("Logic Design");
  expect(
    host.querySelector(".moodle-course-card")?.querySelector("progress"),
  ).toBeNull();
  await act(async () => terms[3]!.focus());
  expect(host.querySelectorAll(".moodle-course-card")).toHaveLength(4);
  expect(host.textContent).not.toContain("Not available");
});
it("expands the current week and lets students collapse or open another week", async () => {
  const api = createMockMoodleApi();
  await mount(api, (await api.overview()).courses[0]!.id);
  const current = host.querySelector(".moodle-week[data-current=true]")!;
  expect(current.textContent).toContain("This week");
  expect(current.querySelector("button")?.getAttribute("aria-expanded")).toBe(
    "true",
  );
  expect(
    host.querySelector(".moodle-week button")?.getAttribute("aria-expanded"),
  ).toBe("false");
  await act(async () => current.querySelector("button")!.click());
  expect(current.querySelector(".moodle-module")).toBeNull();
  await act(async () =>
    host.querySelector<HTMLButtonElement>(".moodle-week button")!.click(),
  );
  expect(host.querySelector(".moodle-week .moodle-module")).not.toBeNull();
  expect(host.querySelectorAll(".moodle-week-heading:disabled")).toHaveLength(
    1,
  );
});
it("strips active HTML and token-bearing images from module sheets", async () => {
  const api = createMockMoodleApi(),
    detail = await api.course((await api.overview()).courses[0]!.id);
  detail.sections[7]!.modules[0]!.descriptionHtml =
    '<p onclick="alert(1)">Safe text<script>alert(2)</script><img src="https://school.test/a?token=secret"><a href="javascript:alert(3)">Unsafe link</a></p><iframe src="https://bad.test"></iframe>';
  api.course = async () => detail;
  await mount(api, detail.course.id);
  await act(async () =>
    host.querySelector<HTMLButtonElement>(".moodle-module")!.click(),
  );
  const sheet = document.querySelector("[data-slot=sheet-content]")!;
  expect(sheet.textContent).toContain("Safe text");
  expect(sheet.querySelector("script,img,iframe,[onclick],a")).toBeNull();
  expect(sheet.textContent).not.toContain("alert(2)");
});
it("keeps the assistant mounted across tabs and returns focus on Escape", async () => {
  const api = createMockMoodleApi();
  await mount(api, (await api.overview()).courses[0]!.id);
  const button = host.querySelector<HTMLButtonElement>(".moodle-chat-button")!;
  expect(button.getAttribute("aria-expanded")).toBe("false");
  await act(async () => button.click());
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "Close course assistant",
  );
  const panel = host.querySelector(".moodle-agent");
  await tab("Grades");
  expect(host.querySelector(".moodle-agent")).toBe(panel);
  const nestedEscape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  nestedEscape.preventDefault();
  await act(async () => { document.dispatchEvent(nestedEscape); });
  expect(button.getAttribute("aria-expanded")).toBe("true");
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(button);
});
it("shows announcement previews and opens their full safe body", async () => {
  const api = createMockMoodleApi();
  await mount(api, (await api.overview()).courses[0]!.id);
  await tab("Announcements");
  const announcement = host.querySelector<HTMLButtonElement>(
    ".moodle-announcement",
  )!;
  expect(announcement.textContent).toContain("Please review the lecture notes");
  await act(async () => announcement.click());
  expect(
    document.querySelector("[data-slot=sheet-content]")?.textContent,
  ).toContain("compare our results in small groups");
});
it("opens module attachments through the existing reader API", async () => {
  const api = createMockMoodleApi(),
    onDocument = vi.fn();
  const courseId = (await api.overview()).courses[0]!.id;
  await mount(api, courseId, onDocument);
  await click(
    "Operational amplifiers.pdf",
    host.querySelector(".moodle-weeks")!,
  );
  await act(async () => {});
  await click("Open", document.querySelector(".course-file-actions")!);
  expect(onDocument.mock.calls).toEqual([
    [(await api.course(courseId)).files[0]!.documentId],
  ]);
});
it("labels unknown lifecycle dates on Current and All", async () => {
  const api = createMockMoodleApi(),
    overview = await api.overview();
  overview.courses[0]!.identity = {
    ...overview.courses[0]!.identity,
    term: null,
    lifecycle: "unknown",
  };
  api.overview = async () => overview;
  await mount(api);
  expect(host.querySelector('.moodle-course-card [id$="-raw"]')?.textContent).toContain("Dates unavailable");
  expect(host.querySelectorAll(".moodle-course-card")).toHaveLength(1);
});

it.each([
  ['service','Server returned unexpected data'],
  ['permission','No permission'],
  ['network','Network error'],
  ['auth','Session expired'],
] as const)('shows the %s panel failure reason and retries',async (reason,label) => {
  const api=createMockMoodleApi();
  const detail=await api.course((await api.overview()).courses[0]!.id);
  detail.panels={contents:'error'};
  detail.panelErrors={contents:reason};
  detail.sections=[];
  const getCourse=vi.fn(async () => detail);
  api.course=getCourse;
  await mount(api,detail.course.id);
  expect(host.textContent).toContain(label);
  expect(host.textContent).not.toContain("Couldn't complete the action");
  await click('Try again');
  expect(getCourse).toHaveBeenCalledWith(detail.course.id,true);
});
it('shows a partial contents notice alongside the surviving items',async () => {
  const api=createMockMoodleApi();
  const detail=await api.course((await api.overview()).courses[0]!.id);
  detail.contentsPartial=true;
  api.course=async () => detail;
  await mount(api,detail.course.id);
  expect(host.textContent).toContain("Some items couldn't be displayed");
  expect(host.querySelectorAll('.moodle-module').length).toBeGreaterThan(0);
});

it('keeps retained course content in place during a background panel refresh',async()=>{
  const api=createMockMoodleApi();
  const detail=await api.course((await api.overview()).courses[0]!.id);
  detail.panels={contents:'loading',completion:'loading'};
  api.course=async()=>detail;
  await mount(api,detail.course.id);
  expect(host.querySelectorAll('.moodle-module').length).toBeGreaterThan(0);
  expect(host.querySelector('.moodle-skeleton')).toBeNull();
  expect(host.querySelector('[role=status][aria-busy=true]')).not.toBeNull();
});
it('still shows an initial panel skeleton when course content is absent',async()=>{
  const api=createMockMoodleApi();
  const detail=await api.course((await api.overview()).courses[0]!.id);
  detail.panels={contents:'loading'};detail.sections=[];detail.course.identity.teachers=[];
  api.course=async()=>detail;
  await mount(api,detail.course.id);
  expect(host.querySelector('.moodle-skeleton')).not.toBeNull();
});

it('keeps empty count slots, caps the visible number, and orders the accessible row name', async () => {
  const api = createMockMoodleApi();
  const overview = await api.overview();
  const course = overview.courses[0]!;
  const template = overview.summaries![0]!.notifications[0]!;
  const notifications = Array.from({length:120},(_,index)=>({...template,id:`00000000-0000-4000-a000-${String(index).padStart(12,'0')}`,read:false}));
  api.overview = async () => ({...overview,courses:[course],summaries:[{course,notifications,reminders:[]}]});
  await mount(api);
  expect(host.querySelector('.course-unread-count')?.textContent).toBe('99+');
  expect(host.querySelector('.course-unread-count')?.getAttribute('title')).toBe('120 unread updates');
  for (const slot of ['.course-overdue', '.course-unread-count']) {
    expect(host.querySelector(slot)?.classList.contains('w-[calc(var(--space-4)*3.5)]')).toBe(true);
    expect(host.querySelector(slot)?.classList.contains('shrink-0')).toBe(true);
  }
  expect(host.querySelector('.course-pin')?.classList.contains('size-[calc(var(--space-3)*3)]')).toBe(true);
  expect(host.querySelector('.course-heading-row')).toBeNull();
  const button = host.querySelector<HTMLButtonElement>('.course-open')!;
  const labels = button.getAttribute('aria-labelledby')!.split(' ').map(id=>document.getElementById(id)!.textContent);
  expect(labels[0]).toBe(displayTitle(course.identity,'en',course.fullName));
  expect(labels[1]).toBe(course.identity.teachers[0]!.en);
  expect(labels.at(-2)).toBe('120 unread');
  expect(labels.at(-1)).toMatch(/^Due/);
  expect(button.title).toContain(course.fullName);
  expect(button.title).toContain('120 unread');
  api.overview = async () => ({...overview,courses:[{...course,identity:{...course.identity,teachers:[]}}],upcoming:[],summaries:[]});
  await mount({...api});
  expect(host.querySelector('.course-meta')).toBeNull();
  expect([...host.querySelectorAll('.course-count')].map(node=>node.textContent)).toEqual(['','']);
});

it('pins without opening a course, exposes pressed state, and keeps the course button mounted after moving', async () => {
  const api = createMockMoodleApi();
  const original=api.overview;
  api.overview=async () => {const overview=await original();return {...overview,courses:overview.courses.map(course => ({...course,identity:{...course.identity,lifecycle:'current'}}))};};
  await mount(api);
  const rows = [...host.querySelectorAll('.moodle-course-card')];
  const target = rows.at(-1)!;
  const open = target.querySelector<HTMLButtonElement>('.course-open')!;
  const pin = target.querySelector<HTMLButtonElement>('.course-pin')!;
  expect(pin.getAttribute('aria-label')).toBe('Pin course');
  expect(pin.getAttribute('aria-pressed')).toBe('false');
  expect(pin.title).toBe('Pin course');
  expect(pin.tabIndex).toBe(0);
  pin.focus();
  await act(async () => pin.click());
  expect(host.querySelector('.course-open')).toBe(open);
  expect(document.activeElement).toBe(pin);
  expect(pin.getAttribute('aria-pressed')).toBe('true');
  expect(pin.querySelector('svg')?.getAttribute('fill')).toBe('currentColor');
  expect(pin.getAttribute('aria-label')).toBe('Unpin course');
  expect(host.querySelector('.course-group-label')?.textContent).toBe('Pinned');
  expect((await api.overview()).pinnedCourseIds).toContain(target.getAttribute('data-course-id'));
  await act(async () => pin.click());
  expect(pin.getAttribute('aria-pressed')).toBe('false');
  expect(host.querySelector('.course-group-label')).toBeNull();
});

describe("Courses view switch", () => {
  afterEach(() => localStorage.clear());
  const list = () => host.querySelector<HTMLElement>(".moodle-grid")!;
  const switchButton = (label: string) => host.querySelector<HTMLButtonElement>(`.course-view-switch button[aria-label="${label}"]`)!;

  it("starts as a list and exposes a labelled two-button group", async () => {
    await mount(createMockMoodleApi());
    expect(list().dataset.view).toBe("list");
    const group = host.querySelector(".course-view-switch")!;
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("View");
    expect(switchButton("List").getAttribute("aria-pressed")).toBe("true");
    expect(switchButton("Cards").getAttribute("aria-pressed")).toBe("false");
    expect(switchButton("Cards").title).toBe("Cards");
  });

  it("switches to cards, keeps every row and its accessible name, and remembers the choice", async () => {
    await mount(createMockMoodleApi());
    const before = [...host.querySelectorAll(".course-open")].map(button => button.getAttribute("aria-labelledby"));
    await act(async () => switchButton("Cards").click());
    expect(list().dataset.view).toBe("cards");
    expect(switchButton("Cards").getAttribute("aria-pressed")).toBe("true");
    expect(switchButton("List").getAttribute("aria-pressed")).toBe("false");
    expect([...host.querySelectorAll(".course-open")].map(button => button.getAttribute("aria-labelledby"))).toEqual(before);
    await act(async () => root.unmount());
    root = createRoot(host);
    await mount(createMockMoodleApi());
    expect(list().dataset.view).toBe("cards");
  });

  it("treats an unknown stored value as a list", async () => {
    localStorage.setItem("vstudy.courses.view", "carousel");
    await mount(createMockMoodleApi());
    expect(list().dataset.view).toBe("list");
  });

  it("keeps the repeated column labels out of the accessibility tree", async () => {
    await mount(createMockMoodleApi());
    expect(host.querySelector(".course-heading-row")).toBeNull();
  });
});


it("C1 confirms the named school before catalog disconnect", async () => {
  const api = createMockMoodleApi();
  const account = (await api.overview()).accounts[0]!;
  const disconnect = vi.spyOn(api, "disconnect");
  await mount(api);
  await act(async () => getByRole(host, "button", { name: `Disconnect ${account.siteName}` }).click());
  expect(disconnect).not.toHaveBeenCalled();
  const dialog = getByRole(document.body, "dialog");
  expect(dialog.textContent).toContain(account.siteName);
  await act(async () => getByRole(dialog, "button", { name: "Disconnect school" }).click());
  expect(disconnect).toHaveBeenCalledExactlyOnceWith(account.id);
});

it("C3 retains sync failure across cached overview reads", async () => {
  const api = createMockMoodleApi();
  let listener: Parameters<NonNullable<MoodleApi["onProgress"]>>[0];
  api.onProgress = value => { listener = value; return () => {}; };
  await mount(api);
  await act(async () => {
    listener!({ accountId: (await api.overview()).accounts[0]!.id, state: "error", completed: 0, total: 1 });
    await new Promise(resolve => setTimeout(resolve, 70));
  });
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => {
    listener!({ accountId: (await api.overview()).accounts[0]!.id, state: "idle", completed: 1, total: 1 });
    await new Promise(resolve => setTimeout(resolve, 70));
  });
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("C4 moves focus into Planner and restores its invoking button", async () => {
  await mount(createMockMoodleApi());
  const entry = host.querySelector<HTMLButtonElement>(".planner-entry")!;
  await act(async () => { entry.focus(); entry.click(); });
  const back = getByRole(host, "button", { name: "Back to courses" });
  expect(document.activeElement).toBe(back);
  await act(async () => back.click());
  expect(document.activeElement).toBe(host.querySelector(".planner-entry"));
});
it("C2 gives the sibling new-tab icon a course-specific name", async () => {
  const openTab = vi.fn();
  navigationMock.value = {openTab};
  await mount(createMockMoodleApi());
  const row = host.querySelector(".moodle-course-card")!;
  const action = getByRole(row as HTMLElement, "button", {
    name: /Open.*Electronics Laboratory.*new tab/,
  });
  expect(action.querySelector("svg")).not.toBeNull();
  expect(action.closest(".course-open")).toBeNull();
  await act(async () => action.click());
  const expected = openTab.mock.calls[0];
  const title = row.querySelector('.course-open')!;
  for (const modifier of [{ctrlKey: true}, {metaKey: true}]) {
    await act(async () => title.dispatchEvent(new MouseEvent('click', {bubbles: true, ...modifier})));
    expect(openTab.mock.calls.at(-1)).toEqual(expected);
  }
  await act(async () => title.dispatchEvent(new MouseEvent('auxclick', {bubbles: true, button: 1})));
  expect(openTab.mock.calls.at(-1)).toEqual(expected);
  expect(openTab).toHaveBeenCalledTimes(4);
});

it('hides unavailable new-tab controls and the duplicate menu', async () => {
  await mount(createMockMoodleApi());
  const row = host.querySelector('.moodle-course-card')!;
  expect(row.querySelector('[aria-label*=new]')).toBeNull();
  expect(row.querySelector('[aria-haspopup=menu]')).toBeNull();
});


it("keeps all four filters with zero counts and associated empty panels", async () => {
  const api = createMockMoodleApi();
  const overview = await api.overview();
  api.overview = async () => ({...overview, courses: [overview.courses[0]!]});
  await mount(api);
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('.moodle-term-tabs [role=tab]')];
  expect(tabs).toHaveLength(4);
  expect(tabs[1]!.textContent).toContain("0");
  await act(async () => tabs[1]!.focus());
  expect(host.querySelector('[role=tabpanel] [data-slot=empty-state]')).not.toBeNull();
  expect(tabs[1]!.getAttribute('aria-controls')).toBe(host.querySelector('[role=tabpanel][data-state=active]')?.id);
  api.overview = async () => ({...overview, courses: []});
  await mount({...api});
  expect(host.querySelectorAll('.moodle-term-tabs [role=tab]')).toHaveLength(4);
  expect(host.querySelector('[data-slot=empty-state]')).not.toBeNull();
});

it("retains a one-column grid fallback and separate course actions", async () => {
  await mount(createMockMoodleApi());
  const grid = host.querySelector<HTMLElement>(".moodle-grid[data-view]")!;
  await act(async () => getByRole(host, "button", { name: "Cards" }).click());
  expect(grid.className).toContain("min(100%,22rem)");
  const card = grid.querySelector('[data-slot=card]')!;
  expect(card.getAttribute("data-variant")).toBe("flat");
  expect(card.tagName).toBe("DIV");
  expect(card.querySelector("button button")).toBeNull();
  expect(host.querySelector('[data-slot=page-header] h1')?.className).not.toContain("break-all");
});

it('shows invalid and absent dates in an explicit final group', async () => {
  const api = createMockMoodleApi();
  const overview = await api.overview();
  api.overview = async () => ({...overview, upcoming: [
    {...overview.upcoming[0]!, id: 'missing', title: 'Undated work', dueAt: ''},
    {...overview.upcoming[0]!, id: 'invalid', title: 'Invalid date work', dueAt: 'bad'},
  ]});
  await mount(api);
  expect(host.textContent).toContain('No due date');
  expect(host.textContent).toContain('Undated work');
  expect(host.textContent).toContain('Invalid date work');
});

it('keeps focus on a surviving target after the last disconnect', async () => {
  const api = createMockMoodleApi();
  await mount(api);
  await act(async () => getByRole(host, 'button', {name: /^Disconnect /}).click());
  await act(async () => getByRole(document.body, 'dialog').querySelector<HTMLButtonElement>('button[data-variant=destructive]')!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(document.activeElement).toBe(host.querySelector('[data-slot=page-header] button:last-child'));
});

it('shows one Connect school action only after an empty overview loads', async () => {
  const api = createMockMoodleApi();
  const overview = await api.overview();
  let resolve!: (value: typeof overview) => void;
  api.overview = () => new Promise(done => { resolve = done; });
  await mount(api);
  expect(host.querySelector('h1:empty')).toBeNull();
  expect(host.textContent).not.toContain('Connect school');
  await act(async () => resolve({...overview, accounts: [], courses: []}));
  expect(host.querySelectorAll('h1:empty')).toHaveLength(0);
  expect(getByRole(host, 'button', {name: 'Connect school'})).toBeTruthy();
});

it('offers shared school actions once and names each disconnect', async () => {
  const api = createMockMoodleApi();
  const overview = await api.overview();
  const second = {...overview.accounts[0]!, id: 'second', siteName: 'Second school'};
  api.overview = async () => ({...overview, accounts: [...overview.accounts, second]});
  const sync = vi.spyOn(api, 'sync');
  await mount(api);
  expect(getByRole(host, 'button', {name: 'Connect another school'})).toBeTruthy();
  await act(async () => getByRole(host, 'button', {name: 'Refresh all schools'}).click());
  expect(sync).toHaveBeenCalledOnce();
  expect(getByRole(host, 'button', {name: 'Disconnect Second school'})).toBeTruthy();
});

it('chooses Past initially and preserves a later user choice on refresh', async () => {
  const api = createMockMoodleApi();
  const overview = await api.overview();
  api.overview = async () => ({...overview, courses: overview.courses.map(c => ({
    ...c, identity: {...c.identity, lifecycle: 'past'},
  }))});
  await mount(api);
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('.moodle-term-tabs [role=tab]')];
  expect(tabs[2]!.getAttribute('aria-selected')).toBe('true');
  await act(async () => tabs[3]!.focus());
  await act(async () => getByRole(host, 'button', {name: /Refresh/}).click());
  expect(tabs[3]!.getAttribute('aria-selected')).toBe('true');
});

it('uses level three deadline groups below Due soon and body empty copy', async () => {
  const api = createMockMoodleApi();
  await mount(api);
  const section = getByRole(host, 'heading', {name: /^Due soon/, level: 2}).closest('section')!;
  expect(section.querySelectorAll('h2')).toHaveLength(1);
  expect(section.querySelector('h3')).toBeTruthy();
  const overview = await api.overview();
  api.overview = async () => ({...overview, upcoming: []});
  await mount({...api});
  expect(getByRole(host, 'heading', {name: /^Due soon/}).closest('section')?.querySelector('p')?.textContent)
    .toBe('No deadlines due in the next 7 days.');
});
