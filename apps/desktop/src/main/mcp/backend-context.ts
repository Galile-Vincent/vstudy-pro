/** Resolve all IDs through the selected granted account, including after an approval or queue wait. @packageDocumentation */
import type { ToolArguments, Provenance, McpAuthorization } from '../../shared/mcp';
import type { MoodleRepository } from '../moodle/repository';
import { available, fail } from './backend-errors';
import { contentText } from './backend-page';

export class BackendContext {
  readonly provenance: Provenance;
  constructor(readonly repository:MoodleRepository, readonly accountId:string | null, readonly accountIds:readonly string[], readonly args:ToolArguments, readonly signal?:AbortSignal, readonly text:typeof contentText = contentText, private readonly authorize?:McpAuthorization) {
    this.provenance = {account:accountId, school:null, courseId:null, moduleId:null, author:null, syncedAt:null};
    if (accountId) {
      const account = this.account();
      this.provenance.school = text(account.siteName, 200);
      this.provenance.syncedAt = account.syncedAt;
    }
    this.recheck();
    if ('courseId' in args && args.courseId) {
      this.provenance.courseId = args.courseId;
      this.provenance.syncedAt = repository.detailCache(args.courseId)?.refreshedAt ?? this.provenance.syncedAt;
    }
    if ('moduleId' in args) this.provenance.moduleId = args.moduleId;
    if ('fileId' in args) {
      const {file} = this.file(args.fileId);
      this.provenance.courseId = file.courseId;
      this.provenance.moduleId = this.course(file.courseId).sections.flatMap(section => section.modules).find(module => module.fileIds.includes(file.id))?.id ?? null;
      this.provenance.syncedAt = repository.detailCache(file.courseId)?.refreshedAt ?? this.provenance.syncedAt;
    }
  }
  account() {
    if (!this.accountId) fail('ACCOUNT_REQUIRED');
    if (!this.accountIds.includes(this.accountId)) fail('DENIED');
    return available(() => this.repository.account(this.accountId!));
  }
  course(id:string) {
    this.account();
    const detail = available(() => this.repository.course(id));
    if (detail.course.accountId !== this.accountId) fail('DENIED');
    return detail;
  }
  module(courseId:string, moduleId:string) {
    const course = this.course(courseId);
    for (const section of course.sections) {
      const module = section.modules.find(row => row.id === moduleId);
      if (!module) continue;
      if (!section.accessible || !module.accessible) fail('DENIED');
      return module;
    }
    fail('NOT_FOUND');
  }
  file(id:string) {
    this.account();
    const record = available(() => this.repository.file(id));
    const detail = this.course(record.file.courseId);
    if (record.account.id !== this.accountId) fail('DENIED');
    if (!detail.sections.some(section => section.accessible && section.modules.some(module => module.accessible && module.fileIds.includes(id)))) fail('DENIED');
    return record;
  }
  ownsCourse(id:string | null): void { if (id) this.course(id); }
  courses() { return this.accountId ? this.repository.overview(this.account().id).courses : []; }
  recheck(): void {
    const code = this.authorize?.();
    if (code) fail(code);
    if (this.signal?.aborted) fail('DENIED');
    if (this.accountId) this.account();
    if ('courseId' in this.args && this.args.courseId) this.course(this.args.courseId);
    if ('moduleId' in this.args) this.module(this.args.courseId, this.args.moduleId);
    if ('fileId' in this.args) this.file(this.args.fileId);
  }
}

export function selectAccount(repository:MoodleRepository, accountIds:readonly string[], explicit:string | undefined, local = false): string | null {
  const eligible = repository.accounts().filter(account => accountIds.includes(account.id));
  if (explicit) {
    if (!accountIds.includes(explicit)) fail('DENIED');
    if (!eligible.some(account => account.id === explicit)) fail('NOT_FOUND');
    return explicit;
  }
  if (eligible.length === 1) return eligible[0]!.id;
  if (local && eligible.length === 0) return null;
  fail('ACCOUNT_REQUIRED');
}
