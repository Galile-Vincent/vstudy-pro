/** Exchanges a one-use key without navigating a document. net.request exposes redirects before following them. */
import { net, type Session } from 'electron';
import { WebviewSessionError } from './webview-session';
import { webviewNavigation, webviewLoginPage, type WebviewPolicy } from './webview-policy';

function cookieRequest(browser:Session,url:string,signal:AbortSignal,body?:string):Promise<{status:number;method:string;location:string|null}> {
  return new Promise((resolve,reject) => {
    const request = net.request({url,method:body ? 'POST' : 'GET',session:browser,redirect:'manual',useSessionCookies:true});
    let finished = false;
    const finish = (result:WebviewSessionError|{status:number;method:string;location:string|null}) => {
      if (finished) return;
      finished = true;signal.removeEventListener('abort',cancel);request.abort();
      if (result instanceof WebviewSessionError) reject(result); else resolve(result);
    };
    const cancel = () => finish(new WebviewSessionError('timeout'));
    signal.addEventListener('abort',cancel,{once:true});
    request.on('error',() => finish(new WebviewSessionError('offline')));
    request.on('response',response => {response.on('error',() => {});finish({status:response.statusCode,method:body ? 'POST' : 'GET',location:null});});
    request.on('redirect',(status,method,location) => finish({status,method,location}));
    if (body) request.setHeader('Content-Type','application/x-www-form-urlencoded');
    request.setHeader('User-Agent','MoodleMobile');
    if (signal.aborted) {cancel();return;}
    request.end(body);
  });
}

export async function exchangeWebviewCookie(browser:Session,policy:WebviewPolicy,userId:number,key:string,signal:AbortSignal):Promise<void> {
  const body = new URLSearchParams({userid:String(userId),key,urltogo:policy.site.pathname.replace(/\/$/,'') + '/my/'}).toString();
  const response = await cookieRequest(browser,policy.site.href.replace(/\/$/,'') + '/admin/tool/mobile/autologin.php',signal,body);
  if (![301,302,303].includes(response.status) || response.method !== 'GET' || !response.location || webviewNavigation(response.location,policy) !== 'internal') throw new WebviewSessionError('session-expired');
}

export async function probeWebviewSession(browser:Session,policy:WebviewPolicy,signal:AbortSignal):Promise<boolean> {
  const response = await cookieRequest(browser,policy.site.href.replace(/\/$/,'') + '/my/',signal);
  if (response.location && webviewLoginPage(response.location,policy)) return false;
  if (response.location && webviewNavigation(response.location,policy) !== 'internal') throw new WebviewSessionError('blocked');
  if (response.status < 200 || response.status >= 400) throw new WebviewSessionError('load-failed');
  return true;
}
