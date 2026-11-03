import { z } from 'zod';
import { documentIdSchema, documentSchema } from './domain';
export const folderIdSchema = z.string().uuid().brand<'FolderId'>();
export const tagIdSchema = z.string().uuid().brand<'TagId'>();
export const filterIdSchema = z.string().uuid().brand<'FilterId'>();
const name = z.string().trim().min(1).max(200);
const empty = z.object({}).strict();
const ack = z.object({ok:z.literal(true)}).strict();
const id = z.object({documentId:documentIdSchema}).strict();
export const folderSchema = z.object({id:folderIdSchema,parentId:folderIdSchema.nullable(),name,color:z.string().max(32).nullable(),icon:z.string().max(64).nullable(),position:z.number(),pinned:z.number().int(),pinnedAt:z.string().nullable(),createdAt:z.string(),updatedAt:z.string(),count:z.number().optional()});
export const tagSchema = z.object({id:tagIdSchema,name,color:z.string().max(32).nullable()});
export const libraryDocumentSchema = z.object({document:documentSchema,folderId:folderIdSchema.nullable(),position:z.number(),pinned:z.boolean(),pinnedAt:z.string().nullable(),lastOpenedAt:z.string().nullable(),pageCount:z.number().nullable(),sizeBytes:z.number(),contentChars:z.number()});
export const libraryQuerySchema = z.object({
  view:z.enum(['all','recent','pinned','unfiled','converting-failed']).optional(),
  folderId:folderIdSchema.nullable().optional(),subfolders:z.boolean().optional(),
  tagId:tagIdSchema.optional(),type:z.enum(['pdf','word','excel','powerpoint','text','web','other']).optional(),
  status:z.enum(['converting','ready','failed']).optional(),converter:z.enum(['pdf_md','markitdown']).optional(),
  addedAfter:z.string().datetime().optional(),addedBefore:z.string().datetime().optional(),
  minSize:z.number().nonnegative().optional(),maxSize:z.number().nonnegative().optional(),hasChats:z.boolean().optional(),pinned:z.boolean().optional(),
  text:z.string().trim().max(200).optional(),sort:z.enum(['manual','name','createdAt','lastOpenedAt','size','type']).default('manual'),direction:z.enum(['asc','desc']).default('asc'),
  cursor:z.object({value:z.union([z.string(),z.number()]),id:documentIdSchema}).strict().optional(),limit:z.number().int().min(1).max(100).default(50),
}).strict();
export type LibraryQuery = z.infer<typeof libraryQuerySchema>;
export const savedFilterSchema = z.object({id:filterIdSchema,name,queryJson:z.string().max(8192),position:z.number()});
const page = z.object({items:z.array(libraryDocumentSchema),nextCursor:libraryQuerySchema.shape.cursor.nullable()});
export const streakSchema = z.object({current:z.number(),best:z.number(),today:z.boolean(),days:z.array(z.object({date:z.string(),studied:z.boolean()}))});
export const dashboardSchema = z.object({pinnedFolders:z.array(folderSchema),pinnedDocuments:z.array(libraryDocumentSchema),recentDocuments:z.array(libraryDocumentSchema.extend({lastChat:z.string().nullable()})),month:z.object({inputTokens:z.number(),outputTokens:z.number(),costUsd:z.number(),calls:z.number()}),series:z.array(z.object({date:z.string(),inputTokens:z.number(),outputTokens:z.number(),costUsd:z.number(),calls:z.number()})),streak:streakSchema,recentActivity:z.array(z.object({id:z.string(),documentId:documentIdSchema,kind:z.string(),createdAt:z.string()}))});
export const libraryContract = {
 'library:folders:list':{request:empty,response:z.array(folderSchema)},
 'library:folders:create':{request:z.object({name,parentId:folderIdSchema.nullable().default(null)}).strict(),response:folderSchema},
 'library:folders:update':{request:z.object({folderId:folderIdSchema,name:name.optional(),color:z.string().max(32).nullable().optional(),icon:z.string().max(64).nullable().optional(),pinned:z.boolean().optional()}).strict(),response:folderSchema},
 'library:folders:move':{request:z.object({folderId:folderIdSchema,parentId:folderIdSchema.nullable(),beforeId:folderIdSchema.optional()}).strict(),response:ack},
 'library:folders:delete':{request:z.object({folderId:folderIdSchema,destination:z.enum(['parent','unfiled'])}).strict(),response:ack},
 'library:tree':{request:empty,response:z.array(folderSchema)},
 'library:documents:list':{request:libraryQuerySchema,response:page},
 'library:documents:move':{request:z.object({documentIds:z.array(documentIdSchema).min(1).max(500),folderId:folderIdSchema.nullable(),beforeId:documentIdSchema.optional()}).strict(),response:ack},
 'library:documents:pin':{request:id.extend({pinned:z.boolean()}).strict(),response:ack},
 'library:pins:reorder':{request:z.object({kind:z.enum(['documents','folders']),ids:z.array(z.string().uuid()).max(500)}).strict(),response:ack},
 'library:documents:rename':{request:id.extend({title:name}).strict(),response:ack},
 'library:documents:softDelete':{request:id,response:ack},
 'library:documents:restore':{request:id,response:ack},
 'library:documents:purge':{request:empty,response:ack},
 'library:tags:list':{request:empty,response:z.array(tagSchema)},
 'library:tags:save':{request:z.object({id:tagIdSchema.optional(),name,color:z.string().max(32).nullable().default(null)}).strict(),response:tagSchema},
 'library:tags:delete':{request:z.object({tagId:tagIdSchema}).strict(),response:ack},
 'library:documents:tag':{request:id.extend({tagId:tagIdSchema,assigned:z.boolean()}).strict(),response:ack},
 'library:savedFilters:list':{request:empty,response:z.array(savedFilterSchema)},
 'library:savedFilters:save':{request:z.object({id:filterIdSchema.optional(),name,query:libraryQuerySchema,position:z.number().finite().default(0)}).strict(),response:savedFilterSchema},
 'library:savedFilters:delete':{request:z.object({id:filterIdSchema}).strict(),response:ack},
 'library:search':{request:z.object({text:z.string().trim().min(1).max(200),limit:z.number().int().min(1).max(100).default(50),cursor:z.object({rank:z.number(),id:documentIdSchema}).strict().optional()}).strict(),response:z.object({items:z.array(z.object({documentId:documentIdSchema,title:z.string(),snippet:z.string(),rank:z.number()})),nextCursor:z.object({rank:z.number(),id:documentIdSchema}).nullable()})},
 'activity:heartbeat':{request:id.extend({seconds:z.number().int().min(1).max(60)}).strict(),response:ack},
 'dashboard:get':{request:empty,response:dashboardSchema},
 'library:exportMarkdown':{request:id,response:z.object({saved:z.boolean()})},
 'library:exportOriginal':{request:id,response:z.object({saved:z.boolean()})},
 'library:reveal':{request:id,response:ack},
 'library:openOriginal':{request:id,response:ack},
};
