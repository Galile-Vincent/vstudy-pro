/** Local school search and presentation. Search never sends a query or loads a remote image. */
import type { MoodleSchool } from '../../shared/moodle';

const schoolAliases: Record<string,string> = {
  cycu:'中原',nccu:'政大 政治',ncku:'成大 成功',ntust:'台科大 臺科大',nycu:'陽明交大 交大 陽交大',
  ccu:'中正',ntpu:'北大 台北大 臺北大',nuk:'高大 高雄',ndhu:'東華',fcu:'逢甲',pccu:'文化 文大',
  nthu:'清大 清華',ntue:'北教大',tcu:'慈大 慈濟',ncnu:'暨大 暨南',mcu:'銘傳',cpu:'警大 中央警察',
  niu:'宜大 宜蘭',tnu:'東南',cmu:'中國醫 中醫大',isu:'義守',hcu:'玄奘',hdut:'宏國德霖',ctbctech:'中信科大',
};

const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu,'').replace(/臺/g,'台').toLocaleLowerCase();
/** Match words in any order, with subsequence matching for abbreviations. */
export function fuzzySiteMatch(query: string, text: string): boolean {
  const haystack = fold(text), words = fold(query).replace(/^https?:\/\//,'').trim().split(/\s+/);
  return words.every(word => {
    if (word === 'tw') return /\btw\b/.test(haystack);
    if (haystack.includes(word)) return true;
    if (word.length > 4) return false;
    let index = 0;
    for (const character of haystack) if (character === word[index]) index++;
    return index === word.length;
  });
}

/** Build searchable country names without contacting a directory service. */
export function countryNames(country: string | undefined): string {
  return country ? [country,...['en','zh-Hant','ja'].map(language => new Intl.DisplayNames([language],{type:'region'}).of(country)),...(country === 'TW' ? ['Taiwan','台灣','臺灣'] : [])].join(' ') : '';
}

/** Search every bundled translation and country name, regardless of the active app language. */
export function schoolSearchText(school: MoodleSchool): string {
  return [school.id,school.name,school.host,schoolAliases[school.id],...Object.values(school.localizedNames ?? {}),countryNames(school.country),
  ].join(' ');
}

/** Use initials for Latin names and two characters for names without spaces. */
export function schoolMonogram(name: string): string {
  const words = name.trim().split(/\s+/);
  return (words.length > 1 ? words.slice(0,2).map(word => Array.from(word)[0]).join('') : Array.from(name.trim()).slice(0,2).join('')).toLocaleUpperCase();
}

export function sortedSchools(schools: readonly MoodleSchool[], language: string, systemLanguage = language): MoodleSchool[] {
  const collator = new Intl.Collator(language);
  const taiwanFirst = [language,systemLanguage].some(locale => new Intl.Locale(locale).maximize().script === 'Hant');
  return [...schools].sort((a,b) => {
    if (taiwanFirst && (a.country === 'TW') !== (b.country === 'TW')) return a.country === 'TW' ? -1 : 1;
    return collator.compare(a.localizedNames?.[language] ?? a.name,b.localizedNames?.[language] ?? b.name);
  });
}
