import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { openStore } from './index';
import { chatTurnContext } from '../services/chat-turn-context';
import { chatRequestSchema } from '../../shared/domain';
it('loads recent messages first and pages older messages without gaps or duplicates',()=>{
  const store=openStore(':memory:');
  try {
    const conversation=store.conversations.insert({id:randomUUID(),scope:'general',providerId:'anthropic-api',modelId:'fake',createdAt:new Date().toISOString()} as Parameters<typeof store.conversations.insert>[0]);
    const ids=Array.from({length:123},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
    for(const [i,id] of ids.entries())store.messages.insert({id,conversationId:conversation.id,role:i%2?'assistant':'user',parts:[{type:'text',text:String(i)}],createdAt:'2026-11-01T00:00:00.000Z'} as Parameters<typeof store.messages.insert>[0]);
    const page=(cursor?:{createdAt:string;id:string})=>store.messages.page(conversation.id,50,cursor,'backward');
    const recent=page();expect(recent.items.map(m=>m.id)).toEqual(ids.slice(-50));
    const older=page(recent.nextCursor!);expect(older.items.map(m=>m.id)).toEqual(ids.slice(23,73));
    const oldest=page(older.nextCursor!);expect(oldest.items.map(m=>m.id)).toEqual(ids.slice(0,23));expect(oldest.nextCursor).toBeNull();
    expect(store.messages.page(conversation.id,50).items.map(m=>m.id)).toEqual(ids.slice(0,50));
  } finally {store.close();}
});
it.each(['oversize','invalid JSON','invalid parts','invalid user parts'])('keeps a conversation readable around one %s message',kind=>{
  const store=openStore(':memory:');
  try {
    const conversation=store.conversations.insert({id:randomUUID(),scope:'general',providerId:'anthropic-api',modelId:'fake',createdAt:new Date().toISOString()} as Parameters<typeof store.conversations.insert>[0]);
    const messages=Array.from({length:3},(_,i)=>store.messages.insert({id:randomUUID(),conversationId:conversation.id,role:kind==='invalid user parts'?(i===2?'assistant':'user'):(i===1?'assistant':'user'),parts:[{type:'text',text:`message ${i}`}],createdAt:`2026-11-01T00:00:0${i}.000Z`} as Parameters<typeof store.messages.insert>[0]));
    const parts=kind==='oversize'?JSON.stringify([{type:'text',text:'x'.repeat(2_000_001)}]):kind==='invalid JSON'?'{':'{}';
    store.db.exec('PRAGMA ignore_check_constraints=ON');
    if(kind==='invalid JSON')for(const row of store.db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='messages'").all())store.db.exec(`DROP TRIGGER "${String(row.name)}"`);
    store.db.prepare('UPDATE messages SET parts=? WHERE id=?').run(parts,messages[1]!.id);
    store.db.exec('PRAGMA ignore_check_constraints=OFF');
    const all=store.messages.list(conversation.id);
    expect(all.map(m=>m.id)).toEqual(messages.map(m=>m.id));
    expect(all[1]?.parts[0]).toMatchObject({status:'error',contextExcluded:true});
    expect(all[1]?.parts[0]?.text.length).toBeGreaterThan(0);
    const request=chatRequestSchema.parse({scope:'general',requestId:randomUUID(),conversationId:conversation.id,providerId:'anthropic-api',modelId:'fake',userMessage:'next'});
    expect(chatTurnContext(all,request).history.some(m=>m.id===messages[1]!.id)).toBe(false);
    if(kind==='invalid user parts')expect(chatTurnContext(all,request).history).toEqual([]);
    const first=store.messages.page(conversation.id,2);
    expect(first.items).toEqual(all.slice(0,2));
    expect(store.messages.page(conversation.id,2,first.nextCursor!).items).toEqual(all.slice(2));
    expect(store.messages.page(conversation.id,2,undefined,'backward').items).toEqual(all.slice(1));
  } finally {store.close();}
});
it('rejects oversize user text at the write boundary with a typed error',()=>{
  const store=openStore(':memory:');
  try {
    const conversation=store.conversations.insert({id:randomUUID(),scope:'general',providerId:'anthropic-api',modelId:'fake',createdAt:new Date().toISOString()} as Parameters<typeof store.conversations.insert>[0]);
    const message={id:randomUUID(),conversationId:conversation.id,role:'user',parts:[{type:'text',text:'x'.repeat(2_000_000)}],createdAt:new Date().toISOString()} as Parameters<typeof store.messages.insert>[0];
    expect(store.messages.insert(message).parts[0]?.text.length).toBe(2_000_000);
    message.id=randomUUID() as typeof message.id;message.parts[0]!.text+='x';
    expect(()=>store.messages.insert(message)).toThrow(expect.objectContaining({name:'MessageTextLimitError',code:'errors.message_too_large'}));
    expect(store.messages.list(conversation.id)).toHaveLength(1);
  } finally {store.close();}
});
