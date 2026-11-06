/** Private atomic MCP state contains grant hashes and bounded redacted activity, never bearers. @packageDocumentation */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { constants, openSync, closeSync, fstatSync, readFileSync, lstatSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { activitySchema, grantSchema, type AgentActivity, type Grant, type Scope } from '../../shared/mcp';
import { atomicWriteSync } from '../storage/atomic';
import { McpFailure } from './errors';
import type { McpStatePersistence } from '../../shared/mcp-platform';

export const GRANT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const ACTIVITY_LIMIT = 1000;
const storedGrantSchema = grantSchema.extend({tokenHash: z.string().regex(/^[a-f0-9]{64}$/)}).strict();
type StoredGrant = z.infer<typeof storedGrantSchema>;
const stateSchema = z.object({version: z.literal(1), enabled: z.boolean(), grants: z.array(storedGrantSchema).max(100), activity: z.array(activitySchema).max(ACTIVITY_LIMIT)}).strict();
type StoredState = z.infer<typeof stateSchema>;

/** Reject links and foreign owners before creating or tightening the private MCP directory. */
export function privateMcpDirectory(userData: string): string {
  const uid = process.getuid?.();
  if (uid === undefined) throw new McpFailure('UNSUPPORTED');
  const parent = lstatSync(userData);
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== uid) throw new McpFailure('DENIED');
  const directory = join(userData, 'mcp');
  try { mkdirSync(directory, {mode: 0o700}); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new McpFailure('DENIED'); }
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== uid) throw new McpFailure('DENIED');
  chmodSync(directory, 0o700);
  return directory;
}

function hash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
function publicGrant({tokenHash: _hash, ...grant}: StoredGrant): Grant { void _hash; return structuredClone(grant); }

/** One main-process owner serializes state updates through synchronous durable replacement. */
export class GrantStore {
  private current: StoredState;
  constructor(private readonly userData: string, private readonly now = Date.now, private readonly persistence:McpStatePersistence=unixStatePersistence) {
    try {
      const text=persistence.read(userData);
      if (text!==undefined && Buffer.byteLength(text)>8*1024*1024) throw new McpFailure('DENIED');
      this.current=text===undefined ? {version:1,enabled:false,grants:[],activity:[]} : stateSchema.parse(JSON.parse(text));
    } catch {throw new McpFailure('DENIED');}
    this.current.activity = this.retained(this.current.activity);
  }

  get enabled(): boolean { return this.current.enabled; }
  get grants(): Grant[] { return this.current.grants.map(publicGrant); }
  get activity(): AgentActivity[] { return structuredClone(this.retained(this.current.activity)); }

  private retained(activity: AgentActivity[]): AgentActivity[] {
    const oldest = this.now() - GRANT_LIFETIME_MS;
    return activity.filter(item => Date.parse(item.at) >= oldest).slice(-ACTIVITY_LIMIT).map(item => Buffer.byteLength(JSON.stringify(item)) <= 4096 ? item : {...item, args: {omitted: 'Arguments exceed the retained activity limit.'}});
  }

  private save(next: StoredState): void {
    try {
      this.persistence.write(this.userData,JSON.stringify(next));
      this.current = next;
    } catch { throw new McpFailure('INTERNAL'); }
  }

  setEnabled(enabled: boolean): void { this.save({...this.current, enabled}); }

  /** Mint once at pair.finish. Replacement revokes old grants for the same client. */
  issue(clientId: string, clientName: string, scopes: Scope[], accountIds: string[]): {grant: string; grantInfo: Grant} {
    const now = this.now();
    const at = new Date(now).toISOString();
    const grant = randomBytes(32).toString('base64url');
    const grantInfo: Grant = {id: randomUUID(), clientId, clientName, scopes: [...new Set(scopes)], accountIds: [...new Set(accountIds)], createdAt: at, expiresAt: new Date(now + GRANT_LIFETIME_MS).toISOString(), lastUsedAt: null, revokedAt: null};
    const grants = this.current.grants.filter(item => !item.revokedAt && Date.parse(item.expiresAt) > this.now()).map(item => item.clientId === clientId ? {...item, revokedAt: at} : item);
    if (grants.length >= 100) throw new McpFailure('RATE_LIMITED');
    this.save({...this.current, grants: [...grants, {...grantInfo, tokenHash: hash(grant)}]});
    return {grant, grantInfo};
  }

  /** A bearer is never attached to returned metadata or written to disk. */
  authorize(token: string): Grant {
    if (!this.enabled) throw new McpFailure('DISABLED');
    const digest = Buffer.from(hash(token), 'hex');
    const found = this.current.grants.find(item => timingSafeEqual(digest, Buffer.from(item.tokenHash, 'hex')));
    if (!found) throw new McpFailure('UNPAIRED');
    if (found.revokedAt) throw new McpFailure('DENIED');
    if (Date.parse(found.expiresAt) <= this.now()) throw new McpFailure('EXPIRED');
    return publicGrant(found);
  }

  revoke(grantId: string): void {
    this.save({...this.current, grants: this.current.grants.map(item => item.id === grantId ? {...item, revokedAt: new Date(this.now()).toISOString()} : item)});
  }

  edit(grantId: string, scopes: Scope[], accountIds: string[], expiresAt: string): void {
    if (Date.parse(expiresAt) > this.now() + GRANT_LIFETIME_MS) throw new McpFailure('INVALID_ARGUMENT');
    const found = this.current.grants.find(item => item.id === grantId && !item.revokedAt);
    if (!found) throw new McpFailure('NOT_FOUND');
    this.save({...this.current, grants: this.current.grants.map(item => item.id === grantId ? {...item, scopes: [...new Set(scopes)], accountIds: [...new Set(accountIds)], expiresAt} : item)});
  }

  record(grantId: string, activity: AgentActivity): void {
    const now = this.now();
    const grants = this.current.grants.map(item => item.id === grantId && (item.lastUsedAt === null || now - Date.parse(item.lastUsedAt) >= 60_000)
      ? {...item, lastUsedAt: new Date(now).toISOString()} : item);
    this.save({...this.current, grants, activity: this.retained([...this.current.activity, activity])});
  }
}

export const unixStatePersistence:McpStatePersistence = {
  read(userData) {
    const path=join(privateMcpDirectory(userData),'state.json');
    let file:number;
    try {file=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);} catch(error) {
      if ((error as NodeJS.ErrnoException).code==='ENOENT') return undefined;
      throw new McpFailure('DENIED');
    }
    try {
      const info=fstatSync(file);
      if (!info.isFile() || info.nlink!==1 || info.uid!==process.getuid?.() || (info.mode&0o077)!==0 || info.size>8*1024*1024) throw new McpFailure('DENIED');
      return readFileSync(file,'utf8');
    } finally {closeSync(file);}
  },
  write(userData,text) {
    const path=join(privateMcpDirectory(userData),'state.json');
    try {
      const info=lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink!==1 || info.uid!==process.getuid?.()) throw new McpFailure('DENIED');
    } catch(error) {if ((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;}
    atomicWriteSync(path,text);
  },
};
