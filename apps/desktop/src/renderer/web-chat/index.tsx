import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, RefreshCw, Home, LogOut, ExternalLink } from 'lucide-react';
import { desktop } from '../bridge';
import { tr } from '../../shared/i18n';
import { webChatProviderSchema, type WebChatProvider, type WebChatState } from '../../shared/web-chat';
import { hasNavigationOverlay } from '../shell/history-swipe-navigation';
import { Button } from '../components/ui/button';
import { DesktopChat } from './desktop-chat';
import './web-chat.css';
type Tab='desktop'|WebChatProvider;
function hasChatOverlay() {
  return hasNavigationOverlay() || [...document.querySelectorAll('[role="menu"],[role="listbox"],[data-slot="popover-content"],[data-slot="dropdown-menu-content"]')].some(element=>element.getClientRects().length>0 && !element.closest('[hidden],[aria-hidden="true"],[data-state="closed"]'));
}
const tabs=['desktop','gemini','chatgpt','claude'] as const;
export function WebChatHub() {
  useTranslation();
  const [tab,setTab]=useState<Tab>(()=>{try {const value=localStorage.getItem('vstudy-web-chat');return webChatProviderSchema.safeParse(value).success ? value as WebChatProvider : 'desktop';}catch{return 'desktop';}});
  const [visited,setVisited]=useState(tab==='desktop');
  const choose=(next:Tab)=>{setTab(next);if(next==='desktop')setVisited(true);try{localStorage.setItem('vstudy-web-chat',next);}catch{/* Optional preference. */}};
  const label=(value:Tab)=>tr(`web-chat:${value}`);
  return <section className="web-chat-hub" aria-label={tr('web-chat:title')}>
    <header className="web-chat-header"><div><h1>{tr('web-chat:title')}</h1><p>{tr('web-chat:subtitle')}</p></div>
      <div className="web-chat-tabs" role="tablist" aria-label={tr('web-chat:choose')} onKeyDown={event=>{
        const index=tabs.indexOf(tab);
        const next=event.key==='ArrowRight'?tabs[(index+1)%tabs.length]:event.key==='ArrowLeft'?tabs[(index+tabs.length-1)%tabs.length]:event.key==='Home'?'desktop':event.key==='End'?'claude':undefined;
        if(next){event.preventDefault();choose(next);document.getElementById(`web-chat-tab-${next}`)?.focus();}
      }}>{tabs.map(value=><button key={value} id={`web-chat-tab-${value}`} role="tab" aria-selected={value===tab} aria-controls={`web-chat-panel-${value}`} tabIndex={value===tab?0:-1} onClick={()=>choose(value)}>{label(value)}</button>)}</div>
    </header>
    <div role="tabpanel" id="web-chat-panel-desktop" aria-labelledby="web-chat-tab-desktop" hidden={tab!=='desktop'} className="web-chat-desktop">{visited && <DesktopChat active={tab==='desktop'}/>}</div>
    {tab!=='desktop' && <HostedChat key={tab} provider={tab}/>}
  </section>;
}
export function HostedChat({provider,compact=false}:{provider:WebChatProvider;compact?:boolean}) {
  const slot=useRef<HTMLDivElement>(null);
  const [state,setState]=useState<WebChatState>();
  const [failed,setFailed]=useState(false),[revision,setRevision]=useState(0),[clearing,setClearing]=useState(false);
  useEffect(()=>{
    let live=true,opened=false,polling=false;
    const bounds=()=>{const r=slot.current?.getBoundingClientRect();return {x:Math.max(0,Math.round(r?.x??0)),y:Math.max(0,Math.round(r?.y??0)),width:Math.max(0,Math.round(r?.width??0)),height:Math.max(0,Math.round(r?.height??0))};};
    const layout=()=>{if(opened) void desktop.invoke('web-chat:layout',{provider,bounds:bounds(),visible:live && !document.hidden && !hasChatOverlay() && !slot.current?.closest('[inert]'),...(compact?{radius:16}:{})}).catch(()=>{if(live)setFailed(true);});};
    const poll=async()=>{if(!opened || polling || !live)return;polling=true;try{const next=await desktop.invoke('web-chat:state',{provider});if(live)setState(next);}catch{if(live)setFailed(true);}finally{polling=false;}};
    void desktop.invoke('web-chat:open',{provider}).then(next=>{opened=true;if(live){setState(next);setFailed(false);}layout();}).catch(()=>{if(live)setFailed(true);});
    const resize=new ResizeObserver(layout);if(slot.current)resize.observe(slot.current);
    const mutation=new MutationObserver(layout);mutation.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','inert','aria-hidden','aria-modal','data-state','data-sidebar-overlay']});
    const timer=setInterval(()=>{layout();void poll();},500);
    window.addEventListener('resize',layout);document.addEventListener('visibilitychange',layout);
    return()=>{live=false;layout();clearInterval(timer);resize.disconnect();mutation.disconnect();window.removeEventListener('resize',layout);document.removeEventListener('visibilitychange',layout);};
  },[provider,revision,compact]);
  const action=async(action:'back'|'forward'|'reload'|'home'|'focus'|'external')=>{try{setFailed(false);setState(await desktop.invoke('web-chat:action',{provider,action}));}catch{setFailed(true);}};
  const tool=(actionName:'back'|'forward'|'reload'|'home'|'focus'|'external',Icon:typeof Home,disabled=false)=><Button variant="ghost" size="icon" aria-label={tr(`web-chat:${actionName}`)} title={tr(`web-chat:${actionName}`)} disabled={disabled} onClick={()=>void action(actionName)}><Icon/></Button>;
  const clear=()=>{setClearing(true);void desktop.invoke('web-chat:clear',{provider}).then(()=>setRevision(n=>n+1)).catch(()=>setFailed(true)).finally(()=>setClearing(false));};
  const notice=(failed || state?.status==='error') && <div role="alert" className="web-chat-notice">{tr('web-chat:error')}<Button variant="outline" onClick={()=>{if(state)void action('reload');else setRevision(n=>n+1);}}>{tr('common:retry')}</Button></div>;
  const progress=state?.status==='loading' && <progress aria-label={tr('common:loading')}/>;
  if(compact) return <div className="web-chat-hosted web-chat-compact" role="tabpanel" id={`web-chat-panel-${provider}`}>
    {notice}{progress}
    <div ref={slot} className="web-chat-slot" data-testid="web-chat-slot"/>
    <footer><span>{tr('web-chat:privacy')}</span><span className="web-chat-actions">{tool('reload',RefreshCw)}{tool('external',ExternalLink)}<Button variant="ghost" size="icon" aria-label={tr('web-chat:clear')} title={tr('web-chat:clear')} disabled={clearing} onClick={clear}><LogOut/></Button></span></footer>
  </div>;
  return <div className="web-chat-hosted" role="tabpanel" id={`web-chat-panel-${provider}`} aria-labelledby={`web-chat-tab-${provider}`}>
    <div className="web-chat-toolbar">{tool('back',ArrowLeft,!state?.canGoBack)}{tool('forward',ArrowRight,!state?.canGoForward)}{tool('reload',RefreshCw)}{tool('home',Home)}{tool('external',ExternalLink)}<span>{tr(`web-chat:${provider}`)}<small>{tr('web-chat:session')}</small></span>
      <Button variant="ghost" disabled={clearing} onClick={clear}><LogOut/>{tr('web-chat:clear')}</Button>
    </div>
    {notice}{progress}
    <div ref={slot} className="web-chat-slot" data-testid="web-chat-slot"/>
    <footer>{tr('web-chat:privacy')}<Button variant="ghost" onClick={()=>void action('focus')}>{tr('web-chat:focus')}</Button></footer>
  </div>;
}
