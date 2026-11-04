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
        result = moodleDocumentSources.get(String(input.documentId)) ?? mockMarkdown;
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
        result = conversations.filter((c) => c.scope === "course" ? c.courseId === input.courseId : c.documentId === input.documentId);
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
        const text = `You asked: ${req.userMessage}${req.scope !== "course" && req.selection ? `\n\nSelected passage:\n${req.selection.text}` : ""}`;
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
const moodleDocumentSources = new Map<string, string>();
export function createMockMoodleApi(): MoodleApi {
  const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const at = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
  const schools = [{ id: 'cycu', name: '中原大學 · Chung Yuan Christian University', host: 'https://ilearning.cycu.edu.tw', login: 'sso-launch' as const }, { id: 'demo', name: 'VStudy Demo University', host: 'https://moodle.example.edu', login: 'sso-launch' as const }];
  let accounts: MoodleAccount[] = [{ id: id(1), siteUrl:'https://ilearning.cycu.edu.tw',siteName:'中原大學 CYCU', remoteUserId: 20416, displayName: '林以安', status: 'connected', syncedAt: at(-0.01) }];
  const details: MoodleCourseDetail[] = [
    ['1142電子電路實驗-湯松年(資訊二乙)[CS924E]1142Electronics Laboratory-TANG, SONG-NIEN(CSB)[CS924E]', '1142_CS924E', 'Operational amplifiers', 'Week 08 · Amplifiers', 'Amplifier lab report', 'Midterm preparation'],
    ['1141數位邏輯電路設計-(資訊二乙)[CS210E]1141Logic Design(CSB)[CS210E]', '1141_CS210E', 'Combinational circuits', 'Week 05 · Logic gates', 'Logic design worksheet', 'Circuit review'],
    ['1151機率與統計(一)-蘇志文(資訊三乙)[CS313H]1151Probability & Statistics (1)-SU,CHIH-WEN(CSB)[CS313H]', '1151_CS313H', 'Probability distributions', 'Week 06 · Probability', 'Distribution exercises', 'Probability quiz'],
    ['1132英文(二)-沈俞君(工業管理組 一丙)[IE609C]1132English (II)-SHEN, YU-CHUN(IE)[IE609C]', '1132_IE609C', 'Argument & evidence', 'Week 08 · Writing', 'Essay outline', 'Peer review'],
  ].map((names, i) => {
    const courseId = id(10 + i), base = 100 + i * 1000;
    return {
      course: { id: courseId, accountId: id(1), remoteId: 300 + i, fullName: names[0]!, shortName: names[1]!, imageUrl: null, progress: [64, null, 0, 82][i]!, startAt: at(-60), endAt: at(60), favourite: i === 0, identity:{title:{zh:['電子電路實驗','數位邏輯電路設計','機率與統計(一)','英文(二)'][i]!,en:['Electronics Laboratory','Logic Design','Probability & Statistics (1)','English (II)'][i]!},teachers:i === 1 ? [] : [{zh:['湯松年','','蘇志文','沈俞君'][i]!,en:['TANG, SONG-NIEN','','SU,CHIH-WEN','SHEN, YU-CHUN'][i]!}],code:['CS924E','CS210E','CS313H','IE609C'][i]!,term:['1142','1141','1151','1132'][i]!,classLabel:{zh:i === 3 ? '工業管理組 一丙' : i === 2 ? '資訊三乙' : '資訊二乙',en:i === 3 ? 'IE · Year 1 C' : i === 2 ? 'CS · Year 3 B' : 'CS · Year 2 B'},lifecycle:i === 0 ? 'current' : i === 2 ? 'future' : 'past',lifecycleSource:'server',hidden:false,hasProgress:i !== 1,format:'weeks',summaryHtml:null} },
      sections: Array.from({length:16}, (_, w) => ({
        id:id(base+30+w),number:w+1,name:`Week ${String(w+1).padStart(2,'0')} · ${['Introduction & safety','Measurement fundamentals','Circuit analysis','Diodes','Transistors','Amplifiers','Practice & review','Applications'][w%8]}`,summaryHtml:w === 7 ? '<p>本週重點 · Review the lecture notes, then complete the lab exercise before Friday.</p>' : null,accessible:w !== 15,current:w === 7,weekStart:at((w-7)*7),
        modules: (w === 7 ? ['label','resource','resource','folder','url','page','forum','assign','quiz','subsection'] as const : ['resource','assign'] as const).map((kind,m) => ({id:id(base+100+w*20+m),cmid:1000+w*20+m,kind,modname:kind,name:kind === 'resource' ? (m === 2 ? 'Lecture slides.pptx' : `${names[2]}.pdf`) : ({label:'課前準備 · Before class',folder:'Lab worksheets',url:'Interactive circuit simulator',page:'實驗步驟 · Lab instructions',forum:'公告與討論 · Announcements',assign:'本週實驗報告 · Weekly lab report',quiz:'Concept check',subsection:'延伸閱讀 · Further reading'}[kind] ?? 'Activity'),descriptionHtml:'<h3>學習目標 · Learning objectives</h3><p>閱讀教材並記錄實驗結果。Review the material and record your observations.</p><ul><li>Prepare your circuit diagram.</li><li>Explain your measurements in your own words.</li></ul>',url:`https://ilearning.cycu.edu.tw/mod/${kind}/view.php?id=${1000+w*20+m}`,accessible:true,completion:m%3 === 0 ? 'none' : w < 7 || m === 1 ? 'complete' : 'incomplete',dueAt:kind === 'assign' || kind === 'quiz' ? at((w-7)*7+3) : null,submitted:kind === 'assign' ? w < 7 : null,fileIds:kind === 'resource' ? [id(base+(m === 2 ? 8 : 7))] : kind === 'folder' ? [id(base+9)] : []})),
      })),
      announcements:[{id:id(base+25),subject:'本週實驗注意事項 · This week in the lab',author:['湯松年 · TANG, SONG-NIEN','課程助教','蘇志文 · SU,CHIH-WEN','沈俞君 · SHEN, YU-CHUN'][i]!,createdAt:at(-1),bodyHtml:'<p>同學們好，請於上課前閱讀講義並攜帶實驗紀錄本。</p><p>Please review the lecture notes before class and bring your lab notebook. We will compare our results in small groups.</p>',url:null},{id:id(base+26),subject:'Office hours & course materials',author:'Course teaching team',createdAt:at(-4),bodyHtml:'<p>本週諮詢時間為星期四 14:00–16:00。</p><p>Office hours are Thursday, 14:00–16:00. Lecture slides and practice sheets are now available.</p>',url:null}],
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
    ssoState: async () => null,
    ssoCancel: async () => {},
    checkSite: async url => ({siteUrl:url.startsWith('https://') ? url.replace(/\/$/,'') : `https://${url}`,siteName:schools.find(s => s.host === url)?.name ?? 'Example University',authPlan:{kind:'browser',providers:[{name:'University ID',url:'https://moodle.example.edu/auth/oauth2/login.php?id=1',iconurl:''}]}}),
    connect: async ({siteUrl}) => {
      const account: MoodleAccount = { id: id(1), siteUrl, siteName:schools.find(s => s.host === siteUrl)?.name ?? 'Example University', remoteUserId: 20416, displayName: '林以安', status: 'connected', syncedAt: at(0) };
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
      const detail = active().find(d => d.course.id === file.courseId)!;
      const preparation = detail.course.shortName === 'CS 201'
        ? 'A binary tree gives each node at most two children. Compare preorder, inorder, and postorder traversal, then trace each traversal on a tree with seven nodes.'
        : detail.course.shortName === 'DES 102'
          ? 'Start with observation before proposing a solution. Prepare five open questions for your interview, record what you notice, and separate observations from assumptions.'
          : 'A strong academic argument connects a clear claim with relevant evidence. Draft a topic sentence, choose two supporting sources, and explain how the evidence supports your claim.';
      moodleDocumentSources.set(file.documentId, `# ${file.name.replace(/\.[^.]+$/, '')}\n\n${detail.course.fullName} · ${file.section}\n\n## Before class\n\n${preparation}\n\n## Preparation checklist\n\n- Review the lecture material.\n- Write down two questions for discussion.\n- Bring a first attempt at the practice task.\n\n## Reflection\n\nExplain one idea in your own words and connect it to a previous lesson.\n`);
      return { documentId: file.documentId };
    },
    markRead: async notificationId => { const notification = active().flatMap(d => d.notifications).find(n => n.id === notificationId); if (notification) notification.read = true; },
    createReminder: async input => {
      const detail = active().find(d => d.deadlines.some(deadline => deadline.id === input.deadlineId));
      if (!detail) throw new Error('Deadline unavailable');
      const reminder = { ...input, id: crypto.randomUUID(), createdBy: input.createdBy ?? 'user' as const, fired: false };
      detail.reminders.push(reminder); return structuredClone(reminder);
    },
    deleteReminder: async reminderId => { for (const detail of details) detail.reminders = detail.reminders.filter(r => r.id !== reminderId); },
    exportCalendar: async deadlineIds => {
      const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, '\\$&');
      const stamp = (value: string) => value.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const events = active().flatMap(d => d.deadlines).filter(d => deadlineIds.includes(d.id)).map(d => ['BEGIN:VEVENT', `UID:${d.id}@vstudy`, `DTSTAMP:${stamp(at(0))}`, `DTSTART:${stamp(d.dueAt)}`, `SUMMARY:${escape(d.title)}`, 'END:VEVENT'].join('\r\n'));
      const url = URL.createObjectURL(new Blob([['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VStudy//Courses//EN', ...events, 'END:VCALENDAR', ''].join('\r\n')], { type: 'text/calendar' }));
      const link = document.createElement('a'); link.href = url; link.download = 'vstudy-deadlines.ics'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      return {saved:true};
    },
  };
}
