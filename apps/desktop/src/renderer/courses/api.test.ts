import { describe, expect, it } from "vitest";
import { libraryContract } from "../../shared/library";
import { createMockBridge, createMockMoodleApi } from "../dev-mock";
import {
  moodleCourseDetailSchema,
  moodleOverviewSchema,
} from "../../shared/moodle";

describe("Moodle development data", () => {
  it("provides contract-valid courses, deadline groups, and all supported file formats", async () => {
    const api = createMockMoodleApi();
    const overview = moodleOverviewSchema.parse(await api.overview());
    expect(overview.courses).toHaveLength(3);
    expect(overview.courses.map((c) => c.fullName)).toContain(
      "資料結構與演算法",
    );
    const detail = moodleCourseDetailSchema.parse(
      await api.course(overview.courses[0]!.id),
    );
    expect(detail.files.map((f) => f.name.split(".").pop())).toEqual([
      "pdf",
      "pptx",
      "docx",
    ]);
    expect(detail.deadlines.some((d) => Date.parse(d.dueAt) < Date.now())).toBe(
      true,
    );
    expect(
      detail.deadlines.some(
        (d) => Date.parse(d.dueAt) > Date.now() + 7 * 86400000,
      ),
    ).toBe(true);
  });
  it("makes opened files available to the reader and library", async () => {
    const api = createMockMoodleApi();
    const overview = await api.overview();
    const detail = await api.course(overview.courses[0]!.id);
    const opened = await api.openFile(detail.files[0]!.id);
    const desktop = createMockBridge();
    const page = libraryContract["library:documents:list"].response.parse(
      await desktop.invoke("library:documents:list", {
        sort: "manual",
        direction: "asc",
        limit: 50,
      }),
    );
    expect(
      page.items.find((item) => item.document.id === opened.documentId)
        ?.document.title,
    ).toBe("Binary trees & traversal.pdf");
    const dashboard = libraryContract["dashboard:get"].response.parse(
      await desktop.invoke("dashboard:get", {}),
    );
    expect(dashboard.month.calls).toBe(0);
    expect(await desktop.invoke("library:tree", {})).toEqual([]);
  });
  it("persists read, reminder, file, disconnect, and reconnect operations", async () => {
    const api = createMockMoodleApi();
    const overview = await api.overview();
    const courseId = overview.courses[0]!.id;
    const detail = await api.course(courseId);
    await api.markRead(detail.notifications[0]!.id);
    expect((await api.overview()).unreadNotifications).toBe(5);
    const reminder = await api.createReminder({
      deadlineId: detail.deadlines[0]!.id,
      remindAt: new Date().toISOString(),
      note: "Review examples",
    });
    expect((await api.course(courseId)).reminders).toEqual([reminder]);
    await api.deleteReminder(reminder.id);
    expect((await api.course(courseId)).reminders).toEqual([]);
    const opened = await api.openFile(detail.files[0]!.id);
    expect((await api.course(courseId)).files[0]!.documentId).toBe(
      opened.documentId,
    );
    await api.disconnect(overview.accounts[0]!.id);
    expect((await api.overview()).courses).toEqual([]);
    await api.connect("cycu");
    expect((await api.overview()).courses).toHaveLength(3);
  });
});
