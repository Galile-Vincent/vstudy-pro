/**
 * Normalize remote Moodle identifiers before storing or comparing them.
 * Owned by main/moodle.
 * Credentials and authenticated transports stay in main; renderer results use shared schemas.
 * @packageDocumentation
 */
import { createHash } from 'node:crypto';

/** Normalize supported remote ID representations and reject invalid identifiers. */
export function remoteId(account: string, kind: string, id: string | number): string {
  const hex = createHash('sha256').update(JSON.stringify([account, kind, id])).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
