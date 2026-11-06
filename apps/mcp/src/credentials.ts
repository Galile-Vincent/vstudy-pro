/** Persist only a random client identity and opaque local grant in private storage. @packageDocumentation */
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { checkDirectory, ensureDirectory, readLocal, replaceLocal, writeExclusive } from './files';

const identitySchema = z.object({
  clientId: z.string().uuid(),
  grant: z.string().min(32).max(256).optional(),
  expiresAt: z.string().datetime().optional(),
}).strict();
export type Identity = z.infer<typeof identitySchema>;

export class Credentials {
  constructor(readonly path: string) {}

  read(): Identity | undefined {
    const text = readLocal(this.path, true);
    if (text === undefined) return undefined;
    checkDirectory(dirname(this.path));
    return identitySchema.parse(JSON.parse(text));
  }

  identity(): Identity {
    ensureDirectory(dirname(this.path), true);
    const existing = this.read();
    if (existing) return existing;
    const identity = { clientId: randomUUID() };
    try { writeExclusive(this.path, JSON.stringify(identity) + '\n'); }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    }
    return this.read()!;
  }

  save(identity: Identity): void {
    checkDirectory(dirname(this.path));
    const before = readLocal(this.path, true);
    if (!before || identitySchema.parse(JSON.parse(before)).clientId !== identity.clientId) {
      throw new Error('Client identity changed while pairing.');
    }
    replaceLocal(this.path, JSON.stringify(identitySchema.parse(identity)) + '\n', before);
  }
}
