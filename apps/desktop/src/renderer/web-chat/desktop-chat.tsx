import { useNavigate } from '../shell';
import { useRef } from 'react';
import { useTabPresentation } from '../tab-presentation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Chat } from '../chat';
import { desktop } from '../bridge';
import { tr } from '../../shared/i18n';
import type { IpcResponse } from '../../shared/ipc';
import type { Conversation, Message } from '../../shared/domain';
import type { Providers } from '../providers';
import { Button, EmptyState, Toolbar } from '../components/ui';
import type { ReactNode } from 'react';
export function DesktopChat({active,launcher}:{active:boolean;launcher?:ReactNode}) {
  useTranslation();
  const {initial,update}=useTabPresentation(useNavigate());
  const restored=initial?.kind==='app'?initial:undefined;
  const [providers,setProviders]=useState<Providers>([]),[conversation,setConversation]=useState<Conversation>(),[messages,setMessages]=useState<Message[]>([]),[cursor,setCursor]=useState<IpcResponse<'messages:page'>['nextCursor']>(null),[draft,setDraft]=useState(restored?.draft ?? ''),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false);
  const checkpoint=useRef(()=>{});checkpoint.current=()=>update({kind:'app',draft:draft.slice(0,100_000),...(conversation?{conversationId:conversation.id}:{})});
  useEffect(()=>{const flush=()=>checkpoint.current();window.addEventListener('pagehide',flush);return()=>{window.removeEventListener('pagehide',flush);flush();};},[]);
  const refresh=async()=>setProviders(await desktop.invoke('providers:list',{}));
  useEffect(()=>{void refresh().catch(()=>setFailed(true));},[]);
  const settings=()=>window.dispatchEvent(new Event('vstudy:open-settings'));
  useEffect(()=>{window.addEventListener('vstudy:providers-changed',refresh);return()=>window.removeEventListener('vstudy:providers-changed',refresh);},[]);
  useEffect(()=>{
    let live=true;
    try {const id=restored?.conversationId ?? localStorage.getItem('vstudy-web-chat-conversation');if(id) void desktop.invoke('chats:get',{conversationId:id as Conversation['id']}).then(async c=>{if(c?.scope==='general'){const page=await desktop.invoke('messages:page',{conversationId:c.id,limit:80});if(live){setConversation(c);setMessages(page.items);setCursor(page.nextCursor);}}}).catch(()=>{if(live)setFailed(true);});}catch{/* Optional persistence. */}
    return()=>{live=false;};
  },[]);
  const start=async()=>{
    const provider=providers.find(p=>p.config.enabled && p.availability.available && p.models.length && p.config.id.endsWith('-cli')) ?? providers.find(p=>p.config.enabled && p.availability.available && p.models.length);
    if(!provider){settings();return;}
    setBusy(true);setFailed(false);
    try {const next=await desktop.invoke('conversations:create',{scope:'general',providerId:provider.config.id,modelId:provider.models[0]!.id});setConversation(next);setMessages([]);setCursor(null);setDraft('');try{localStorage.setItem('vstudy-web-chat-conversation',next.id);}catch{/* Optional persistence. */}}catch{setFailed(true);}finally{setBusy(false);}
  };
  const model=async(value:string)=>{if(!conversation)return;const slash=value.indexOf('/');try{setConversation(await desktop.invoke('conversations:model',{conversationId:conversation.id,providerId:value.slice(0,slash) as Conversation['providerId'],modelId:value.slice(slash+1)}));}catch{setFailed(true);}};
  return <div className="web-chat-local chat-pane"><Toolbar className="gap-[var(--space-4)]" left={launcher} right={conversation && <Button variant="ghost" disabled={busy} onClick={()=>void start()}><Plus/>{tr('web-chat:new')}</Button>}/>
    {failed && <p role="alert">{tr('web-chat:desktop_error')}</p>}
    {conversation ? <Chat key={conversation.id} conversation={conversation} history={messages} historyCursor={cursor} autoFocus={false} draft={draft} onDraft={setDraft} selection={null} onClearSelection={()=>{}} providers={providers} model={conversation.providerId+'/'+conversation.modelId} onModel={value=>void model(value)} onSettings={settings} onProvidersChanged={refresh} onUsage={settings}/> : <EmptyState className="web-chat-empty" headingLevel={2} title={tr('web-chat:desktop')} description={tr('web-chat:desktop_hint')} action={<Button disabled={busy || !active} onClick={()=>void start()}>{tr('web-chat:new')}</Button>}/>}
  </div>;
}
