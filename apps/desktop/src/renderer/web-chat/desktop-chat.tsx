import { useNavigate } from '../shell';
import { useRef } from 'react';
import { useTabPresentation } from '../tab-presentation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Chat } from '../chat';
import { desktop } from '../bridge';
import { tr } from '../../shared/i18n';
import type { IpcResponse } from '../../shared/ipc';
import type { Conversation, Message } from '../../shared/domain';
import type { Providers } from '../providers';
import { Button } from '@astryxdesign/core';
import { EmptyState, Toolbar } from '../components/ui';
import type { ReactNode } from 'react';
export function DesktopChat({active,launcher,toolbarSlot}:{active:boolean;launcher?:ReactNode;toolbarSlot?:HTMLElement|null}) {
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
  const create=async(providerId:Conversation['providerId'],modelId:string,keepDraft=false)=>{
    setBusy(true);setFailed(false);
    try {const next=await desktop.invoke('conversations:create',{scope:'general',providerId,modelId});setConversation(next);setMessages([]);setCursor(null);if(!keepDraft)setDraft('');try{localStorage.setItem('vstudy-web-chat-conversation',next.id);}catch{/* Optional persistence. */}}catch{setFailed(true);}finally{setBusy(false);}
  };
  const start=async()=>{
    const provider=providers.find(p=>p.config.enabled && p.availability.available && p.models.length && p.config.id.endsWith('-cli')) ?? providers.find(p=>p.config.enabled && p.availability.available && p.models.length);
    if(!provider){settings();return;}
    await create(provider.config.id,provider.models[0]!.id);
  };
  const switching=useRef(false);
  const model=async(value:string)=>{
    if(!conversation||switching.current)return;
    switching.current=true;
    const slash=value.indexOf('/'),providerId=value.slice(0,slash) as Conversation['providerId'],modelId=value.slice(slash+1);
    const hasMessages=async()=>(await desktop.invoke('messages:page',{conversationId:conversation.id,limit:1})).items.length>0;
    try {
      if(await hasMessages()){await create(providerId,modelId,true);return;}
      try {setConversation(await desktop.invoke('conversations:model',{conversationId:conversation.id,providerId,modelId}));}
      catch(error) {
        if(!await hasMessages())throw error;
        await create(providerId,modelId,true);
      }
    } catch {setFailed(true);}
    finally {switching.current=false;}
  };
  const toolbar=<Toolbar className="gap-[var(--space-4)]" left={launcher} right={conversation && <Button variant="ghost" isDisabled={busy} icon={<Plus size={16}/>} label={tr('web-chat:new')} onClick={()=>void start()}/>}/>;
  return <div className="web-chat-local chat-pane">{toolbarSlot===undefined ? toolbar : toolbarSlot && createPortal(toolbar,toolbarSlot)}
    {failed && <p role="alert">{tr('web-chat:desktop_error')}</p>}
    {conversation ? <Chat key={conversation.id} conversation={conversation} history={messages} historyCursor={cursor} autoFocus={false} draft={draft} onDraft={setDraft} selection={null} onClearSelection={()=>{}} providers={providers} model={conversation.providerId+'/'+conversation.modelId} onModel={value=>void model(value)} onSettings={settings} onProvidersChanged={refresh} onUsage={settings}/> : <EmptyState className="web-chat-empty" headingLevel={2} title={tr('web-chat:desktop')} description={tr('web-chat:desktop_hint')} action={<Button variant="primary" isDisabled={busy || !active} label={tr('web-chat:new')} onClick={()=>void start()}/>}/>}
  </div>;
}
