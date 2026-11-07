/**
 * Regression coverage for themes themes.
 * Owned by shared/themes.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
/** Theme validation and migration tests exercise externally visible settings guarantees. */
import { describe, it, expect } from 'vitest';
import { settingsSchema, defaultSettings } from '../domain';
import { adjustedTokens, builtinThemes, contrastFailures, importTheme, resolveTheme, themePackSchema, themePreferencesSchema } from './index';

const custom = () => ({ ...structuredClone(builtinThemes[1]!), id:'custom-sea',name:'My sea' });

describe('theme packs', () => {
  it('ships complete AA light and dark variants at all contrast levels', () => {
    expect(builtinThemes.length).toBeGreaterThanOrEqual(9);
    for (const theme of builtinThemes) for (const scheme of ['light','dark'] as const) for (let contrast=100;contrast<=150;contrast++) {
      expect(contrastFailures(adjustedTokens(theme[scheme],scheme,contrast)),`${theme.id}/${scheme}/${contrast}`).toEqual([]);
    }
  });
  it('loads old settings without discarding unrelated preferences', () => {
    const parsed=settingsSchema.parse({chatSide:'right',lastProviderId:null,lastModelId:null,accent:'green',readerFont:'serif'});
    expect(parsed).toMatchObject({themeId:'vstudy',colorScheme:'system',contrast:100,glassOpacity:80,customThemes:[],chatSide:'right',accent:'green',readerFont:'serif'});
  });
  it('round-trips portable JSON and custom settings', () => {
    const pack=importTheme(JSON.stringify(custom()));
    const settings=settingsSchema.parse({...defaultSettings,themeId:pack.id,customThemes:[pack],colorScheme:'dark',contrast:125,glassOpacity:95});
    expect(resolveTheme(settings)).toEqual(pack);
    expect(settingsSchema.parse(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  });
  it('rejects code, CSS injection, missing tokens, unknown fields, and oversized input', () => {
    for (const color of ['red','url(https://evil.invalid)','var(--ink)','#ffffff;display:none','rgb(0,0,0)']) {
      const pack=custom();pack.light.ink=color;
      expect(() => importTheme(JSON.stringify(pack))).toThrow();
    }
    const pack=custom();
    expect(themePackSchema.safeParse({...pack,script:'alert(1)'}).success).toBe(false);
    const missing: Partial<typeof pack.light>={...pack.light};
    delete missing.ink;
    expect(themePackSchema.safeParse({...pack,light:missing}).success).toBe(false);
    expect(() => importTheme(' '.repeat(32769))).toThrow();
    expect(() => importTheme('(()=>alert(1))()')).toThrow();
  });
  it('rejects duplicate IDs, reserved IDs, excessive themes, and invalid controls', () => {
    expect(() => importTheme(JSON.stringify(builtinThemes[0]))).toThrow();
    for (const patch of [{customThemes:[custom(),custom()]},{customThemes:[builtinThemes[0]]},{customThemes:Array.from({length:31},(_,i)=>({...custom(),id:`custom-${i}`}))},{contrast:99},{contrast:151},{glassOpacity:49},{glassOpacity:101},{colorScheme:'neon'}]) {
      expect(themePreferencesSchema.safeParse(patch).success).toBe(false);
    }
  });
  it('falls back after removal and reports contrast warnings on poor custom colors', () => {
    expect(resolveTheme({...defaultSettings,themeId:'missing'}).id).toBe('vstudy');
    const pack=custom();pack.light.ink=pack.light.surface;
    expect(contrastFailures(pack.light)).not.toEqual([]);
  });
});

it('defaults old settings to Soft and validates card transparency choices', () => {
  expect(themePreferencesSchema.parse({}).cardTransparency).toBe('soft');
  for (const cardTransparency of ['solid','soft','glass']) {
    expect(themePreferencesSchema.parse({cardTransparency}).cardTransparency).toBe(cardTransparency);
  }
  expect(themePreferencesSchema.safeParse({cardTransparency:'invisible'}).success).toBe(false);
});
