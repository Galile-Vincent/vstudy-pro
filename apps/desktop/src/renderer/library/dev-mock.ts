import { documentSchema } from '../../shared/domain';
import type { IpcResponse } from '../../shared/ipc';

type Item = IpcResponse<'library:documents:list'>['items'][number];
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const course = (n: number, zh: string, en: string, term: string) => ({ id: id(n), fullName: `${term}${zh}`, identity: { title: { zh, en }, teachers: [], term } });
const courses = [course(1, '電子電路實驗', 'Electronics Laboratory', '1142'), course(2, '數位邏輯電路設計', 'Logic Design', '1141'), course(3, '機率與統計(一)', 'Probability & Statistics (1)', '1151')];
const rows: [string, string, number | null, number, number | null][] = [
  ['Operational amplifiers.pdf', 'application/pdf', 36, 2450000, 0],
  ['Lab 03 report template.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 4, 184000, 0],
  ['Amplifier design notes.pdf', 'application/pdf', 18, 910000, 0],
  ['Combinational circuits.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 52, 6840000, 1],
  ['Logic gates worksheet.pdf', 'application/pdf', 6, 320000, 1],
  ['Probability distributions.pdf', 'application/pdf', 84, 3084500, 2],
  ['Exam review.md', 'text/markdown', null, 12000, 2],
  ['Computer Organization Chapter05 Memory Hierarchy 20251023 00.pdf', 'application/pdf', 84, 3084500, null],
  ['Reading with intention.md', 'text/markdown', null, 4200, null],
];

export function libraryDemoItems(): Item[] {
  return rows.map(([name, mime, pageCount, sizeBytes, courseIndex], index) => ({
    document: documentSchema.parse({ id: id(100 + index), title: name.replace(/\.[^.]+$/, ''), sourceName: name, sourceHash: 'c'.repeat(64), sourcePath: `mock/${name}`, markdownPath: 'mock/content.md', mime, status: 'ready', createdAt: `2026-11-0${1 + (index % 7)}T08:00:00.000Z` }),
    folderId: null, position: index, pinned: index === 0, pinnedAt: index === 0 ? '2026-11-06T08:00:00.000Z' : null, lastOpenedAt: null, pageCount, sizeBytes, contentChars: null, tags: [],
    course: courseIndex === null ? null : courses[courseIndex]!,
  }));
}
