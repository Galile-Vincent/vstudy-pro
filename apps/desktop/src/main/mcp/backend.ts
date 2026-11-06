/**
 * Implement the fixed MCP registry inside main. Preparation never mutates student data.
 * Callers approve writes before execute. Execution rechecks live ownership and runs writes once.
 * Search requires the engine's read:content and read:files gates. Secrets never enter tool results.
 * @packageDocumentation
 */
import type { McpBackend, PreparedMcpCall, ToolArguments, ToolName } from '../../shared/mcp';
import { mcpTools } from '../../shared/mcp';
import { PlannerRepository } from '../planner/repository';
import { BackendContext, selectAccount } from './backend-context';
import { backendBoundary, fail } from './backend-errors';
import { BackendPages, contentText } from './backend-page';
import { BackendRemote } from './backend-remote';
import { cachedHandlers } from './backend-cached';
import { plannerHandlers, validateLocal } from './backend-planner';
import { searchHandler } from './backend-search';
import { forumHandlers } from './backend-forums';
import { remoteReadHandlers } from './backend-reads';
import { syncHandler } from './backend-sync';
import { completionCandidate, writeHandlers } from './backend-writes';
import type { BackendHandlers, BackendServices, McpBackendOptions } from './backend-types';
export type { McpBackendOptions } from './backend-types';
export { McpBackendError } from './backend-errors';

export interface CancellablePreparedMcpCall extends PreparedMcpCall {
  execute:(signal?:AbortSignal) => ReturnType<PreparedMcpCall['execute']>;
}
export interface MainMcpBackend extends McpBackend {
  prepare:(name:ToolName, args:ToolArguments, accountIds:readonly string[]) => Promise<CancellablePreparedMcpCall>;
  secretValues:() => readonly string[];
}

/**
 * Supply store, MoodleService, DocumentService and typed main callbacks for opening and export.
 * Optional planner and timing dependencies support isolated tests. This factory performs no IO.
 * Pass secretValues directly to createMcpEngine. Its loaded-token snapshot stays in main only.
 * Pass the engine's grant-cancellation signal to execute so queued and follow-up requests stop.
 */
export function createMcpBackend(options:McpBackendOptions): MainMcpBackend {
  const secrets = new Set<string>();
  const services:BackendServices = {
    options, planner:options.planner ?? new PlannerRepository(options.store.db, options.clock),
    clock:options.clock ?? Date.now, pages:new BackendPages(),
    remote:new BackendRemote(options, values => values.forEach(value => secrets.add(value))),
  };
  const handlers:BackendHandlers = {
    ...cachedHandlers(services), ...plannerHandlers(services), ...forumHandlers(services),
    ...remoteReadHandlers(services), ...writeHandlers(services),
    search_content:searchHandler(services), sync_now:syncHandler(services),
  };
  const local = new Set<ToolName>(['get_planner', 'create_task', 'update_task', 'create_study_plan_proposal', 'set_reminder', 'export_calendar']);
  return {
    accounts:() => options.moodle.repository.accounts().map(row => ({id:row.id, school:contentText(row.siteName, 200), user:contentText(row.displayName, 200)})),
    secretValues:() => [...secrets],
    prepare:(name, input, accountIds) => backendBoundary(async () => {
      const parsed = mcpTools[name]?.schema.safeParse(input);
      if (!parsed?.success) fail('INVALID_ARGUMENT');
      const args = parsed.data as ToolArguments;
      const granted = [...accountIds];
      const accountId = name === 'list_accounts' ? null : selectAccount(options.moodle.repository, granted, args.account, local.has(name));
      const context = new BackendContext(options.moodle.repository, accountId, granted, args);
      if (local.has(name)) validateLocal(context, services, name, args);
      if (name === 'mark_module_complete' && 'moduleId' in args) completionCandidate(context, args.courseId, args.moduleId);
      if (mcpTools[name].risk !== 'read' && name !== 'open_in_app' && !local.has(name)) services.remote.require(context, mcpTools[name].functions);
      const course = 'courseId' in args && args.courseId ? context.course(args.courseId).course : null;
      const module = 'moduleId' in args ? context.module(args.courseId, args.moduleId) : null;
      const target = [context.provenance.school ?? 'Local planner', course?.fullName, module?.name, course?.id, module?.id].filter(Boolean).map(value => contentText(value!, 300)).join(' / ').slice(0, 1000);
      let used = false;
      const prepared:CancellablePreparedMcpCall = {accountId, target, provenance:context.provenance, execute:(signal?:AbortSignal) => backendBoundary(async () => {
        if (mcpTools[name].risk !== 'read') { if (used) fail('EXPIRED'); used = true; }
        const execution = new BackendContext(options.moodle.repository, accountId, granted, args, signal);
        execution.recheck();
        // The registry maps each key to its schema; union indexing loses that correlation in TypeScript.
        const handler = handlers[name] as (context:BackendContext, args:ToolArguments) => ReturnType<BackendHandlers[ToolName]>;
        const result = await handler(execution, args);
        execution.recheck();
        Object.assign(context.provenance, execution.provenance);
        return result;
      })};
      return prepared;
    }),
  };
}
