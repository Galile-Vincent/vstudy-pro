/** Main-owned backend dependencies and the typed registry keep agent inputs out of transport APIs. @packageDocumentation */
import type { z } from 'zod';
import type { Store } from '../db';
import type { MoodleService } from '../moodle/service';
import type { DocumentService } from '../services/documents';
import type { PlannerRepository } from '../planner/repository';
import type { plannerCalendarSchema } from '../../shared/planner';
import type { ToolArguments, ToolName } from '../../shared/mcp';
import type { BackendContext } from './backend-context';
import type { BackendRemote } from './backend-remote';
import type { BackendPages } from './backend-page';

/** Only main supplies these services. No dependency or callback returns school credentials. */
export interface McpBackendOptions {
  store: Pick<Store, 'db' | 'documents'>;
  moodle: Pick<MoodleService, 'repository' | 'mcpClient'>;
  documents: Pick<DocumentService, 'read'>;
  openModule: (accountId:string, courseId:string, moduleId:string) => void | Promise<void>;
  exportCalendar: (selection:z.infer<typeof plannerCalendarSchema>) => Promise<{saved:boolean}>;
  planner?: PlannerRepository;
  clock?: () => number;
  wait?: (ms:number) => Promise<void>;
  random?: () => number;
}
export type BackendResult = {content:unknown; nextCursor?:string | null};
export interface BackendServices {
  options: McpBackendOptions;
  planner: PlannerRepository;
  remote: BackendRemote;
  pages: BackendPages;
  clock: () => number;
}
export type BackendHandlers = {[N in ToolName]: (context:BackendContext, args:ToolArguments<N>) => Promise<BackendResult>};
