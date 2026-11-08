/** Exact main-owned navigation and authentication origins. No renderer overrides. */
import type { WebChatProvider } from '../../shared/web-chat';
export const webChatProviders = {
  gemini:{url:'https://gemini.google.com/app',origins:['https://gemini.google.com','https://accounts.google.com']},
  chatgpt:{url:'https://chatgpt.com',origins:['https://chatgpt.com','https://auth.openai.com','https://auth0.openai.com','https://accounts.google.com','https://login.microsoftonline.com','https://login.live.com','https://appleid.apple.com']},
  claude:{url:'https://claude.ai',origins:['https://claude.ai','https://platform.claude.com','https://console.anthropic.com','https://accounts.google.com']},
} as const;
export function safeWebChatUrl(raw:string):URL|null {
  if (raw.length > 8192 || [...raw].some(char=>char.charCodeAt(0)<=32 || char.charCodeAt(0)===127 || char==='\\')) return null;
  try { const url=new URL(raw); return url.protocol==='https:' && !url.username && !url.password ? url : null; } catch { return null; }
}
export function webChatNavigation(provider:WebChatProvider,raw:string):boolean {
  const url=safeWebChatUrl(raw);
  return !!url && (webChatProviders[provider].origins as readonly string[]).includes(url.origin);
}
/** Resource origins differ from navigation: vendors use changing CDNs, APIs and bot checks.
 * Chromium SOP/CSP still apply; local networks, file URLs and custom schemes are refused. */
export function webChatResource(raw:string):boolean {
  if (/^(data:|blob:)/.test(raw)) return true;
  const url=safeWebChatUrl(raw.replace(/^wss:/,'https:'));
  if (!url || url.port && url.port!=='443') return false;
  const host=url.hostname.toLowerCase().replace(/\.+$/,'');
  return host.includes('.') && !host.endsWith('.localhost') && !host.endsWith('.local') && !host.endsWith('.internal') && !/^[\d.]+$/.test(host) && !host.includes(':');
}
