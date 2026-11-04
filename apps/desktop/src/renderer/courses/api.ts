import type {
  MoodleAccount,
  MoodleCourseDetail,
  MoodleOverview,
  MoodleReminder,
  MoodleSchool,
} from "../../shared/moodle";
import { createMockMoodleApi } from "../dev-mock";
import { desktop, isMock } from "../bridge";
import type { IpcChannel, IpcRequest } from "../../shared/ipc";
import { moodleChannels } from "../../shared/moodle";

export interface MoodleApi {
  schools(): Promise<MoodleSchool[]>;
  checkSite(url: string): Promise<import("../../shared/moodle").MoodleSiteCheck>;
  connect(input: IpcRequest<"moodle:connect">): Promise<MoodleAccount>;
  ssoState(siteUrl: string): Promise<import('../../shared/moodle').MoodleSsoMode | null>;
  ssoCancel(siteUrl: string): Promise<void>;
  disconnect(accountId: string): Promise<void>;
  overview(): Promise<MoodleOverview>;
  sync(accountId?: string): Promise<void>;
  course(courseId: string): Promise<MoodleCourseDetail>;
  openFile(fileId: string): Promise<{ documentId: string }>;
  markRead(notificationId: string): Promise<void>;
  createReminder(input: {
    deadlineId: string;
    remindAt: string;
    note: string;
    createdBy?: "user" | "agent";
  }): Promise<MoodleReminder>;
  deleteReminder(id: string): Promise<void>;
  exportCalendar(deadlineIds: string[]): Promise<{saved:boolean}>;
}

const mock = createMockMoodleApi();

function createBridgeMoodleApi(): MoodleApi {
  const call = <C extends IpcChannel>(channel: C, request: IpcRequest<C>) =>
    desktop.invoke(channel, request);
  return {
    schools: () => call(moodleChannels.schools, {}),
    checkSite: (url) => call(moodleChannels.checkSite, {url}),
    connect: (input) => call(moodleChannels.connect, input),
    ssoState: (siteUrl) => call(moodleChannels.ssoState, {siteUrl}),
    ssoCancel: async (siteUrl) => {await call(moodleChannels.ssoCancel, {siteUrl});},
    disconnect: async (accountId) => {
      await call(moodleChannels.disconnect, { accountId });
    },
    overview: () => call(moodleChannels.overview, {}),
    sync: async (accountId) => {
      const result = await call(moodleChannels.sync, accountId ? { accountId } : {});
      if (result.errors.length) throw new Error('Moodle sync incomplete');
    },
    course: (courseId) => call(moodleChannels.course, { courseId }),
    openFile: async (fileId) => ({
      documentId: await call(moodleChannels.openFile, { fileId }),
    }),
    markRead: async (notificationId) => {
      await call(moodleChannels.markRead, { notificationId });
    },
    createReminder: ({ deadlineId, remindAt, note, createdBy = "user" }) =>
      call(moodleChannels.createReminder, {
        deadlineId,
        remindAt,
        note,
        createdBy,
      }),
    deleteReminder: async (reminderId) => {
      await call(moodleChannels.deleteReminder, { reminderId });
    },
    exportCalendar: async (deadlineIds) => {
      return call(moodleChannels.exportCalendar, { deadlineIds });
    },
  } as MoodleApi;
}

const real = isMock ? null : createBridgeMoodleApi();
export function useMoodleApi(): MoodleApi {
  return real ?? mock;
}
