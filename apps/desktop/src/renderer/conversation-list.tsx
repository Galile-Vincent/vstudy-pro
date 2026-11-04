import { useTranslation } from "react-i18next";
import { tr } from '../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import { AssistantRuntimeProvider, useExternalStoreRuntime, type ThreadMessage } from '@assistant-ui/react';
import { ChevronDown } from 'lucide-react';
import { plainSelection } from './selection-preview';
import { copyAnswer } from './copy-answer';
import { desktop } from './bridge';
import type { Conversation } from '../shared';
import type { Providers } from './providers';
import './library/library.css';
import { ThreadList } from './components/assistant-ui/elements/thread-list.aui';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';

export function ConversationList({conversations,current,onSelect,onNew,onDelete,canCreate}:{conversations:Conversation[];current:Conversation|null;providers:Providers;onSelect:(conversation:Conversation)=>void;onNew:()=>Promise<void>;onDelete:(id:Conversation['id'])=>Promise<void>;canCreate:boolean}) {
  useTranslation();
 const [open,setOpen]=useState(false);const trigger=useRef<HTMLButtonElement>(null);
 const [summaries,setSummaries]=useState<Record<string,{title:string;preview:string;createdAt:string}>>({});
 const [renames,setRenames]=useState<Record<string,string>>(() => {try{return JSON.parse(localStorage.getItem('vstudy-thread-titles') ?? '{}');}catch{return {};}});
 useEffect(() => {
  let active=true;
  const refresh=() => {void Promise.all(conversations.map(async c => {
   const messages=await desktop.invoke('messages:list',{conversationId:c.id});
   const first=messages.find(m=>m.role==='user')?.parts.map(p=>p.text).join(' ').replace(/\s+/g,' ').trim() ?? '';
   const last=messages.at(-1);
   return [c.id,{title:first.slice(0,40),preview:last ? plainSelection(copyAnswer(last.parts.map(p=>p.text).join(' '),last.parts.flatMap(p=>p.citations ?? []))).slice(0,120) : '',createdAt:last?.createdAt ?? c.createdAt}] as const;
  })).then(rows=>{if(active)setSummaries(Object.fromEntries(rows));}).catch(()=>{});};
  refresh();window.addEventListener('usage-updated',refresh);
  return ()=>{active=false;window.removeEventListener('usage-updated',refresh);};
 },[conversations,open]);
 const title=(conversation:Conversation) => (renames[conversation.id] ?? summaries[conversation.id]?.title) || tr('common:new_chat');
 const runtime=useExternalStoreRuntime<ThreadMessage>({messages:[],onNew:async()=>{},adapters:{threadList:{
  threadId:current?.id,
  threads:conversations.map(c=>({status:'regular' as const,id:c.id,title:title(c)})),
  onSwitchToThread:(id:string)=>{const conversation=conversations.find(c=>c.id===id);if(conversation){onSelect(conversation);setOpen(false);}},
  ...(canCreate?{onSwitchToNewThread:async()=>{await onNew();setOpen(false);}}:{}),
  onRename:async(id:string,title:string)=>{const next={...renames,[id]:title};localStorage.setItem('vstudy-thread-titles',JSON.stringify(next));setRenames(next);},
  onDelete:async (id:string)=>{const conversation=conversations.find(c=>c.id===id);if(conversation)await onDelete(conversation.id);},
 }}});
 return <AssistantRuntimeProvider runtime={runtime}><Popover open={open} onOpenChange={setOpen}><PopoverTrigger ref={trigger} aria-label={tr('common:conversations')} className="conversation-trigger"><span>{current?title(current):tr('common:choose_conversation')}</span><ChevronDown size={12}/></PopoverTrigger><PopoverContent aria-label={tr("common:conversations")} align="end" collisionBoundary={trigger.current?.closest('.pane')??null} collisionPadding={10} className="conversation-list-popover library-conversations"><ThreadList summaries={summaries}/></PopoverContent></Popover></AssistantRuntimeProvider>;
}
