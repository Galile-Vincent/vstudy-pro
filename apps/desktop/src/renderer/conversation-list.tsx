import { useRef, useState } from 'react';
import { AssistantRuntimeProvider, useExternalStoreRuntime, type ThreadMessage } from '@assistant-ui/react';
import { ChevronDown } from 'lucide-react';
import type { Conversation } from '../shared';
import type { Providers } from './providers';
import { ThreadList } from './components/assistant-ui/elements/thread-list.aui';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';

export function ConversationList({conversations,current,providers,onSelect,onNew,onDelete,canCreate}:{conversations:Conversation[];current:Conversation|null;providers:Providers;onSelect:(conversation:Conversation)=>void;onNew:()=>Promise<void>;onDelete:(id:Conversation['id'])=>Promise<void>;canCreate:boolean}) {
 const [open,setOpen]=useState(false);const trigger=useRef<HTMLButtonElement>(null);
 const title=(conversation:Conversation) => `Chat ${conversations.length-conversations.findIndex(c=>c.id===conversation.id)} · ${providers.find(p=>p.config.id===conversation.providerId)?.models.find(m=>m.id===conversation.modelId||m.resolvedId===conversation.modelId)?.name??conversation.modelId}`;
 const runtime=useExternalStoreRuntime<ThreadMessage>({messages:[],onNew:async()=>{},adapters:{threadList:{
  threadId:current?.id,
  threads:conversations.map(c=>({status:'regular' as const,id:c.id,title:title(c)})),
  onSwitchToThread:(id:string)=>{const conversation=conversations.find(c=>c.id===id);if(conversation){onSelect(conversation);setOpen(false);}},
  ...(canCreate?{onSwitchToNewThread:async()=>{await onNew();setOpen(false);}}:{}),
  onDelete:async (id:string)=>{const conversation=conversations.find(c=>c.id===id);if(conversation)await onDelete(conversation.id);},
 }}});
 return <AssistantRuntimeProvider runtime={runtime}><Popover open={open} onOpenChange={setOpen}><PopoverTrigger ref={trigger} aria-label="Conversations" className="conversation-trigger"><span>{current?title(current):'Choose conversation'}</span><ChevronDown size={12}/></PopoverTrigger><PopoverContent align="end" collisionBoundary={trigger.current?.closest('.pane')??null} collisionPadding={10} className="conversation-list-popover"><ThreadList/></PopoverContent></Popover></AssistantRuntimeProvider>;
}
