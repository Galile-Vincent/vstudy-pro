/**
 * Validated AI setup capabilities shared by main and the isolated renderer.
 * Commands, download locations, environment, and working directories are main-owned.
 * @packageDocumentation
 */
import { z } from 'zod';

export const cliProviderSchema = z.enum(['claude', 'codex', 'agy']);
export type CliProvider = z.infer<typeof cliProviderSchema>;
export const cliStatusSchema = z.enum(['not-installed', 'installing', 'installed-not-signed-in', 'signing-in', 'ready', 'update-available', 'updating', 'error']);
export const cliFailureSchema = z.enum(['command-not-found', 'rate-limit', 'offline', 'permission-denied', 'terminal-unavailable', 'manual-install-required', 'blocked', 'wrong-version', 'browser-not-opened', 'login-expired', 'not-signed-in', 'checksum', 'signature', 'unsupported', 'not-consented', 'cancelled', 'busy', 'unknown']);
export type CliFailure = z.infer<typeof cliFailureSchema>;
const stateFields = {
  provider: cliProviderSchema,
  consented: z.boolean(),
  version: z.string().max(100).nullable(),
  path: z.string().max(8192).nullable(),
  managed: z.boolean(),
  manualInstallRequired: z.boolean().default(true),
  manualUpdateRequired: z.boolean().default(true),
  latestVersion: z.string().max(100).nullable(),
  releaseNotesUrl: z.string().url().max(8192).nullable(),
  checkedAt: z.number().nonnegative().nullable(),
  previousVersion: z.string().max(100).nullable(),
  appliesToNewChats: z.boolean(),
  tested: z.boolean(),
};
export const cliToolStateSchema = z.discriminatedUnion('status', [
  z.object({ ...stateFields, status: cliStatusSchema.exclude(['error']), error: z.null() }).strict(),
  z.object({ ...stateFields, status: z.literal('error'), error: z.object({ code: cliFailureSchema, hint: cliFailureSchema }).strict() }).strict(),
]);
export type CliToolState = z.infer<typeof cliToolStateSchema>;
export const cliActionIdSchema = z.enum([
  'install-claude', 'login-claude', 'status-claude', 'test-claude', 'update-claude', 'rollback-claude',
  'install-codex', 'login-codex', 'status-codex', 'test-codex', 'update-codex', 'rollback-codex',
  'install-agy', 'login-agy', 'status-agy', 'test-agy', 'update-agy', 'rollback-agy',
  'terminal-claude', 'terminal-codex', 'terminal-agy',
  'advanced-shell',
]);
export type CliActionId = z.infer<typeof cliActionIdSchema>;
export const cliPreferencesSchema = z.object({ updateChecks: z.boolean(), autoUpdateWhenIdle: z.boolean(), advancedShell: z.boolean() }).strict();
export type CliPreferences = z.infer<typeof cliPreferencesSchema>;
export const cliActionPlanSchema = z.object({
  actionId: cliActionIdSchema,
  token: z.string().uuid(),
  command: z.string().max(32768),
  cwd: z.string().max(8192),
  available: z.boolean(),
  reason: cliFailureSchema.nullable(),
  expiresAt: z.number().nonnegative(),
}).strict();
export type CliActionPlan = z.infer<typeof cliActionPlanSchema>;
export const cliActionSessionSchema = z.object({
  id: z.string().uuid(),
  actionId: cliActionIdSchema,
  phase: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
  output: z.string().max(262144),
  truncated: z.boolean(),
  exitCode: z.number().int().nullable(),
  error: cliFailureSchema.nullable(),
}).strict();
export type CliActionSession = z.infer<typeof cliActionSessionSchema>;
const empty = z.object({}).strict();
const ack = z.object({ ok: z.literal(true) }).strict();
const session = z.object({ id: z.string().uuid() }).strict();
export const aiCliContract = {
  'ai-cli:list': { request: empty, response: z.array(cliToolStateSchema) },
  'ai-cli:consent': { request: z.object({ provider: cliProviderSchema, enabled: z.boolean() }).strict(), response: ack },
  'ai-cli:preview': { request: z.object({ actionId: cliActionIdSchema }).strict(), response: cliActionPlanSchema },
  'ai-cli:run': { request: z.object({ actionId: cliActionIdSchema, token: z.string().uuid() }).strict(), response: cliActionSessionSchema },
  'ai-cli:read': { request: session, response: cliActionSessionSchema },
  'ai-cli:input': { request: z.object({ id: z.string().uuid(), data: z.string().min(1).max(4096) }).strict(), response: ack },
  'ai-cli:resize': { request: z.object({ id: z.string().uuid(), columns: z.number().int().min(20).max(300), rows: z.number().int().min(5).max(120) }).strict(), response: ack },
  'ai-cli:close': { request: session, response: ack },
  'ai-cli:preferences': { request: empty, response: cliPreferencesSchema },
  'ai-cli:setPreferences': { request: cliPreferencesSchema, response: cliPreferencesSchema },
  'ai-cli:checkUpdates': { request: empty, response: z.array(cliToolStateSchema) },
  'ai-cli:openTerminal': { request: z.object({ actionId: cliActionIdSchema, token: z.string().uuid() }).strict(), response: z.object({ ok: z.boolean() }).strict() },
} satisfies Record<string, { request: z.ZodTypeAny; response: z.ZodTypeAny }>;
