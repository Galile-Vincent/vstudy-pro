import { createHash, timingSafeEqual } from 'node:crypto';

export function verifyCallback(callback: string, siteUrl: string, passport: string): string {
  const match = /^vstudymoodle:\/\/token=([A-Za-z0-9+/=%_-]+)$/.exec(callback);
  if (!match || callback.length > 40_000 || !passport) throw new Error('Invalid Moodle callback');
  const encoded = decodeURIComponent(match[1]!);
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded)) throw new Error('Invalid Moodle callback');
  const parts = Buffer.from(encoded,'base64').toString('utf8').split(':::');
  const signature = parts[0] ?? '';
  const expected = createHash('md5').update(siteUrl + passport).digest('hex');
  if (parts.length < 2 || parts.length > 3 || !/^[a-f0-9]{32}$/.test(signature) || !timingSafeEqual(Buffer.from(signature),Buffer.from(expected)) || !parts[1] || parts[1].length > 16384 || [...parts[1]].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) throw new Error('Invalid Moodle callback');
  return parts[1];
}

