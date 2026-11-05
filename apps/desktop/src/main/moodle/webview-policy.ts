/** Pure URL and permission rules shared by navigation, resource filtering, downloads, and clipboard output. */
import { networkUrl } from './site-url';

export interface WebviewPolicy {
  site: URL;
  navigationOrigins: ReadonlySet<string>;
  resourceOrigins: ReadonlySet<string>;
  loopback: boolean;
}
export function webviewPolicy(siteUrl: string, configured: {ssoOrigins?:string[];cdnOrigins?:string[];loopback?:boolean} = {}): WebviewPolicy {
  const loopback = configured.loopback === true;
  const parse = (value:string) => loopback && /^http:\/\/127\.0\.0\.1:\d+(?:\/|$)/.test(value) ? new URL(value) : networkUrl(value);
  const site = parse(siteUrl);
  const navigationOrigins = new Set([site.origin,...(configured.ssoOrigins ?? []).map(value => parse(value).origin)]);
  return {site,navigationOrigins,resourceOrigins:new Set([...navigationOrigins,...(configured.cdnOrigins ?? []).map(value => parse(value).origin)]),loopback};
}
export function normalizeWebviewUrl(input: string, policy: WebviewPolicy): URL | null {
  if (!input || input.length > 8192 || [...input].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === '\\')) return null;
  try {
    const url = new URL(input,policy.site.href + '/');
    if (url.username || url.password || url.hostname.endsWith('.') ||
      !(url.protocol === 'https:' || policy.loopback && url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.origin === policy.site.origin)) return null;
    if ([...url.searchParams.keys()].some(key => /^(?:wstoken|token|privatetoken|private_token|key|passport)$/i.test(key))) return null;
    if (/\/(?:admin\/tool\/mobile\/(?:autologin|launch)|webservice\/rest\/server)\.php$/i.test(url.pathname)) return null;
    return url;
  } catch { return null; }
}
export function webviewNavigation(input: string, policy: WebviewPolicy): 'internal'|'external'|'blocked' {
  const url = normalizeWebviewUrl(input,policy);
  if (!url) return 'blocked';
  if (!policy.navigationOrigins.has(url.origin)) return 'external';
  const root = policy.site.pathname.replace(/\/$/,'');
  return url.origin !== policy.site.origin || url.pathname === root || url.pathname.startsWith(root + '/') ? 'internal' : 'blocked';
}
export function webviewResource(input: string, policy: WebviewPolicy): boolean {
  const url = normalizeWebviewUrl(input,policy);
  return !!url && policy.resourceOrigins.has(url.origin);
}
export function webviewLoginPage(input: string, policy: WebviewPolicy): boolean {
  try {
    const url = new URL(input);
    const root = policy.site.pathname.replace(/\/$/,'');
    return url.origin === policy.site.origin && new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/login/(?:index|logout)\\.php$`,'i').test(url.pathname);
  } catch { return false; }
}
export function webviewFile(input: string, policy: WebviewPolicy): boolean {
  const url = normalizeWebviewUrl(input,policy);
  return !!url && url.origin === policy.site.origin && webviewNavigation(input,policy) === 'internal' && /\/(?:webservice\/)?pluginfile\.php(?:\/|$)/i.test(url.pathname);
}
export function publicWebviewUrl(input: string): string {
  try {
    const url = new URL(input);
    url.username = ''; url.password = ''; url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/token|key|pass|auth|secret|session|redirect|urltogo|return|target/i.test(key)) url.searchParams.delete(key);
    return ['https:','http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}
/** The Moodle content view has no device, clipboard, notification, or filesystem permissions. */
export function webviewPermission(permission: string): boolean { void permission; return false; }

export function webviewLoadError(code: number) {
  if (code <= -200 && code >= -299) return 'certificate' as const;
  if ([-106,-105,-109,-118].includes(code)) return code === -118 ? 'timeout' as const : 'offline' as const;
  return 'load-failed' as const;
}
