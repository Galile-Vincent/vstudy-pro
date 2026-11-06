import type { DatabaseSync } from 'node:sqlite';
export interface ThreadMessage { role:'user'|'assistant'; text:string;id?:string;threadId?:string;step?:number;move?:'probe'|'worked-step'|'answer' }
/** Size is checked in SQL before fetching or parsing a message body. */
export function buildThreadSnapshot(db:DatabaseSync, assistantId:string) {
 const end=db.prepare('SELECT conversationId,createdAt,id FROM messages WHERE id=?').get(assistantId);
 const messages:ThreadMessage[]=[];let bytes=0,queries=1;
 if(!end)return {messages,bytes,queries};
 let at=String(end.createdAt),id=String(end.id),inclusive=1,thread:string|undefined;
 for(let i=0;i<24;i++) {
  const row=db.prepare(`SELECT id,createdAt,role,length(CAST(parts AS BLOB)) bytes FROM messages WHERE conversationId=? AND supersededBy IS NULL AND (createdAt<? OR (createdAt=? AND (id<? OR (?=1 AND id=?)))) ORDER BY createdAt DESC,id DESC LIMIT 1`).get(String(end.conversationId),at,at,id,inclusive,id);queries++;
  if(!row || Number(row.bytes)>32768-bytes)break;
  const body=db.prepare('SELECT parts FROM messages WHERE id=?').get(String(row.id));queries++;
  const parts=JSON.parse(String(body!.parts)) as {text?:string;contextExcluded?:boolean;status?:string;tutorDecision?:{threadId:string;step?:number;move?:'probe'|'worked-step'|'answer'}}[];
  if(parts.some(p=>p.contextExcluded || (p.status && p.status!=='complete')))break;
  const decision=parts.find(p=>p.tutorDecision)?.tutorDecision;
  const nextThread=decision?.threadId;
  const text=parts.map(p=>p.text??'').join('\n');
  if(row.role==='assistant' && messages.length && ((thread && nextThread!==thread) || !nextThread)) {messages.unshift({role:'assistant',text,id:String(row.id),...(nextThread?{threadId:nextThread}:{})});bytes+=Number(row.bytes);break;}
  thread??=nextThread;
  if(row.role==='user'||row.role==='assistant')messages.unshift({role:row.role,text,id:String(row.id),...(nextThread?{threadId:nextThread}:{}),...(decision?.move?{move:decision.move}:{}),...(parts.find(p=>p.tutorDecision)?.tutorDecision?.step!==undefined?{step:parts.find(p=>p.tutorDecision)!.tutorDecision!.step!}:{})});
  bytes+=Number(row.bytes);at=String(row.createdAt);id=String(row.id);inclusive=0;
 }
 return {messages,bytes,queries};
}
