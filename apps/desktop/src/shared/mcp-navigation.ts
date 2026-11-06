/** Approved module navigation uses account-owned stable targets, never bearer-bearing agent URLs. @packageDocumentation */
import { z } from 'zod';
export const agentNavigationSchema = z.object({accountId:z.string().uuid(),courseId:z.string().uuid(),moduleId:z.string().uuid(),url:z.string().url().max(8192)}).strict();
export type AgentNavigation = z.infer<typeof agentNavigationSchema>;
export const mcpNavigationIpc = {
  'mcp:take-navigation':{request:z.object({}).strict(),response:agentNavigationSchema.nullable()},
} as const;
