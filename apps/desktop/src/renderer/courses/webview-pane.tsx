/** React owns the toolbar and geometry; main clips the sandboxed native view to the measured content slot. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Copy, ExternalLink, LockKeyhole, Minus, Plus, RefreshCw, ShieldAlert, Square, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { publicWebviewUrl } from '../../shared/moodle-webview';
import type { WebviewAction, WebviewState, WebviewTarget, WebviewTheme } from '../../shared/moodle-webview';
import { useOptionalNavigation } from '../shell';
import { hasNavigationOverlay } from '../shell/history-swipe-navigation';
import { desktop } from '../bridge';
import { Button, PageHeader, Toolbar, EmptyState } from '../components/ui';
import { builtinThemes, type ThemeToken } from '../../shared/themes';
import './webview.css';

function theme():WebviewTheme {
  const style = getComputedStyle(document.documentElement);
  const dark = document.documentElement.dataset.scheme === 'dark';
  const defaults = builtinThemes[0]![dark ? 'dark' : 'light'];
  const color = (token:ThemeToken) => {
    const value = style.getPropertyValue('--' + token).trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : defaults[token];
  };
  return {dark,background:color('reader-background'),foreground:color('reader-ink'),accent:color('accent-color')};
}
export function MoodleWebviewPane({tabId,accountId,target,onClose,onDocument,onReconnect}:{tabId:string;accountId:string;target:WebviewTarget;onClose:()=>void;onDocument:(id:string)=>void;onReconnect:()=>void}) {
  useTranslation('webview');
  const navigation=useOptionalNavigation();
  const navigationRef=useRef(navigation);navigationRef.current=navigation;
  const [state,setState] = useState<WebviewState>();
  const [failed,setFailed] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const [copied,setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer); }, [copied]);
  useEffect(() => setCopied(false), [state?.url]);
  const pane = useRef<HTMLDivElement>(null), slot = useRef<HTMLDivElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const id = useRef<string|undefined>(undefined);
  const callbacks = useRef({onClose,onDocument,onReconnect});
  callbacks.current = {onClose,onDocument,onReconnect};
  const closing = useRef(false);
  const close = useCallback(() => {
    closing.current = true;
    if (id.current) void desktop.invoke('moodle:webview-action',{tabId,id:id.current,action:'close'}).catch(() => {});
    callbacks.current.onClose();
  },[tabId]);
  const action = useCallback(async (action:WebviewAction) => {
    if (!id.current) return;
    if (action === 'copy') setCopied(false);
    else setFailed(false);
    try {
      const next = await desktop.invoke('moodle:webview-action',{tabId,id:id.current,action});
      if (action === 'copy') setCopied(true);
      if (next.status === 'closed') close(); else setState(next);
    } catch {setFailed(true);}
  },[close,tabId]);
  useEffect(() => {
    setFailed(false); setState(undefined); id.current = undefined; closing.current = false;
    let active = true, timer:ReturnType<typeof setTimeout>|undefined;
    const accept = (next:WebviewState) => {
      if (!active) return;
      setState(next);
      if(next.url) navigationRef.current?.updateNativePresentation(tabId,{kind:'moodle',accountId,requestedUrl:target.kind==='page'?publicWebviewUrl(target.url):next.url,url:next.url,zoom:next.zoom,scrollTop:next.scrollTop},next.title);
      if (next.documentId) {const persisted=navigationRef.current?.recordMoodleImport(tabId,next.documentId,{view:'moodle',accountId,target});if(persisted)void desktop.invoke('moodle:webview-action',{tabId,id:next.id,action:'ack-document'}).catch(()=>{});closing.current=true;callbacks.current.onDocument(next.documentId);}
      else if (next.status === 'closed') close();
    };
    const poll = async () => {
      if (!active || !id.current || closing.current) return;
      try {accept(await desktop.invoke('moodle:webview-state',{tabId,id:id.current}));}
      catch {if (active) setAttempt(value=>value+1);}
      if (active) timer = setTimeout(() => void poll(),500);
    };
    const tab=navigationRef.current?.tabs.tabs.find(tab=>tab.id===tabId);
    const checkpoint=tab?.presentation,route=tab?.history.entries[tab.history.index];
    void desktop.invoke('moodle:webview-open',{tabId,accountId,target,...(route?.importedDocumentId ? {importedDocumentId:route.importedDocumentId} : {}),...(checkpoint?.kind==='moodle' && checkpoint.accountId===accountId && target.kind==='page' && (checkpoint.requestedUrl ?? checkpoint.url)===publicWebviewUrl(target.url) ? {checkpoint:{accountId,requestedUrl:publicWebviewUrl(target.url),url:checkpoint.url,zoom:checkpoint.zoom,scrollTop:checkpoint.scrollTop}} : {})}).then(next => {
      if (!active) {void desktop.invoke('moodle:webview-hide',{tabId,generation:next.generation}).catch(() => {});return;}
      if(next.error==='resource-limit') {accept(next);return;}
      id.current = next.id;generation.current=next.generation;accept(next);timer = setTimeout(() => void poll(),500);
    }).catch(() => {if (active) setFailed(true);});
    return () => {active=false;clearTimeout(timer);if (id.current) void desktop.invoke('moodle:webview-hide',{tabId,generation:generation.current}).catch(() => {});};
  },[tabId,accountId,target,close,attempt]);
  useEffect(() => {
    let timer:ReturnType<typeof setTimeout>|undefined;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!id.current || !slot.current) return;
        const rect = slot.current.getBoundingClientRect();
        void desktop.invoke('moodle:webview-layout',{tabId,id:id.current,generation:generation.current,bounds:{x:Math.max(0,Math.round(rect.x)),y:Math.max(0,Math.round(rect.y)),width:Math.max(0,Math.floor(rect.width)),height:Math.max(0,Math.floor(rect.height))},theme:theme(),visible:document.visibilityState === 'visible' && !failed && !hasNavigationOverlay()}).catch(() => setFailed(true));
      },120);
    };
    const observer = new ResizeObserver(update);
    if (slot.current) observer.observe(slot.current);
    const mutation = new MutationObserver(update);
    mutation.observe(document.documentElement,{attributes:true,childList:true,subtree:true,attributeFilter:['class','data-state','data-theme','data-scheme','data-sidebar-overlay','hidden','aria-hidden','aria-modal','inert']});
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change',update);
    window.addEventListener('resize',update); document.addEventListener('visibilitychange',update);update();
    return () => {clearTimeout(timer);observer.disconnect();mutation.disconnect();scheme.removeEventListener('change',update);window.removeEventListener('resize',update);document.removeEventListener('visibilitychange',update);};
  },[state?.id,failed]);
  const error = state?.error ?? (failed ? 'unavailable' : null);
  const busy = !error && (!state || ['connecting','loading'].includes(state.status));
  const tool = (name:WebviewAction,Icon:typeof X,disabled=false) => <Button variant="ghost" size="icon" title={tr(`webview:${name}`)} aria-label={tr(`webview:${name}`)} disabled={disabled} onClick={() => void action(name)}><Icon /></Button>;
  const zoom = new Intl.NumberFormat(undefined,{style:'percent',maximumFractionDigits:0}).format(state?.zoom ?? 1);
  return <main ref={pane} data-testid="moodle-webview" className="moodle-webview-pane moodle-tab-page" onKeyDown={event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') {event.preventDefault();void action('reload');}
  }}>
      <PageHeader className="moodle-webview-header"
        title={<span id="moodle-webview-title">{state?.title || tr('webview:title')}</span>}
        description={<span id="moodle-webview-description">{tr('webview:session_hint')}</span>}
        actions={<Button ref={closeButton} variant="ghost" size="icon" aria-label={tr('webview:close')} title={tr('webview:close')} onClick={close}><X /></Button>}
      />
      <Toolbar role="navigation" className="moodle-webview-toolbar" aria-label={tr('webview:toolbar')} left={<>
        {tool('back',ArrowLeft,!state?.canGoBack)}{tool('forward',ArrowRight,!state?.canGoForward)}
        {busy ? tool('stop',Square,!state || state.status === 'connecting') : tool('reload',RefreshCw,!state)}
        <span className="moodle-webview-location" title={state?.url}>{state?.secure ? <LockKeyhole aria-label={tr('webview:secure')} /> : <ShieldAlert aria-label={tr('webview:not_secure')} />}<span>{state?.url ? new URL(state.url).host : tr('webview:title')}</span></span>
        {tool('copy',Copy,!state?.url)}{tool('external',ExternalLink,!state?.url)}
      </>} />
      {busy && <progress className="moodle-webview-progress" aria-label={tr('webview:loading')} />}
      <div ref={slot} className="moodle-webview-slot" data-testid="moodle-webview-slot">
        {busy && <div className="moodle-webview-message" role="status"><RefreshCw className="moodle-spin" /><p>{tr(state?.status === 'loading' ? 'webview:loading' : 'webview:connecting')}</p></div>}
        {!busy && !error && target.kind==='file' && state?.importedDocumentId && <div className="moodle-webview-message" role="status"><p>{tr('webview:imported')}</p><Button onClick={()=>callbacks.current.onDocument(state.importedDocumentId!)}>{tr('webview:open_document')}</Button></div>}
        {error && <EmptyState className="moodle-webview-message" role="alert" headingLevel={2} icon={<ShieldAlert />} title={tr(`webview:error_${error}`)} description={tr(`webview:hint_${error}`)} action={<>
          {state?.retryAt && state.retryAt > Date.now() && <p>{tr('webview:rate_limit',{time:new Date(state.retryAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})})}</p>}
          {error==='resource-limit' && <Button onClick={()=>setAttempt(value=>value+1)}>{tr('common:retry')}</Button>}
          {failed && <Button onClick={() => { setAttempt(value => value + 1); }}>{tr('common:retry')}</Button>}
          {!failed && state && <Button onClick={() => void action(error === 'session-expired' || error === 'unavailable' ? 'reconnect' : 'reload')} disabled={!!state.retryAt && state.retryAt > Date.now()}>{tr(error === 'session-expired' || error === 'unavailable' ? 'webview:reconnect' : 'webview:reload')}</Button>}
          {['session-expired','unavailable'].includes(error) && <Button variant="outline" onClick={() => callbacks.current.onReconnect()}>{tr('webview:sign_in')}</Button>}
        </>} />}
      </div>
      <footer><Toolbar className="moodle-webview-footer" left={<><span role="status">{copied ? tr('webview:copied') : tr('webview:footer_hint')}</span>
        <Button variant="ghost" size="icon" aria-label={tr('webview:zoom-out')} disabled={!state || state.zoom <= .5} onClick={() => void action('zoom-out')}><Minus /></Button>
        <Button variant="ghost" aria-label={tr('webview:zoom-reset')} onClick={() => void action('zoom-reset')}>{zoom}</Button>
        <Button variant="ghost" size="icon" aria-label={tr('webview:zoom-in')} disabled={!state || state.zoom >= 2} onClick={() => void action('zoom-in')}><Plus /></Button>
        <Button variant="ghost" onClick={() => void action('copy')}>{tr('webview:copy')}</Button>
        <Button variant="ghost" aria-label={tr('webview:focus')} onClick={() => void action('focus')} disabled={!state || state.status !== 'ready'}>{tr('webview:focus')}</Button>
      </>} /></footer>
    </main>;
}
