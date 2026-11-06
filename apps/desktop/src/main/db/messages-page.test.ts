import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { openStore } from './index';
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
