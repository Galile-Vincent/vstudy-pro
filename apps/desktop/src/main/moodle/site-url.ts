import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

export type Resolver = (host: string) => Promise<{address:string;family:number}[]>;
const resolveAll: Resolver = host => lookup(host,{all:true,verbatim:true});
const blocked = new BlockList();
for (const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(address,prefix,'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::',3,'ipv6');
for (const [address,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]] as const) blocked.addSubnet(address,prefix,'ipv6');

export function publicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address,'ipv4') : family === 6 && globalV6.check(address,'ipv6') && !blocked.check(address,'ipv6');
}
export function networkUrl(input: string, allowedPorts: readonly number[] = []): URL {
  const url = new URL(input);
  const host = url.hostname.replace(/^\[|\]$/g,'');
  if (url.protocol !== 'https:' || url.username || url.password || url.port && !allowedPorts.includes(Number(url.port)) || !host || host.endsWith('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || isIP(host) && !publicAddress(host)) throw new Error('Unsafe Moodle site URL');
  return url;
}
export function normalizeSiteUrl(input: string, allowedPorts: readonly number[] = []): string {
  const text = input.trim();
  const url = networkUrl(/^[a-z][a-z\d+.-]*:/i.test(text) && !/^[^/?#]+:\d+(?:\/|$)/.test(text) ? text : `https://${text}`,allowedPorts);
  url.search = ''; url.hash = '';
  url.pathname = url.pathname.replace(/\/(?:login|course|my|admin|mod|user|webservice|lib|auth)(?:\/.*)?$/i,'').replace(/\/index\.php(?:\/.*)?$/i,'').replace(/\/+$/,'');
  return url.href.replace(/\/$/,'');
}
export function siteTarget(root: string, input: string): URL {
  const site = networkUrl(root);
  const target = networkUrl(input);
  if (site.origin !== target.origin || !(target.pathname === site.pathname.replace(/\/$/,'') || target.pathname.startsWith(site.pathname.replace(/\/$/,'') + '/'))) throw new Error('Moodle request outside site root');
  return target;
}
export async function resolvePublicHost(host: string, resolver: Resolver = resolveAll) {
  host = host.replace(/^\[|\]$/g,'');
  const addresses = (isIP(host) ? [{address:host,family:isIP(host)}] : await resolver(host)).filter(item => publicAddress(item.address));
  if (!addresses.length) throw new Error('Unsafe Moodle host address');
  return addresses;
}

export function createMoodleFetch(resolver: Resolver = resolveAll): typeof fetch {
  return async (input, options = {}) => {
    const initial = networkUrl(String(input));
    const send = async (url: URL, hops: number): Promise<Response> => {
      networkUrl(url.href);
      // Validate every answer at socket creation, rather than trusting a preflight DNS result.
      const response = await new Promise<Response>((resolve,reject) => {
        const req = httpsRequest(url,{
          method:options.method ?? 'GET', headers:Object.fromEntries(new Headers(options.headers)), signal:options.signal ?? undefined,
          agent:false, rejectUnauthorized:true,
          lookup:(host, _lookupOptions, callback) => {
            void resolvePublicHost(host,resolver).then(addresses => {
              const address = addresses[0]!;
              if (_lookupOptions.all) callback(null,addresses);
              else callback(null,address.address,address.family);
            },error => callback(error,'',4));
          },
        },res => {
          const headers = new Headers();
          for (const [key,value] of Object.entries(res.headers)) if (value !== undefined) headers.set(key,Array.isArray(value) ? value.join(', ') : value);
          const status = res.statusCode ?? 502;
          if ([204,205,304].includes(status)) res.resume();
          resolve(new Response([204,205,304].includes(status) ? null : Readable.toWeb(res) as ReadableStream<Uint8Array>,{status,headers}));
        });
        req.on('error',reject);
        if (options.body != null) req.write(String(options.body));
        req.end();
      });
      if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
        if (options.redirect === 'manual') return response;
        await response.body?.cancel();
        if (options.redirect === 'error' || hops >= 5) throw new Error('Moodle redirect rejected');
        const next = siteTarget(initial.origin,new URL(response.headers.get('location')!,url).href);
        if (options.method === 'POST' && [301,302,303].includes(response.status)) throw new Error('Moodle redirect lost POST');
        return send(next,hops + 1);
      }
      return response;
    };
    return send(initial,0);
  };
}
export const moodleFetch = createMoodleFetch();
export function siteFetch(root: string, transport: typeof fetch = moodleFetch): typeof fetch {
  return (input,options) => transport(siteTarget(root,String(input)).href,options);
}
