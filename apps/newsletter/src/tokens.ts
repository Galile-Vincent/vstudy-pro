const encoder = new TextEncoder();
export async function mac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text))), b => b.toString(16).padStart(2, '0')).join('');
}
export type Purpose = 'confirm' | 'unsubscribe' | 'delete';
export async function signToken(secret: string, purpose: Purpose, id: string, expires: number) {
  const payload = `v1.${purpose}.${id}.${expires}`;
  return `${payload}.${await mac(secret, payload)}`;
}
export async function verifyToken(secret: string, token: string, purpose: Purpose, now: number): Promise<string | null> {
  const match = /^v1\.(confirm|unsubscribe|delete)\.([0-9a-f-]{36})\.([0-9]{10,13})\.([0-9a-f]{64})$/.exec(token);
  if (!match || match[1] !== purpose || Number(match[3]) <= now) return null;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(match[4]!.match(/../g)!, byte => parseInt(byte, 16));
  // Web Crypto HMAC verification compares signatures in constant time.
  const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(token.slice(0, token.lastIndexOf('.'))));
  return valid ? match[2]! : null;
}
