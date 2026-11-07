/**
 * Regression coverage for moodle schools.
 * Owned by main/moodle.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
/** Registry fixtures assert offline metadata and stable roots, not live school availability. */
import { expect, it, vi } from 'vitest';
import { schools } from './schools';
import https from 'node:https';
import { fuzzySiteMatch, schoolSearchText } from '../../renderer/courses/school-search';
import { normalizeSiteUrl } from './site-url';
import { moodleSchoolSchema } from '../../shared/moodle';

it('ships unique validated directory entries with canonical roots and complete metadata',() => {
  expect(schools.length).toBeGreaterThanOrEqual(25);
  expect(new Set(schools.map(school => school.id)).size).toBe(schools.length);
  expect(new Set(schools.map(school => school.host)).size).toBe(schools.length);
  for (const school of schools) {
    expect(moodleSchoolSchema.parse(school)).toEqual(school);
    expect(new URL(school.host).protocol).toBe('https:');
    expect(new URL(school.host).search).toBe('');
    expect(new URL(school.host).hash).toBe('');
    expect(normalizeSiteUrl(school.host)).toBe(school.host);
    expect(school.country).toMatch(/^[A-Z]{2}$/);
    expect(school.localizedNames?.['zh-Hant']).toBeTruthy();
    expect(school.localizedNames?.ja).toBeTruthy();
    expect(school).toHaveProperty('logoUrl');
    expect(school.notes).toBeTruthy();
  }
});

it.each(['taiwan','台灣','臺灣','TW'])('finds every Taiwan school offline with %s',query => {
  expect(schools.filter(school => fuzzySiteMatch(query,schoolSearchText(school))).map(school => school.id).sort())
    .toEqual(schools.filter(school => school.country === 'TW').map(school => school.id).sort());
});

it('lists and searches the bundled directory without network requests',async () => {
  const fetch=vi.fn(() => {throw new Error('Directory must stay offline');});
  const request=vi.spyOn(https,'request').mockImplementation(() => {throw new Error('Directory must stay offline');});
  vi.stubGlobal('fetch',fetch);
  try {
    vi.resetModules();
    const {schools:directory}=await import('./schools');
    for (const query of ['', '中原', 'taiwan', '臺灣', 'TW']) {
      expect(directory.filter(school => fuzzySiteMatch(query,schoolSearchText(school))).length).toBeGreaterThan(0);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  } finally {vi.unstubAllGlobals();request.mockRestore();}
});
