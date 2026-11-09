import { z } from 'zod';
const version = z.string().regex(/^\d+\.\d+\.\d+$/);
export const updateStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('idle') }).strict(),
  z.object({ status: z.literal('checking') }).strict(),
  z.object({ status: z.literal('available'), version,
    releaseUrl: z.string().regex(/^https:\/\/github\.com\/ava-apple\/vstudy-pro\/releases\/tag\/v\d+\.\d+\.\d+$/) }).strict(),
  z.object({ status: z.literal('downloading'), percent: z.number().finite().min(0).max(100) }).strict(),
  z.object({ status: z.literal('ready'), version }).strict(),
  z.object({ status: z.literal('error'), code: z.enum(['offline', 'network', 'integrity', 'failed']) }).strict(),
  z.object({ status: z.literal('unsupported'), reason: z.enum(['development', 'unsigned', 'platform', 'portable']) }).strict(),
]);
export type UpdateState = z.infer<typeof updateStateSchema>;
export const updateSnapshotSchema = z.object({ state: updateStateSchema,
  currentVersion: z.string(), lastCheckedAt: z.number().nullable(), automatic: z.boolean() }).strict();
export type UpdateSnapshot = z.infer<typeof updateSnapshotSchema>;
const empty = z.object({}).strict();
export const updatesContract = {
  'updates:state': { request: empty, response: updateSnapshotSchema },
  'updates:check': { request: empty, response: updateSnapshotSchema },
  'updates:download': { request: empty, response: updateSnapshotSchema },
  'updates:install': { request: empty, response: updateSnapshotSchema },
  'updates:setAuto': { request: z.object({ enabled: z.boolean() }).strict(), response: updateSnapshotSchema },
  'updates:notes': { request: empty, response: z.object({ ok: z.literal(true) }).strict() },
};
