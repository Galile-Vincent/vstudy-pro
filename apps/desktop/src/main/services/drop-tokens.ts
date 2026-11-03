import { randomBytes } from 'node:crypto';
export class DropTokens {
  private entries = new Map<string, { path: string; frame: object; expires: number }>();
  issue(path: string, frame: object, now = Date.now()): string {
    for (const [token, value] of this.entries) if (value.expires <= now) this.entries.delete(token);
    if (this.entries.size >= 1000) throw new Error('Too many pending drops');
    const token = `drop:${randomBytes(32).toString('hex')}`;
    this.entries.set(token, { path, frame, expires: now + 60_000 });
    return token;
  }
  consume(token: string, frame: object, now = Date.now()): string {
    const entry = this.entries.get(token);
    if (!entry || entry.frame !== frame || entry.expires <= now) throw new Error('Invalid or expired drop token');
    this.entries.delete(token);
    return entry.path;
  }
}
