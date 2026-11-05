/** React owns the toolbar and geometry; main clips the sandboxed native view to the measured content slot. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Copy, ExternalLink, LockKeyhole, Maximize2, Minimize2, Minus, Plus, RefreshCw, ShieldAlert, Square, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import type { WebviewAction, WebviewState, WebviewTarget, WebviewTheme } from '../../shared/moodle-webview';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
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
export function MoodleWebviewPane({accountId,target,onClose,onDocument,onReconnect}:{accountId:string;target:WebviewTarget;onClose:()=>void;onDocument:(id:string)=>void;onReconnect:()=>void}) {
  useTranslation('webview');
  const [state,setState] = useState<WebviewState>();
  const [failed,setFailed] = useState(false);
  const [full,setFull] = useState(window.innerWidth < 1000);
  const [width,setWidth] = useState(Math.min(800,window.innerWidth - 80));
  const [copied,setCopied] = useState(false);
  const pane = useRef<HTMLDivElement>(null), slot = useRef<HTMLDivElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const id = useRef<string|undefined>(undefined);
  const callbacks = useRef({onClose,onDocument,onReconnect});
  callbacks.current = {onClose,onDocument,onReconnect};
  const closing = useRef(false);
  const close = useCallback(() => {
    closing.current = true;
    if (id.current) void desktop.invoke('moodle:webview-action',{id:id.current,action:'close'}).catch(() => {});
    callbacks.current.onClose();
  },[]);
  const action = useCallback(async (action:WebviewAction) => {
    if (!id.current) return;
    try {
      const next = await desktop.invoke('moodle:webview-action',{id:id.current,action});
      if (next.status === 'closed') close(); else setState(next);
    } catch {setFailed(true);}
  },[close]);
  useEffect(() => {
    let active = true, timer:ReturnType<typeof setTimeout>|undefined;
    const accept = (next:WebviewState) => {
      if (!active) return;
      setState(next);
      if (next.documentId) {closing.current=true;callbacks.current.onDocument(next.documentId);}
      else if (next.status === 'closed') close();
    };
    const poll = async () => {
      if (!active || !id.current || closing.current) return;
      try {accept(await desktop.invoke('moodle:webview-state',{id:id.current}));}
      catch {if (active) close();}
      if (active) timer = setTimeout(() => void poll(),500);
    };
    void desktop.invoke('moodle:webview-open',{accountId,target}).then(next => {
      if (!active) {void desktop.invoke('moodle:webview-action',{id:next.id,action:'close'}).catch(() => {});return;}
      id.current = next.id;accept(next);timer = setTimeout(() => void poll(),500);
    }).catch(() => {if (active) setFailed(true);});
    return () => {active=false;clearTimeout(timer);if (id.current) void desktop.invoke('moodle:webview-action',{id:id.current,action:'close'}).catch(() => {});};
  },[accountId,target,close]);
  useEffect(() => {
    closeButton.current?.focus();
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    return () => {if (root) root.inert = wasInert;};
  },[]);
  useEffect(() => {
    let timer:ReturnType<typeof setTimeout>|undefined;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!id.current || !slot.current) return;
        const rect = slot.current.getBoundingClientRect();
        void desktop.invoke('moodle:webview-layout',{id:id.current,bounds:{x:Math.max(0,Math.round(rect.x)),y:Math.max(0,Math.round(rect.y)),width:Math.max(0,Math.floor(rect.width)),height:Math.max(0,Math.floor(rect.height))},theme:theme(),visible:document.visibilityState === 'visible' && !failed}).catch(() => setFailed(true));
      },120);
    };
    const observer = new ResizeObserver(update);
    if (slot.current) observer.observe(slot.current);
    const mutation = new MutationObserver(update);
    mutation.observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme','data-scheme']});
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change',update);
    window.addEventListener('resize',update); document.addEventListener('visibilitychange',update);update();
    return () => {clearTimeout(timer);observer.disconnect();mutation.disconnect();scheme.removeEventListener('change',update);window.removeEventListener('resize',update);document.removeEventListener('visibilitychange',update);};
  },[state?.id,full,width,failed]);
  const error = state?.error ?? (failed ? 'unavailable' : null);
  const busy = !error && (!state || ['connecting','loading'].includes(state.status));
  const tool = (name:WebviewAction,Icon:typeof X,disabled=false) => <Button variant="ghost" size="icon" title={tr(`webview:${name}`)} aria-label={tr(`webview:${name}`)} disabled={disabled} onClick={() => void action(name)}><Icon /></Button>;
  const zoom = new Intl.NumberFormat(undefined,{style:'percent',maximumFractionDigits:0}).format(state?.zoom ?? 1);
  const resize = (clientX:number) => setWidth(Math.max(460,Math.min(window.innerWidth - 32,window.innerWidth - clientX)));
  return createPortal(<div className="moodle-webview-backdrop">
    <div ref={pane} role="dialog" aria-modal="true" aria-labelledby="moodle-webview-title" aria-describedby="moodle-webview-description" data-testid="moodle-webview" data-full={full} className="moodle-webview-pane" style={{width:full ? undefined : width}} onKeyDown={event => {
      if (event.key === 'Escape') {event.preventDefault();close();}
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') {event.preventDefault();void action('reload');}
      if (event.key === 'Tab') {
        const controls = pane.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]');
        const first = controls?.[0], last = controls?.[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
      }
    }}>
      {!full && <div className="moodle-webview-resize" role="separator" tabIndex={0} aria-label={tr('webview:resize')} aria-orientation="vertical" aria-valuenow={width} aria-valuemin={460} aria-valuemax={window.innerWidth - 32}
        onKeyDown={event => {if (['ArrowLeft','ArrowRight'].includes(event.key)) {event.preventDefault();resize(window.innerWidth - width + (event.key === 'ArrowLeft' ? -24 : 24));}}}
        onPointerDown={event => {event.currentTarget.setPointerCapture(event.pointerId);}}
        onPointerMove={event => {if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(event.clientX);}}
        onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)} />}
      <header className="moodle-webview-header">
        <div><strong id="moodle-webview-title">{state?.title || tr('webview:title')}</strong><small id="moodle-webview-description">{tr('webview:session_hint')}</small></div>
        <Button variant="ghost" size="icon" aria-label={tr(full ? 'webview:pane' : 'webview:expand')} onClick={() => setFull(!full)}>{full ? <Minimize2 /> : <Maximize2 />}</Button>
        <Button ref={closeButton} variant="ghost" size="icon" aria-label={tr('webview:close')} title={tr('webview:close')} onClick={close}><X /></Button>
      </header>
      <nav className="moodle-webview-toolbar" aria-label={tr('webview:toolbar')}>
        {tool('back',ArrowLeft,!state?.canGoBack)}{tool('forward',ArrowRight,!state?.canGoForward)}
        {busy ? tool('stop',Square,!state || state.status === 'connecting') : tool('reload',RefreshCw,!state)}
        <span className="moodle-webview-location" title={state?.url}>{state?.secure ? <LockKeyhole aria-label={tr('webview:secure')} /> : <ShieldAlert aria-label={tr('webview:not_secure')} />}<span>{state?.url ? new URL(state.url).host : tr('webview:title')}</span></span>
        {tool('copy',Copy,!state?.url)}{tool('external',ExternalLink,!state?.url)}
      </nav>
      {busy && <progress className="moodle-webview-progress" aria-label={tr('webview:loading')} />}
      <div ref={slot} className="moodle-webview-slot" data-testid="moodle-webview-slot">
        {busy && <div className="moodle-webview-message" role="status"><RefreshCw className="moodle-spin" /><p>{tr(state?.status === 'loading' ? 'webview:loading' : 'webview:connecting')}</p></div>}
        {error && <div className="moodle-webview-message" role="alert"><ShieldAlert /><h2>{tr(`webview:error_${error}`)}</h2><p>{tr(`webview:hint_${error}`)}</p>
          {state?.retryAt && state.retryAt > Date.now() && <p>{tr('webview:rate_limit',{time:new Date(state.retryAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})})}</p>}
          {state && <Button onClick={() => void action(error === 'session-expired' || error === 'unavailable' ? 'reconnect' : 'reload')} disabled={!!state.retryAt && state.retryAt > Date.now()}>{tr(error === 'session-expired' || error === 'unavailable' ? 'webview:reconnect' : 'webview:reload')}</Button>}
          {['session-expired','unavailable'].includes(error) && <Button variant="outline" onClick={() => callbacks.current.onReconnect()}>{tr('webview:sign_in')}</Button>}
        </div>}
      </div>
      <footer className="moodle-webview-footer"><span role="status">{copied ? tr('webview:copied') : tr('webview:footer_hint')}</span>
        <Button variant="ghost" size="icon" aria-label={tr('webview:zoom-out')} disabled={!state || state.zoom <= .5} onClick={() => void action('zoom-out')}><Minus /></Button>
        <Button variant="ghost" aria-label={tr('webview:zoom-reset')} onClick={() => void action('zoom-reset')}>{zoom}</Button>
        <Button variant="ghost" size="icon" aria-label={tr('webview:zoom-in')} disabled={!state || state.zoom >= 2} onClick={() => void action('zoom-in')}><Plus /></Button>
        <Button variant="ghost" onClick={() => {void action('copy');setCopied(true);}}>{tr('webview:copy')}</Button>
        <Button variant="ghost" aria-label={tr('webview:focus')} onClick={() => void action('focus')} disabled={!state || state.status !== 'ready'}>{tr('webview:focus')}</Button>
      </footer>
    </div>
  </div>,document.body);
}
