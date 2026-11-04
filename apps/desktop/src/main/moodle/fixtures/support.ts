import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { MoodleAccount } from '../../../shared/moodle';

export const fixture: Record<string,unknown> = JSON.parse(readFileSync(new URL('./responses.json',import.meta.url),'utf8'));
export const account: MoodleAccount = {id:'11111111-1111-4111-a111-111111111111',schoolId:'cycu',remoteUserId:42,displayName:'Student',status:'connected',syncedAt:null};
export function fixtureFetch(overrides: Record<string,unknown> = {}) {
  return vi.fn<typeof fetch>(async (_url,options) => {
    const name = new URLSearchParams(String(options?.body)).get('wsfunction')!;
    return Response.json(Object.hasOwn(overrides,name) ? overrides[name] : fixture[name]);
  });
}

