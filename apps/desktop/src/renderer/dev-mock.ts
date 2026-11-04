import {
  defaultSettings,
  documentSchema,
  conversationSchema,
  messageSchema,
} from "../shared";
import type {
  DesktopApi,
  Document,
  Conversation,
  Message,
  Settings,
  IpcChannel,
  IpcRequest,
  IpcResponse,
  ChatEvent,
  ChatRequest,
  ProviderConfig,
} from "../shared";
export const mockMarkdown = `# Reading with intention

A good question begins with **a closer look**. Select a passage to explore it together.

## Make connections

Connect new ideas to what you already know. Ask why a claim matters, where the evidence leads, and what might change your mind.

| Practice | Purpose |
| --- | --- |
| Read slowly | Notice the details |
| Ask questions | Test understanding |

- [x] Open a document
- [ ] Explore a passage

## A small example

\`\`\`typescript
const insight = reading + reflection;
\`\`\`

The relationship is $E = mc^2$.

> Understanding grows when you put an idea into your own words.
`;
export function createMockBridge(): DesktopApi {
  const documents: Document[] = [],
    conversations: Conversation[] = [],
    messages: Message[] = [];
  let settings: Settings = { ...defaultSettings };
  const keys = new Set<string>();
  const listeners = new Map<string, (event: ChatEvent) => void>();
  const configs: ProviderConfig[] = [
    { kind: "api", id: "openai-api", enabled: true },
    { kind: "api", id: "anthropic-api", enabled: true },
    {
      kind: "compatible",
      id: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      enabled: true,
    },
    { kind: "cli", id: "codex-cli", enabled: true },
    { kind: "cli", id: "claude-cli", enabled: true },
    { kind: "cli", id: "agy-cli", enabled: false },
  ];
  const invoke = async <C extends IpcChannel>(
    channel: C,
    request: IpcRequest<C>,
  ): Promise<IpcResponse<C>> => {
    const input = request as Record<string, unknown>;
    let result: unknown = { ok: true };
    switch (channel) {
      case "dashboard:get":
        result = { pinnedFolders: [], pinnedDocuments: [], recentDocuments: [], month: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 }, series: [], streak: { current: 0, best: 0, today: false, days: [] }, recentActivity: [] };
        break;
      case "usage:forConversation":
      case "usage:forDocument":
      case "usage:rateLimits":
        result = [];
        break;
      case "usage:summary":
        result = { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0, unknownPrices: 0, groups: [] };
        break;
      case "usage:estimate":
        result = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
        break;
      case "library:tree":
      case "library:folders:list":
      case "library:savedFilters:list":
      case "library:tags:list":
        result = [];
        break;
      case "library:counts":
        result = {};
        break;
      case "library:documents:list":
        result = { items: [...documents, ...moodleDocuments].map(document => ({ document, folderId: null, position: 0, pinned: false, pinnedAt: null, lastOpenedAt: null, pageCount: null, sizeBytes: null, contentChars: null, tags: [] })), nextCursor: null };
        break;
      case "settings:systemLocale":
        result = "en";
        break;
      case "settings:appearance":
        result = { reducedTransparency: false };
        break;
      case "welcome:sampleDocument":
        result = mockMarkdown;
        break;
      case "settings:get":
        result = settings;
        break;
      case "settings:set":
        settings = request as Settings;
        result = settings;
        break;
      case "documents:import": {
        const item = documentSchema.parse({
          id: crypto.randomUUID(),
          title: "Reading with intention",
          sourceName: "reading.md",
          sourceHash: "a".repeat(64),
          sourcePath: "mock/reading.md",
          markdownPath: "mock/content.md",
          mime: "text/markdown",
          status: "ready",
          createdAt: new Date().toISOString(),
        });
        documents.push(item);
        result = item;
        break;
      }
      case "documents:list":
        result = [...documents, ...moodleDocuments];
        break;
      case "documents:get":
      case "documents:retry":
        result = [...documents, ...moodleDocuments].find((d) => d.id === input.documentId) ?? null;
        break;
      case "documents:read":
        result = mockMarkdown;
        break;
      case "documents:delete": {
        const collection = documents.some(d => d.id === input.documentId) ? documents : moodleDocuments;
        const index = collection.findIndex(d => d.id === input.documentId);
        if (index >= 0) collection.splice(index, 1);
        break;
      }
      case "conversations:create": {
        const item = conversationSchema.parse({
          ...input,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        });
        conversations.push(item);
        result = item;
        break;
      }
      case "conversations:model": {
        const index=conversations.findIndex(c=>c.id===input.conversationId);
        if(index<0 || messages.some(m=>m.conversationId===input.conversationId)) throw new Error('Only empty conversations can change models');
        const current=conversations[index]!;
        result=conversationSchema.parse({...current,providerId:input.providerId,modelId:input.modelId,options:{}});
        conversations[index]=result as Conversation;
        break;
      }
      case "conversations:list":
        result = conversations.filter((c) => c.documentId === input.documentId);
        break;
      case "conversations:delete":
        conversations.splice(
          conversations.findIndex((c) => c.id === input.conversationId),
          1,
        );
        break;
      case "messages:list":
        result = messages.filter(
          (m) => m.conversationId === input.conversationId,
        );
        break;
      case "providers:list":
        result = configs.map((config) => ({
          config,
          availability:
            config.id === "openai-api" || keys.has(config.id)
              ? { available: true }
              : {
                  available: false,
                  reason:
                    config.kind === "cli" ? "Not detected" : "Add an API key",
                },
          models: [{ id: "mock-model", name: "Preview model" }],
        }));
        break;
      case "providers:configure":
        configs.splice(
          configs.findIndex((c) => c.id === input.id),
          1,
          request as ProviderConfig,
        );
        break;
      case "secrets:has":
        result = {
          providerId: input.providerId,
          hasKey: keys.has(String(input.providerId)),
        };
        break;
      case "secrets:set":
        keys.add(String(input.providerId));
        break;
      case "secrets:delete":
        keys.delete(String(input.providerId));
        break;
      case "chat:abort":
        listeners.get(String(input.requestId))?.({ type: "done" });
        break;
      case "chat:start": {
        const req = request as ChatRequest;
        const text = `You asked: ${req.userMessage}${req.selection ? `\n\nSelected passage:\n${req.selection.text}` : ""}`;
        messages.push(
          messageSchema.parse({
            id: crypto.randomUUID(),
            conversationId: req.conversationId,
            role: "user",
            parts: [{ type: "text", text: req.userMessage }],
            createdAt: new Date().toISOString(),
          }),
        );
        setTimeout(() => {
          const emit = listeners.get(req.requestId);
          emit?.({ type: "text-delta", text });
          emit?.({ type: "done" });
          messages.push(
            messageSchema.parse({
              id: crypto.randomUUID(),
              conversationId: req.conversationId,
              role: "assistant",
              parts: [{ type: "text", text }],
              createdAt: new Date().toISOString(),
            }),
          );
        }, 150);
        break;
      }
    }
    return result as IpcResponse<C>;
  };
  return {
    invoke,
    onChatEvent(id, listener) {
      listeners.set(id, listener);
      return () => {
        listeners.delete(id);
      };
    },
  };
}

import type { MoodleApi } from './courses/api';
import type { MoodleCourseDetail, MoodleAccount } from '../shared/moodle';

const moodleDocuments: Document[] = [];
export function createMockMoodleApi(): MoodleApi {
  const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const at = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
  const schools = [{ id: 'cycu', name: '中原大學 · Chung Yuan Christian University', host: 'https://i-learning.cycu.edu.tw', login: 'sso-launch' as const }, { id: 'demo', name: 'VStudy Demo University', host: 'https://moodle.example.edu', login: 'sso-launch' as const }];
  let accounts: MoodleAccount[] = [{ id: id(1), schoolId: 'cycu', remoteUserId: 20416, displayName: '林以安', status: 'connected', syncedAt: at(-0.01) }];
  const details: MoodleCourseDetail[] = [
    ['資料結構與演算法', 'CS 201', 'Binary trees & traversal', 'Week 08 · Trees', 'Binary tree practice', 'Midterm preparation'],
    ['設計思考與創新', 'DES 102', 'Design research journal', 'Week 05 · Discover', 'Interview reflection', 'Studio critique'],
    ['Academic English', 'ENG 203', 'Argument & evidence', 'Week 06 · Writing', 'Essay outline', 'Peer review workshop'],
  ].map((names, i) => {
    const courseId = id(10 + i), base = 100 + i * 20;
    return {
      course: { id: courseId, accountId: id(1), remoteId: 300 + i, fullName: names[0]!, shortName: names[1]!, imageUrl: null, progress: [64, 38, 82][i]!, startAt: at(-60), endAt: at(60), favourite: i === 0 },
      deadlines: [
        { id: id(base), courseId, title: names[4]!, kind: 'assignment', dueAt: at(1 + i), url: null, submitted: false },
        { id: id(base + 1), courseId, title: names[5]!, kind: 'quiz', dueAt: at(5 + i), url: null, submitted: false },
        { id: id(base + 2), courseId, title: 'Weekly reflection', kind: 'assignment', dueAt: at(-2), url: null, submitted: i !== 0 },
        { id: id(base + 3), courseId, title: 'Final project proposal', kind: 'event', dueAt: at(18), url: null, submitted: false },
      ],
      notifications: [
        { id: id(base + 4), accountId: id(1), courseId, subject: 'Next class: what to prepare', body: `Read ${names[2]} before class. Bring your questions and a first draft of your work. We will discuss examples together.`, createdAt: at(-0.2), read: false, url: null },
        { id: id(base + 5), accountId: id(1), courseId, subject: 'Office hours this week', body: 'Office hours are on Thursday, 14:00–16:00. You are welcome to bring questions about the assignment.', createdAt: at(-1), read: false, url: null },
        { id: id(base + 6), accountId: id(1), courseId, subject: 'New learning materials', body: 'The lecture slides and practice worksheet are now available in the course files.', createdAt: at(-3), read: true, url: null },
      ],
      grades: [{ courseId, name: 'Practice assignments', grade: '27', max: 30, percentage: 90, gradedAt: at(-3) }, { courseId, name: 'Midterm assessment', grade: '42', max: 50, percentage: 84, gradedAt: at(-7) }, { courseId, name: 'Final project', grade: null, max: 100, percentage: null, gradedAt: null }],
      files: [
        { id: id(base + 7), courseId, section: names[3]!, module: 'Lecture', name: `${names[2]}.pdf`, mime: 'application/pdf', size: 2450000, modifiedAt: at(-1), documentId: null },
        { id: id(base + 8), courseId, section: names[3]!, module: 'Lecture', name: 'Lecture slides.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size: 6840000, modifiedAt: at(-2), documentId: null },
        { id: id(base + 9), courseId, section: 'Assignments & resources', module: 'Practice', name: 'Practice worksheet.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 184000, modifiedAt: at(-3), documentId: null },
      ], reminders: [],
    };
  });
  const active = () => details.filter(d => accounts.some(a => a.id === d.course.accountId));
  return {
    schools: async () => structuredClone(schools),
    connect: async schoolId => {
      if (!schools.some(s => s.id === schoolId)) throw new Error('Unknown school');
      const account: MoodleAccount = { id: id(1), schoolId, remoteUserId: 20416, displayName: '林以安', status: 'connected', syncedAt: at(0) };
      accounts = [account]; return structuredClone(account);
    },
    disconnect: async accountId => { accounts = accounts.filter(a => a.id !== accountId); },
    overview: async () => structuredClone({ accounts, courses: active().map(d => d.course), upcoming: active().flatMap(d => d.deadlines).filter(d => !d.submitted).sort((a, b) => a.dueAt.localeCompare(b.dueAt)), unreadNotifications: active().flatMap(d => d.notifications).filter(n => !n.read).length }),
    sync: async accountId => { accounts = accounts.map(a => !accountId || a.id === accountId ? { ...a, syncedAt: at(0) } : a); },
    course: async courseId => { const detail = active().find(d => d.course.id === courseId); if (!detail) throw new Error('Course unavailable'); return structuredClone(detail); },
    openFile: async fileId => {
      const file = active().flatMap(d => d.files).find(f => f.id === fileId);
      if (!file) throw new Error('File unavailable');
      file.documentId ??= crypto.randomUUID();
      if (!moodleDocuments.some(d => d.id === file.documentId)) moodleDocuments.push(documentSchema.parse({ id: file.documentId, title: file.name, sourceName: file.name, sourceHash: 'b'.repeat(64), sourcePath: `mock/${file.name}`, markdownPath: 'mock/content.md', mime: file.mime, status: 'ready', createdAt: at(0) }));
      return { documentId: file.documentId };
    },
    markRead: async notificationId => { const notification = active().flatMap(d => d.notifications).find(n => n.id === notificationId); if (notification) notification.read = true; },
    createReminder: async input => {
      const detail = active().find(d => d.deadlines.some(deadline => deadline.id === input.deadlineId));
      if (!detail) throw new Error('Deadline unavailable');
      const reminder = { ...input, id: crypto.randomUUID(), createdBy: 'user' as const, fired: false };
      detail.reminders.push(reminder); return structuredClone(reminder);
    },
    deleteReminder: async reminderId => { for (const detail of details) detail.reminders = detail.reminders.filter(r => r.id !== reminderId); },
    exportCalendar: async deadlineIds => {
      const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, '\\$&');
      const stamp = (value: string) => value.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const events = active().flatMap(d => d.deadlines).filter(d => deadlineIds.includes(d.id)).map(d => ['BEGIN:VEVENT', `UID:${d.id}@vstudy`, `DTSTAMP:${stamp(at(0))}`, `DTSTART:${stamp(d.dueAt)}`, `SUMMARY:${escape(d.title)}`, 'END:VEVENT'].join('\r\n'));
      const url = URL.createObjectURL(new Blob([['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VStudy//Courses//EN', ...events, 'END:VCALENDAR', ''].join('\r\n')], { type: 'text/calendar' }));
      const link = document.createElement('a'); link.href = url; link.download = 'vstudy-deadlines.ics'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}
