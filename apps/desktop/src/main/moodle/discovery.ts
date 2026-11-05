/**
 * Validate public site configuration and choose the supported authentication plan.
 * Owned by main/moodle.
 * Credentials and authenticated transports stay in main; renderer results use shared schemas.
 * @packageDocumentation
 */
/** Probe a user-selected HTTPS Moodle root without credentials. Validate public configuration before use. */
import { z } from 'zod';
import { getDomain } from 'tldts';
import type { AuthPlan, MoodleSiteCheck } from '../../shared/moodle';
import { moodleFetch, normalizeSiteUrl, resolvePublicHost, siteTarget } from './site-url';

const number = z.coerce.number();
export const publicConfigSchema = z.object({
  wwwroot:z.string().optional(),httpswwwroot:z.string().optional(),sitename:z.string().default('Moodle'),
  typeoflogin:number.default(1),launchurl:z.string().optional(),
  identityproviders:z.array(z.object({name:z.string().default('SSO'),iconurl:z.string().default(''),url:z.string().url()})).default([]),
  showloginform:number.optional(),maintenanceenabled:number.default(0),maintenancemessage:z.string().optional(),
  enablewebservices:number.default(1),enablemobilewebservice:number.default(1),
  tool_mobile_disabledfeatures:z.string().optional(),version:z.union([z.string(),z.number()]).optional(),
  logourl:z.string().optional(),compactlogourl:z.string().optional(),
  country:z.string().optional().transform(value => value && /^[a-z]{2}$/i.test(value) ? value.toUpperCase() : undefined),registerauth:z.string().default(''),
  tool_mobile_qrcodetype:number.default(0),
  forcedurlscheme:z.string().regex(/^[a-z][a-z0-9+.-]*$/i).optional(),
});
export type CheckedSite = MoodleSiteCheck & {config:z.infer<typeof publicConfigSchema>};
/** Choose a supported login flow from validated public site settings. */
export function authPlan(config: z.infer<typeof publicConfigSchema>): AuthPlan {
  if (config.maintenanceenabled) return {kind:'unavailable',reason:'maintenance'};
  if (!config.enablewebservices) return {kind:'unavailable',reason:'webservices-disabled'};
  if (!config.enablemobilewebservice) return {kind:'unavailable',reason:'mobile-disabled'};
  if (config.version && Number(config.version) < 2018051700) return {kind:'unavailable',reason:'unsupported-version'};
  if (![1,2,3].includes(config.typeoflogin)) return {kind:'unavailable',reason:'unsupported-login'};
  if (config.typeoflogin === 3) return {kind:'embedded',providers:config.identityproviders};
  if (config.typeoflogin === 2 || config.showloginform === 0) return {kind:'browser',providers:config.identityproviders};
  return {kind:'password',...(config.identityproviders.length ? {providers:config.identityproviders} : {})};
}
/** Compare hosts by exact name or registrable domain, including private suffixes. */
export function sameSiteDomain(first: string, second: string): boolean {
  const a = new URL(first).hostname, b = new URL(second).hostname;
  return a === b || getDomain(a,{allowPrivateDomains:true}) !== null && getDomain(a,{allowPrivateDomains:true}) === getDomain(b,{allowPrivateDomains:true});
}
/** Probe a selected public Moodle root and return validated availability and login guidance. */
export async function checkSite(input: string, request: typeof fetch = moodleFetch): Promise<CheckedSite> {
  const initial = normalizeSiteUrl(input);
  const discover = async (root: string): Promise<CheckedSite> => {
    let current = `${root}/lib/ajax/service-nologin.php?info=tool_mobile_get_public_config`;
    const args = JSON.stringify([{index:0,methodname:'tool_mobile_get_public_config',args:{}}]);
    let get = false;
    for (let hop = 0; hop < 6; hop++) {
      const target = new URL(current);
      if (get) target.searchParams.set('args',args);
      const response = await request(target.href,{method:get ? 'GET' : 'POST',headers:{'Content-Type':'application/json'},...(get ? {} : {body:args}),redirect:'manual',signal:AbortSignal.timeout(30_000)});
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const next = new URL(response.headers.get('location') ?? '',current);
        siteTarget(new URL(root).origin,next.href);
        current = next.href;
        if ([301,302,303].includes(response.status)) get = true;
        continue;
      }
      if (!response.ok) throw new Error('Moodle discovery failed');
      const rawResult = z.array(z.object({error:z.boolean(),data:z.unknown().optional(),exception:z.object({errorcode:z.string().optional()}).optional()})).safeParse(await response.json().catch(() => { throw new Error('Moodle discovery failed'); }));
      if (!rawResult.success) throw new Error('Moodle discovery failed');
      const result = rawResult.data[0];
      if (result?.error && result.exception?.errorcode === 'codingerror' && !get) { get = true; continue; }
      if (!result || result.error) throw new Error('Moodle discovery failed');
      const parsed = publicConfigSchema.safeParse(result.data);
      if (!parsed.success) throw new Error('Moodle discovery failed');
      const config = parsed.data;
      const canonical = normalizeSiteUrl(config.httpswwwroot || config.wwwroot || root);
      if (!sameSiteDomain(root,canonical)) throw new Error('Moodle canonical host requires confirmation');
      if (request === moodleFetch) await resolvePublicHost(new URL(canonical).hostname);
      return {siteUrl:canonical,siteName:config.sitename,authPlan:authPlan(config),config};
    }
    throw new Error('Too many Moodle redirects');
  };
  try { return await discover(initial); }
  catch (error) {
    if (!(error instanceof Error) || /Unsafe|confirmation|outside site/.test(error.message)) throw error;
    const alternate = new URL(initial);
    if (/^[\d.]+$/.test(alternate.hostname) || alternate.hostname.includes(':')) throw error;
    alternate.hostname = alternate.hostname.startsWith('www.') ? alternate.hostname.slice(4) : `www.${alternate.hostname}`;
    return discover(normalizeSiteUrl(alternate.href));
  }
}
