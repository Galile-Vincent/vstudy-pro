import { expect, it } from 'vitest';
import { schools } from '../../main/moodle/schools';
import { fuzzySiteMatch, schoolMonogram, schoolSearchText } from './school-search';
it.each(['中原','中原大学','CYCU','Taiwan','台灣','TW','ilearning.cycu.edu.tw','Christian Chung'])('finds schools by translation, abbreviation, host, or country %s',query => {
  expect(schools.filter(school => fuzzySiteMatch(query,schoolSearchText(school))).map(school => school.id)).toContain('cycu');
});
it('does not invent matches for unknown school names',() => {
  expect(schools.filter(school => fuzzySiteMatch('Unknown Academy',schoolSearchText(school)))).toEqual([]);
});
it.each([['Chung Yuan Christian University','CY'],['中原大學','中原'],['',''],['École Polytechnique','ÉP']])('generates a monogram for %s',(name,result) => expect(schoolMonogram(name)).toBe(result));
