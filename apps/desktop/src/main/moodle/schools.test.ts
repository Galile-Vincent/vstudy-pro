/** Registry fixtures assert offline metadata and stable roots, not live school availability. */
import { expect, it } from 'vitest';
import { schools } from './schools';
import { normalizeSiteUrl } from './site-url';
import { moodleSchoolSchema } from '../../shared/moodle';

it('ships unique validated directory entries with canonical roots and complete metadata',() => {
  expect(schools.length).toBeGreaterThan(1);
  expect(new Set(schools.map(school => school.id)).size).toBe(schools.length);
  expect(new Set(schools.map(school => school.host)).size).toBe(schools.length);
  for (const school of schools) {
    expect(moodleSchoolSchema.parse(school)).toEqual(school);
    expect(normalizeSiteUrl(school.host)).toBe(school.host);
    expect(school.country).toMatch(/^[A-Z]{2}$/);
    expect(school.localizedNames?.['zh-Hant']).toBeTruthy();
    expect(school.localizedNames?.ja).toBeTruthy();
    expect(school).toHaveProperty('logoUrl');
    expect(school.notes).toBeTruthy();
  }
});
