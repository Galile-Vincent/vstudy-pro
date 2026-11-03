export function isAppUrl(candidate: string, entryUrl: string): boolean {
  try {
    const url = new URL(candidate);
    const entry = new URL(entryUrl);
    return (
      url.protocol === entry.protocol &&
      url.origin === entry.origin &&
      url.pathname === entry.pathname &&
      url.search === entry.search
    );
  } catch {
    return false;
  }
}
export const productionCsp =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: vstudy-asset:; font-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
export function developmentCsp(entryUrl: string): string {
  const origin = new URL(entryUrl).origin;
  const socketOrigin = origin.replace(/^http/, "ws");
  return `default-src 'none'; script-src 'self' 'nonce-vstudy-development'; style-src 'self' 'unsafe-inline'; img-src 'self' data: vstudy-asset:; font-src 'self' data:; connect-src ${origin} ${socketOrigin}; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'`;
}
