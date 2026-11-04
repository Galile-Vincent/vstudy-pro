import type { MoodleTokens } from './auth';
import { createHash, timingSafeEqual } from 'node:crypto';

export function verifyCallback(callback: string, siteUrl: string, passport: string): MoodleTokens {
  const match = /^vstudymoodle:\/\/token=([A-Za-z0-9+/=%_-]+)$/.exec(callback);
  if (!match || callback.length > 40_000 || !passport) throw new Error('Invalid Moodle callback');
  const encoded = decodeURIComponent(match[1]!);
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded)) throw new Error('Invalid Moodle callback');
  const parts = Buffer.from(encoded,'base64').toString('utf8').split(':::');
  const signature = parts[0] ?? '';
  const base = siteUrl.replace(/\/$/, '');
  const alternate = base.startsWith('https:') ? base.replace(/^https:/, 'http:') : base.replace(/^http:/, 'https:');
  const candidates = [base, base + '/', alternate, alternate + '/'].map(site => createHash('md5').update(site + passport).digest('hex'));
  const valid = candidates.reduce((matched, expected) => matched | Number(signature.length === 32 && timingSafeEqual(Buffer.from(signature), Buffer.from(expected))), 0);
  if (parts.length < 2 || parts.length > 3 || !/^[a-f0-9]{32}$/.test(signature) || !valid || !parts[1] || parts[1].length > 16384 || [...parts[1]].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) throw new Error('Invalid Moodle callback');
  if (parts[2] && (parts[2].length > 16384 || [...parts[2]].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127))) throw new Error('Invalid Moodle callback');
  return {token:parts[1],...(parts[2] ? {privateToken:parts[2]} : {})};
}

