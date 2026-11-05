/** Local school search and presentation. Search never sends a query or loads a remote image. */
import type { MoodleSchool } from '../../shared/moodle';

const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase();
/** Match words in any order, with subsequence matching for abbreviations. */
export function fuzzySiteMatch(query: string, text: string): boolean {
  const haystack = fold(text), words = fold(query).replace(/^https?:\/\//,'').trim().split(/\s+/);
  return words.every(word => {
    if (haystack.includes(word)) return true;
    if (word.length > 4) return false;
    let index = 0;
    for (const character of haystack) if (character === word[index]) index++;
    return index === word.length;
  });
}

/** Build searchable country names without contacting a directory service. */
export function countryNames(country: string | undefined): string {
  return country ? [country,...['en','zh-Hant','ja'].map(language => new Intl.DisplayNames([language],{type:'region'}).of(country))].join(' ') : '';
}

/** Search every bundled translation and country name, regardless of the active app language. */
export function schoolSearchText(school: MoodleSchool): string {
  return [school.id,school.name,school.host,...Object.values(school.localizedNames ?? {}),countryNames(school.country),
  ].join(' ');
}

/** Use initials for Latin names and two characters for names without spaces. */
export function schoolMonogram(name: string): string {
  const words = name.trim().split(/\s+/);
  return (words.length > 1 ? words.slice(0,2).map(word => Array.from(word)[0]).join('') : Array.from(name.trim()).slice(0,2).join('')).toLocaleUpperCase();
}
