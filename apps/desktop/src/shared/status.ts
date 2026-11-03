import { z } from 'zod';
export const statusSchema = z.object({code:z.string().regex(/^[a-z][a-z0-9_.]*$/).max(100),params:z.record(z.union([z.string().max(300),z.number().finite()])).default({})});
export type Status = z.infer<typeof statusSchema>;
export function conversionStatus(message: string): Status {
 const page=/^Converting page (\d+)\/(\d+)/.exec(message);
 if(page) return {code:'library.conversion_pages',params:{page:Number(page[1]),total:Number(page[2])}};
 return {code:message==='Conversion complete'?'library.conversion_complete':'library.conversion_preparing',params:{}};
}
