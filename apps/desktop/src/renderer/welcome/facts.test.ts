import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { documentFormats } from '../../main/services/documents';
import { providerIdSchema } from '../../shared/domain';
import { resources } from '../../shared/i18n';
import { facts, INTERFACE_LANGUAGES, PROVIDER_KINDS, SUPPORTED_FILE_TYPES } from './facts';
it('derives the honest counts from shipped formats, providers and locale catalogs and detects claim drift', () => {
  expect(SUPPORTED_FILE_TYPES).toEqual([...new Set(Object.values(documentFormats))]);
  expect(PROVIDER_KINDS).toEqual(providerIdSchema.options);
  expect([...INTERFACE_LANGUAGES].sort()).toEqual(readdirSync('src/shared/locales').sort());
  expect(facts).toEqual({ formats: 8, providers: 6, languages: 3 });
});
it('cites the real sample heading in every locale', () => {
  for (const locale of ['en', 'zh-Hant', 'ja'] as const) {
    const source = readFileSync(`resources/samples/${locale}.md`, 'utf8');
    expect(source).toContain(`## ${resources[locale].welcome.demo_citation}`);
  }
});
