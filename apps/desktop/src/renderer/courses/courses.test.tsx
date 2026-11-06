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
    overview.courses[0]!.progress = 64.4;
    api.overview = async () => ({
      ...overview,
      upcoming: [...overview.upcoming].reverse(),
    });
    await mount(api);
    expect(host.querySelector(".moodle-due-link")?.textContent).toBe(
      "Amplifier lab report",
    );
    expect(host.querySelectorAll(".moodle-course-card")).toHaveLength(1);
    expect(host.querySelector(".moodle-course-card")?.textContent).toContain(
      "Electronics Laboratory",
    );
    expect(host.querySelector(".moodle-course-card progress")?.getAttribute("aria-label")).toBe("64% complete");
    expect(host.querySelector(".moodle-course-card progress")?.getAttribute("value")).toBe("64");
    expect(host.querySelector(".moodle-course-card")?.textContent).toContain(
      "2 unread",
    );
    expect(host.querySelector(".moodle-due-strip")?.textContent).toContain(
      "Amplifier lab report",
    );
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
    const refresh = host.querySelector<HTMLButtonElement>(
      '[aria-label="Refresh courses"]',
    )!;
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
  expect(host.textContent).toContain("Other notifications");
  expect(host.textContent).toContain("School notice");
  await click("Mark as read");
  expect(
    host.querySelector(".moodle-notification")?.getAttribute("data-unread"),
  ).toBe("false");
});
it("does not replace newer refresh state with an older response", async () => {
  const api = createMockMoodleApi();
  const original = await api.overview();
  const detail = await api.course(original.courses[0]!.id);
  api.overview = async () => ({
    ...original,
    otherNotifications: [{ ...detail.notifications[0]!, courseId: null }],
  });
  await mount(api);
  const pending: ((value: typeof original) => void)[] = [];
  api.overview = () => new Promise((resolve) => pending.push(resolve));
  await click("Mark as read");
  await click("Mark as read");
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
    host.querySelectorAll("article.moodle-course-card button"),
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
  await click(
    "Operational amplifiers.pdf",
    document.querySelector("[data-slot=sheet-content]")!,
  );
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
  expect(host.querySelector(".moodle-course-card")?.getAttribute("title")).toContain("Dates unavailable");
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
