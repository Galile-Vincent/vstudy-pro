import { describe, it, expect } from 'vitest';
import { resources, i18n, systemLanguage, pseudo } from './i18n';
const variables = (s: string) => [...s.matchAll(/{{\s*([^}]+)\s*}}/g)].map(m => m[1]).sort();
describe('locale contracts', () => {
  for (const locale of ['zh-Hant','ja'] as const) {
    it(`${locale} has identical keys, variables and valid plural categories`, () => {
      for (const ns of Object.keys(resources.en) as (keyof typeof resources.en)[]) {
        const reference = resources.en[ns], catalog = resources[locale][ns];
        expect(Object.keys(catalog).sort()).toEqual(Object.keys(reference).sort());
        for (const key of Object.keys(reference)) {
          const a = (reference as Record<string,string>)[key]!, b = (catalog as Record<string,string>)[key]!;
          expect(b.trim()).not.toBe(''); expect(variables(b),`${ns}:${key}`).toEqual(variables(a));
          const suffix = /_(zero|one|two|few|many|other)$/.exec(key)?.[1];
          if(suffix) expect(['zero','one',...new Intl.PluralRules(locale).resolvedOptions().pluralCategories]).toContain(suffix);
        }
      }
    });
  }
  it.each([['zh-TW','zh-Hant'],['zh-HK','zh-Hant'],['zh-Hant-TW','zh-Hant'],['ja-JP','ja'],['zh-CN','en'],['fr','en']])('maps %s to %s',(input,expected) => expect(systemLanguage(input)).toBe(expected));
  it('keeps interpolation intact in the expanded pseudo locale',()=>{ expect(pseudo('Hello {{name}}')).toContain('{{name}}');expect(pseudo('Hello').length).toBeGreaterThan(7); });
  it('resolves each namespace without falling back to its key',()=>{for(const lng of ['en','zh-Hant','ja'])expect(i18n.t('picker:import_title',{lng})).not.toBe('import_title');});
});
