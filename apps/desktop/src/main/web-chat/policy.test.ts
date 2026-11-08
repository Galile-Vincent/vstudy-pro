import { describe,it,expect } from 'vitest';
import { webChatNavigation,webChatResource,safeWebChatUrl } from './policy';
import { webChatContract } from '../../shared/web-chat';
describe('hosted chat origin policy',()=>{
  it('pins navigation to exact provider and authentication origins',()=>{
    expect(webChatNavigation('gemini','https://gemini.google.com/app')).toBe(true);
    expect(webChatNavigation('gemini','https://accounts.google.com/o/oauth2/auth')).toBe(true);
    expect(webChatNavigation('chatgpt','https://auth.openai.com/log-in')).toBe(true);
    expect(webChatNavigation('claude','https://claude.ai/login')).toBe(true);
    for(const url of ['https://gemini.google.com.evil.test','https://evil.test/?https://gemini.google.com','https://gemini.google.com:444','http://gemini.google.com','https://user:pass@gemini.google.com','file:///tmp/test','javascript:alert(1)','https://chatgpt.com','https://gemini.google.com\\@evil.test','https://gemini.google.com/\n']) expect(webChatNavigation('gemini',url),url).toBe(false);
  });
  it('allows HTTPS vendor resources but refuses local and unsafe transports',()=>{
    expect(webChatResource('https://www.gstatic.com/script.js')).toBe(true);
    expect(webChatResource('wss://ws.chatgpt.com/socket')).toBe(true);
    for(const url of ['http://cdn.example.com','file:///secret','https://127.0.0.1','https://[::1]','https://localhost','https://host.local','https://10.0.0.1','https://2130706433','https://example.com:444']) expect(webChatResource(url),url).toBe(false);
    expect(safeWebChatUrl('https://a:b@chatgpt.com')).toBe(null);
  });
});
describe('resource policy',()=>{
  it('refuses absolute-DNS localhost spellings',()=>{
    for(const u of ['https://localhost./','https://app.localhost./','https://printer.local./','https://127.0.0.1./']) expect(webChatResource(u)).toBe(false);
    expect(webChatResource('https://cdn.example.com/a.js')).toBe(true);
  });
});
describe('hosted chat contracts',()=>{
  it('accepts provider controls without accepting URLs, partitions or scripts',()=>{
    expect(webChatContract['web-chat:open'].request.parse({provider:'claude',tabId:'11111111-1111-4111-8111-111111111111'})).toEqual({provider:'claude',tabId:'11111111-1111-4111-8111-111111111111',slotId:'page'});
    for(const request of [{provider:'evil'},{provider:'claude',url:'https://evil.test'},{provider:'claude',partition:'persist:default'},{provider:'claude',preload:'/tmp/evil'}]) expect(webChatContract['web-chat:open'].request.safeParse(request).success).toBe(false);
    const request={provider:'gemini',tabId:'11111111-1111-4111-8111-111111111111',generation:1,visible:true,bounds:{x:0,y:12,width:400,height:600}};
    expect(webChatContract['web-chat:layout'].request.safeParse(request).success).toBe(true);
    for(const bad of [-1,Infinity,NaN,20001,.5]) expect(webChatContract['web-chat:layout'].request.safeParse({...request,bounds:{...request.bounds,x:bad}}).success).toBe(false);
    expect(webChatContract['web-chat:state'].response.safeParse({status:'ready',canGoBack:false,canGoForward:false,cookies:[]}).success).toBe(false);
  });
});
