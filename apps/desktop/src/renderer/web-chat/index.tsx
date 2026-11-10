import { useNavigate } from '../shell';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, RefreshCw, Home, LogOut, ExternalLink } from 'lucide-react';
import { desktop } from '../bridge';
import { tr } from '../../shared/i18n';
import { type WebChatProvider, type WebChatState } from '../../shared/web-chat';
import { hasNavigationOverlay } from '../shell/history-swipe-navigation';
import { Button } from "@astryxdesign/core";
import { PageContainer } from '../components/ui';
import { Layout, LayoutHeader, LayoutContent, LayoutFooter, SegmentedControl, SegmentedControlItem } from '@astryxdesign/core';
import { DesktopChat } from './desktop-chat';
import './web-chat.css';
type Tab='desktop'|WebChatProvider;
const tabs=['desktop','gemini','chatgpt','claude'] as const;
export function WebChatHub() {
  useTranslation();
  const {openTab}=useNavigate();
  const tab:Tab='desktop';
  const [toolbar,setToolbar]=useState<HTMLDivElement|null>(null);
  const choose=(next:Tab)=>{if(next!=='desktop')openTab({view:'hosted-chat',provider:next,title:tr(`web-chat:${next}`)});};
  const label=(value:Tab)=>tr(`web-chat:${value}`);
  const launcher=<SegmentedControl label={tr('web-chat:choose')} value={tab} onChange={value => { if (value) choose(value as Tab); }} aria-label={tr('web-chat:choose')}>{tabs.map(value=><SegmentedControlItem key={value} value={value} id={`web-chat-tab-${value}`} label={label(value)}/>)}</SegmentedControl>;
  return <PageContainer as="main" className="web-chat-hub" aria-label={tr('web-chat:title')}>
    <Layout padding={0} header={<LayoutHeader height={56} padding={4}><div className="flex items-center justify-between gap-4"><div><h1>{tr('web-chat:title')}</h1><p>{tr('web-chat:subtitle')}</p></div><div ref={setToolbar} className="min-w-0 max-w-full"/></div></LayoutHeader>} content={<LayoutContent padding={0} isScrollable={false}><DesktopChat active launcher={launcher} toolbarSlot={toolbar}/></LayoutContent>}/>
  </PageContainer>;
}
export function HostedChat({provider,compact=false}:{provider:WebChatProvider;compact?:boolean}) {
  const {activeTabId,tabs,updateNativePresentation}=useNavigate();
  const saved=tabs.tabs.find(tab=>tab.id===activeTabId)?.presentation;
  const initialUrl=useRef(saved?.kind==='hosted-chat'?saved.url:undefined);
  const identity={provider,tabId:activeTabId,slotId:compact?'workspace' as const:'page' as const};
  const slot=useRef<HTMLDivElement>(null);
  const [state,setState]=useState<WebChatState>();
  const [failed,setFailed]=useState(false),[revision,setRevision]=useState(0),[clearing,setClearing]=useState(false);
  useEffect(()=>{
    let live=true,opened=false,polling=false,generation=0;
    const bounds=()=>{const r=slot.current?.getBoundingClientRect();return {x:Math.max(0,Math.round(r?.x??0)),y:Math.max(0,Math.round(r?.y??0)),width:Math.max(0,Math.round(r?.width??0)),height:Math.max(0,Math.round(r?.height??0))};};
    const layout=()=>{if(opened) void desktop.invoke('web-chat:layout',{...identity,generation,bounds:bounds(),active:live,visible:live && !document.hidden && !hasNavigationOverlay() && !slot.current?.closest('[inert]'),...(compact?{radius:12}:{})}).catch(()=>{if(live)setFailed(true);});};
    const poll=async()=>{if(!opened || polling || !live)return;polling=true;try{const next=await desktop.invoke('web-chat:state',identity);if(live){setState(next);if(!compact)updateNativePresentation(activeTabId,{kind:'hosted-chat',provider,url:next.url,scrollTop:0});}}catch{if(live)setFailed(true);}finally{polling=false;}};
    void desktop.invoke('web-chat:open',{...identity,...(initialUrl.current?{url:initialUrl.current}:{})}).then(next=>{opened=next.status!=='resource-limit';generation=next.generation;if(!live){void desktop.invoke('web-chat:hide',{...identity,generation}).catch(()=>{});return;}if(live){setState(next);setFailed(false);}layout();}).catch(()=>{if(live)setFailed(true);});
    const resize=new ResizeObserver(layout);if(slot.current)resize.observe(slot.current);
    const mutation=new MutationObserver(layout);mutation.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','inert','aria-hidden','aria-modal','data-state','data-sidebar-overlay']});
    const timer=setInterval(()=>{layout();void poll();},500);
    window.addEventListener('resize',layout);document.addEventListener('visibilitychange',layout);
    return()=>{live=false;if(opened)void desktop.invoke('web-chat:hide',{...identity,generation}).catch(()=>{});clearInterval(timer);resize.disconnect();mutation.disconnect();window.removeEventListener('resize',layout);document.removeEventListener('visibilitychange',layout);};
  },[provider,revision,compact,activeTabId]);
  useEffect(()=>desktop.onWebChatCleared?.(cleared=>{if(cleared===provider){initialUrl.current=undefined;setRevision(n=>n+1);}}),[provider]);
  const action=async(action:'back'|'forward'|'reload'|'home'|'focus'|'external')=>{try{setFailed(false);setState(await desktop.invoke('web-chat:action',{...identity,action}));}catch{setFailed(true);}};
  const tool=(actionName:'back'|'forward'|'reload'|'home'|'focus'|'external',Icon:typeof Home,disabled=false)=><Button label={tr(`web-chat:${actionName}`)} variant="ghost" size="md" aria-label={tr(`web-chat:${actionName}`)} tooltip={tr(`web-chat:${actionName}`)} isDisabled={disabled} onClick={()=>void action(actionName)} icon={<Icon/>} isIconOnly></Button>;
  const clear=()=>{setClearing(true);void desktop.invoke('web-chat:clear',identity).catch(()=>setFailed(true)).finally(()=>setClearing(false));};
  const notice=(failed || state?.status==='error' || state?.status==='resource-limit') && <div role="alert" className="web-chat-notice">{tr(state?.status==='resource-limit'?'webview:error_resource-limit':'web-chat:error')}<Button label={tr('common:retry')} variant="secondary" onClick={()=>{setRevision(n=>n+1);}}>{tr('common:retry')}</Button></div>;
  const progress=state?.status==='loading' && <progress aria-label={tr('common:loading')}/>;
  if(compact) return <div className="web-chat-hosted web-chat-compact">
    {notice}{progress}
    <div ref={slot} className="web-chat-slot" data-testid="web-chat-slot"/>
  </div>;
  return <div className="web-chat-hosted">
    <LayoutHeader height={56} padding={0}><div className="web-chat-toolbar">{tool('back',ArrowLeft,!state?.canGoBack)}{tool('forward',ArrowRight,!state?.canGoForward)}{tool('reload',RefreshCw)}{tool('home',Home)}{tool('external',ExternalLink)}<span>{tr(`web-chat:${provider}`)}<small>{tr('web-chat:session')}</small></span>
      <Button label={tr('web-chat:clear')} variant="ghost" isDisabled={clearing} onClick={clear} icon={<LogOut/>}>{tr('web-chat:clear')}</Button>
    </div></LayoutHeader>
    {notice}{progress}
    <div ref={slot} className="web-chat-slot" data-testid="web-chat-slot"/>
    <LayoutFooter padding={4}>{tr('web-chat:privacy')}<Button label={tr('web-chat:focus')} variant="ghost" onClick={()=>void action('focus')}>{tr('web-chat:focus')}</Button></LayoutFooter>
  </div>;
}
