export const POSTHOG = {host:'https://us.i.posthog.com',key:'phc_qFJt7jUWiBAJPPLPWgTmLkwkFTtkdG6aB9kEUaT4Yvdf'};
export function analyticsConfig(packaged: boolean, env = process.env) {
  try {
    const host = new URL(env.VSTUDY_POSTHOG_HOST ?? POSTHOG.host);
    if (host.protocol !== 'https:' || host.username || host.password || host.search || host.hash || host.pathname !== '/') return null;
    return {host:host.origin,key:env.VSTUDY_POSTHOG_KEY ?? POSTHOG.key,enabled:env.VSTUDY_ANALYTICS_ENABLE === '1' || packaged && env.NODE_ENV !== 'test' && !env.VITEST};
  } catch { return null; }
}
