/**
 * Constrain application windows, navigation, permissions, and exported filenames.
 * Owned by main.
 * Main owns privileged resources; shutdown must settle work before releasing those resources.
 * @packageDocumentation
 */
export function isAppUrl(candidate: string, entryUrl: string): boolean {
  try {
    const url = new URL(candidate);
    const entry = new URL(entryUrl);
    return (
      url.protocol === entry.protocol &&
      url.origin === entry.origin &&
      url.hostname === entry.hostname && url.port === entry.port && !url.username && !url.password &&
      url.pathname === entry.pathname &&
      url.search === entry.search
    );
  } catch {
    return false;
  }
}
/** Production renderer policy excludes remote scripts and network connections. */
export const productionCsp =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: vstudy-asset:; font-src 'self' data:; media-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; child-src 'none'; frame-ancestors 'none'; object-src 'none'";
/** Permit the configured Vite origin while retaining the application trust boundary. */
export function developmentCsp(entryUrl: string): string {
  const origin = new URL(entryUrl).origin;
  const socketOrigin = origin.replace(/^http/, "ws");
  return `default-src 'none'; script-src 'self' 'nonce-vstudy-development'; style-src 'self' 'unsafe-inline'; img-src 'self' data: vstudy-asset:; font-src 'self' data:; media-src 'self'; connect-src ${origin} ${socketOrigin}; base-uri 'none'; form-action 'none'; frame-src 'none'; child-src 'none'; frame-ancestors 'none'; object-src 'none'`;
}

/** Remove path and control characters before suggesting a native export filename. */
export function safeFilename(name: string): string {
  return Array.from(name).filter(char => {
    const code = char.codePointAt(0)!;
    return code > 31 && code !== 127 && !(code >= 0x202a && code <= 0x202e) && !(code >= 0x2066 && code <= 0x2069) && !'/\\:'.includes(char);
  }).join('').slice(0, 180).replace(/^\.+/, '') || 'export';
}

/** Bound an untrusted document label before displaying it in native UI. */
export function safeDocumentLabel(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, '').slice(0, 300).trim();
}
