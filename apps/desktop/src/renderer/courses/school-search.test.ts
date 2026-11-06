import { expect, it } from 'vitest';
import { schools } from '../../main/moodle/schools';
import { fuzzySiteMatch, schoolMonogram, schoolSearchText, sortedSchools } from './school-search';
it.each(['中原','中原大学','CYCU','Taiwan','台灣','臺灣','TW','ilearning.cycu.edu.tw','Christian Chung'])('finds schools by translation, abbreviation, host, or country %s',query => {
  expect(schools.filter(school => fuzzySiteMatch(query,schoolSearchText(school))).map(school => school.id)).toContain('cycu');
});
it('does not invent matches for unknown school names',() => {
  expect(schools.filter(school => fuzzySiteMatch('Unknown Academy',schoolSearchText(school)))).toEqual([]);
});
it.each([['Chung Yuan Christian University','CY'],['中原大學','中原'],['',''],['École Polytechnique','ÉP']])('generates a monogram for %s',(name,result) => expect(schoolMonogram(name)).toBe(result));

it.each([['政大','nccu'],['成大','ncku'],['臺科大','ntust'],['台科大','ntust'],['陽明交大','nycu'],['清大','nthu'],['北教大','ntue']])('finds %s by its common Chinese short name',(query,id) => {
  expect(schools.filter(school => fuzzySiteMatch(query,schoolSearchText(school))).map(school => school.id)).toContain(id);
});

it('prioritizes Taiwan when either the UI or system locale uses Traditional Chinese',() => {
  const taiwan=schools.find(school => school.id === 'cycu')!;
  const international={...schools.find(school => school.id === 'ucl')!,name:'A University',localizedNames:{en:'A University'}};
  const directory=[international,taiwan];
  expect(sortedSchools(directory,'en','en-US').map(school => school.id)).toEqual(['ucl','cycu']);
  expect(sortedSchools(directory,'en','zh-TW').map(school => school.id)).toEqual(['cycu','ucl']);
  expect(sortedSchools(directory,'zh-Hant','en-US').map(school => school.id)).toEqual(['cycu','ucl']);
  expect(directory).toEqual([international,taiwan]);
});
