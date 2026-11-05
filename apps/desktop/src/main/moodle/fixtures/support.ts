/**
 * Provide reusable synthetic inputs for subsystem regression tests.
 * Owned by main/moodle.
 * Fixture values are test data and must never contain real credentials.
 * @packageDocumentation
 */
import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { MoodleAccount } from '../../../shared/moodle';

export const fixture: Record<string,unknown> = JSON.parse(readFileSync(new URL('./responses.json',import.meta.url),'utf8'));
export const account: MoodleAccount = {id:'11111111-1111-4111-a111-111111111111',siteUrl:'https://ilearning.cycu.edu.tw',siteName:'中原大學 CYCU',remoteUserId:42,displayName:'Student',status:'connected',syncedAt:null};
export function fixtureFetch(overrides: Record<string,unknown> = {}) {
  return vi.fn<typeof fetch>(async (_url,options) => {
    if (String(_url).includes('service-nologin.php')) return Response.json([{error:false,data:{sitename:'中原大學 CYCU',typeoflogin:2}}]);
    const name = new URLSearchParams(String(options?.body)).get('wsfunction')!;
    return Response.json(Object.hasOwn(overrides,name) ? overrides[name] : fixture[name]);
  });
}

