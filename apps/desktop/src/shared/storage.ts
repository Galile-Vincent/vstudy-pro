/**
 * Define bounded storage inventories and confirmed maintenance request contracts.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
/** Storage settings IPC accepts actions only. Main owns every filesystem path and dialog. */
import { z } from 'zod';
export const storageCategorySchema=z.enum(['database','originals','converted','cache','configuration','recovery','other']);
export type StorageCategory=z.infer<typeof storageCategorySchema>;
export const storageUsageSchema=z.object({pendingRestore:z.boolean(),categories:z.array(z.object({id:storageCategorySchema,bytes:z.number().nonnegative(),files:z.number().int().nonnegative()}).strict()),cacheBytes:z.number().nonnegative()}).strict();
const empty=z.object({}).strict(),ack=z.object({ok:z.literal(true)}).strict();
const cleanupAck=z.union([ack,z.object({cancelled:z.literal(true)}).strict()]);
/** Storage actions use validated intent and native dialogs rather than renderer filesystem paths. */
export const storageContract={
  'storage:restart':{request:empty,response:ack},
  'storage:usage':{request:empty,response:storageUsageSchema},
  'storage:clearCache':{request:empty,response:cleanupAck},
  'storage:clearConverted':{request:empty,response:cleanupAck},
  'storage:export':{request:empty,response:z.object({saved:z.boolean()}).strict()},
  'storage:restore':{request:empty,response:z.object({scheduled:z.boolean()}).strict()},
  'storage:integrity':{request:empty,response:z.object({ok:z.boolean(),issues:z.number().int().nonnegative()}).strict()},
};
