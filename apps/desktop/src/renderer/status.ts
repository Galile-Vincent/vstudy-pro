import { i18n, tr } from '../shared/i18n';
import { statusSchema, type Status } from '../shared/status';
export function statusText(status: Status): string {
 const index=status.code.indexOf('.');
 const key=index<0?'errors:generic':`${status.code.slice(0,index)}:${status.code.slice(index+1)}`;
 if(i18n.exists(key)) return tr(key,status.params);
 if(import.meta.env.DEV) console.warn(`Unmapped status code: ${status.code}`);
 return tr('errors:generic');
}
export function errorText(error: unknown): string {
 const structured=statusSchema.safeParse(error);
 if(structured.success) return statusText(structured.data);
 if(error instanceof Error) {
   const match=/VSTUDY_STATUS:(\{.*\})/.exec(error.message);
   if(match) {try {const status=statusSchema.safeParse(JSON.parse(match[1]!));if(status.success)return statusText(status.data);}catch { /* IPC error serialization may add a transport prefix. */ }}
 }
 return tr('errors:generic');
}
