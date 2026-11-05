/**
 * Verify signed Moodle SSO callbacks against the one-time passport and expected site.
 * Owned by main/moodle.
 * Credentials and authenticated transports stay in main; renderer results use shared schemas.
 * @packageDocumentation
 */
import { MoodleAuthError, type MoodleTokens } from './auth';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Recognize a token-shaped custom-scheme callback without treating recognition as authorization. */
export function isCallbackCandidate(target: string): boolean {
  const match = /^([a-z][a-z0-9+.-]*):\/\/token=([A-Za-z0-9+/=%_-]+)$/i.exec(target);
  return !!match && !['http','https'].includes(match[1]!.toLowerCase());
}

/** Verify the callback signature and one-time passport before returning credentials. */
export function verifyCallback(callback: string, siteUrl: string | readonly string[], passport: string, verifiedSite?: (site: string) => void): MoodleTokens {
  const match = /^[a-z][a-z0-9+.-]*:\/\/token=([A-Za-z0-9+/=%_-]+)$/i.exec(callback);
  if (!isCallbackCandidate(callback) || !match || callback.length > 40_000 || !passport) throw new MoodleAuthError('callback-invalid','malformed');
  let encoded: string;
  try { encoded = decodeURIComponent(match[1]!); } catch { throw new MoodleAuthError('callback-invalid','malformed'); }
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded)) throw new MoodleAuthError('callback-invalid','malformed');
  const parts = Buffer.from(encoded,'base64').toString('utf8').split(':::');
  const signature = parts[0] ?? '';
  const candidates = (typeof siteUrl === 'string' ? [siteUrl] : siteUrl).flatMap(root => {
    const base = root.replace(/\/$/, '');
    const alternate = base.startsWith('https:') ? base.replace(/^https:/, 'http:') : base.replace(/^http:/, 'https:');
    return [base,base + '/',alternate,alternate + '/'];
  });
  let matchedSite: string | undefined;
  for (const site of candidates) {
    const expected = createHash('md5').update(site + passport).digest('hex');
    if (Buffer.byteLength(signature) === 32 && timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) matchedSite = site;
  }
  if (parts.length < 2 || parts.length > 3 || !/^[a-f0-9]{32}$/.test(signature) || !parts[1] || parts[1].length > 16384 || [...parts[1]].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) throw new MoodleAuthError('callback-invalid','malformed');
  if (parts[2] && (parts[2].length > 16384 || [...parts[2]].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127))) throw new MoodleAuthError('callback-invalid','malformed');
  if (!matchedSite) throw new MoodleAuthError('callback-invalid','signature-mismatch');
  verifiedSite?.(matchedSite);
  return {token:parts[1],...(parts[2] ? {privateToken:parts[2]} : {})};
}

